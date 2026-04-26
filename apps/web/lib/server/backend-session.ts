import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AuthResponsePayload, RefreshTokenRequestPayload } from "@/lib/session/types";
import {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  getAccessTokenCookieName,
  getRefreshTokenCookieName,
  LEGACY_ACCESS_TOKEN_COOKIE,
  LEGACY_REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
} from "@/lib/session/constants";
import type { SessionProfile } from "@/lib/session/types";

interface SessionCookieStore {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options?: Record<string, unknown>): void;
  delete(name: string): void;
}

interface BackendRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  queryString?: string;
  profile?: SessionProfile;
}

interface BackendRequestResult {
  status: number;
  data: unknown;
}

function getBackendBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is required for the web backend session proxy.");
  }

  let parsed: URL;

  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be an absolute http(s) URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must use http or https.");
  }

  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must use https in production.");
  }

  return parsed.toString().replace(/\/$/, "");
}

function buildBackendUrl(path: string, queryString?: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const querySuffix = queryString ? `?${queryString}` : "";

  return `${getBackendBaseUrl()}${normalizedPath}${querySuffix}`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const raw = await response.text();

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { message: raw };
  }
}

function getCookieOptions(maxAge: number): Record<string, unknown> {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

export async function getSessionCookieStore(): Promise<SessionCookieStore> {
  return (await cookies()) as unknown as SessionCookieStore;
}

function clearLegacySessionCookies(cookieStore: SessionCookieStore): void {
  cookieStore.delete(LEGACY_ACCESS_TOKEN_COOKIE);
  cookieStore.delete(LEGACY_REFRESH_TOKEN_COOKIE);
}

export function setSessionCookies(
  cookieStore: SessionCookieStore,
  profile: SessionProfile,
  payload: AuthResponsePayload,
): void {
  cookieStore.set(
    getAccessTokenCookieName(profile),
    payload.accessToken,
    getCookieOptions(ACCESS_TOKEN_MAX_AGE_SECONDS),
  );
  cookieStore.set(
    getRefreshTokenCookieName(profile),
    payload.refreshToken,
    getCookieOptions(REFRESH_TOKEN_MAX_AGE_SECONDS),
  );
  clearLegacySessionCookies(cookieStore);
}

export function clearSessionCookies(
  cookieStore: SessionCookieStore,
  profile: SessionProfile,
): void {
  cookieStore.delete(getAccessTokenCookieName(profile));
  cookieStore.delete(getRefreshTokenCookieName(profile));
  clearLegacySessionCookies(cookieStore);
}

function resolveSessionProfile(options: BackendRequestOptions): SessionProfile {
  if (options.profile) {
    return options.profile;
  }

  if (options.path.startsWith("/platform/")) {
    return "platform";
  }

  return "clinic";
}

async function backendFetch(
  accessToken: string | null,
  options: BackendRequestOptions,
): Promise<Response> {
  const headers = new Headers();

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(buildBackendUrl(options.path, options.queryString), {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
}

async function refreshSession(
  cookieStore: SessionCookieStore,
  profile: SessionProfile,
): Promise<AuthResponsePayload | null> {
  const refreshToken =
    cookieStore.get(getRefreshTokenCookieName(profile))?.value ?? null;

  if (!refreshToken) {
    return null;
  }

  const refreshResponse = await fetch(buildBackendUrl("/auth/refresh"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refreshToken,
    } satisfies RefreshTokenRequestPayload),
    cache: "no-store",
  });

  if (!refreshResponse.ok) {
    clearSessionCookies(cookieStore, profile);
    return null;
  }

  const refreshPayload = (await parseResponseBody(
    refreshResponse,
  )) as AuthResponsePayload;

  setSessionCookies(cookieStore, profile, refreshPayload);

  return refreshPayload;
}

export async function requestBackendWithSession(
  options: BackendRequestOptions,
): Promise<BackendRequestResult> {
  const profile = resolveSessionProfile(options);
  const cookieStore = await getSessionCookieStore();
  let accessToken =
    cookieStore.get(getAccessTokenCookieName(profile))?.value ?? null;

  let response = await backendFetch(accessToken, options);

  if (response.status === 401) {
    const refreshed = await refreshSession(cookieStore, profile);

    if (refreshed) {
      accessToken = refreshed.accessToken;
      response = await backendFetch(accessToken, options);
    }
  }

  const data = await parseResponseBody(response);

  if (response.status === 401) {
    clearSessionCookies(cookieStore, profile);
  }

  return {
    status: response.status,
    data,
  };
}

export async function requestBackendPublic(
  options: BackendRequestOptions,
): Promise<BackendRequestResult> {
  const response = await fetch(buildBackendUrl(options.path, options.queryString), {
    method: options.method ?? "GET",
    headers:
      options.body === undefined
        ? undefined
        : {
            "Content-Type": "application/json",
          },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  const data = await parseResponseBody(response);

  return {
    status: response.status,
    data,
  };
}

export function toJsonResponse(result: BackendRequestResult): NextResponse {
  return NextResponse.json(result.data ?? {}, { status: result.status });
}
