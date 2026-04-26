import type {
  AuthResponsePayload,
  LoginRequestPayload,
  SessionMePayload,
} from "@operaclinic/shared";

const DEFAULT_WEB_BASE_URL =
  process.env.SMOKE_E2E_WEB_BASE_URL?.trim() || "http://localhost:3000";

export interface BrowserJsonResponse<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
}

interface BrowserRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: URLSearchParams | Record<string, string | number | boolean | undefined | null>;
}

function normalizeQuery(
  query: BrowserRequestOptions["query"],
): string {
  if (!query) {
    return "";
  }

  if (query instanceof URLSearchParams) {
    return query.toString();
  }

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }

    searchParams.set(key, String(value));
  }

  return searchParams.toString();
}

function parseJsonBody(raw: string): unknown {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function isCookieDeletion(rawCookie: string, value: string): boolean {
  return (
    value.length === 0 ||
    /(?:^|;)\s*max-age=0(?:;|$)/i.test(rawCookie) ||
    /(?:^|;)\s*expires=thu,\s*01 jan 1970/i.test(rawCookie)
  );
}

function extractSetCookieHeaders(headers: Headers): string[] {
  const headerStore = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headerStore.getSetCookie === "function") {
    return headerStore.getSetCookie();
  }

  const singleHeader = headers.get("set-cookie");
  return singleHeader ? [singleHeader] : [];
}

export class BrowserSession {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly baseUrl = DEFAULT_WEB_BASE_URL) {}

  async requestJson<T = unknown>(
    path: string,
    options: BrowserRequestOptions = {},
  ): Promise<BrowserJsonResponse<T>> {
    const headers = new Headers();
    const queryString = normalizeQuery(options.query);
    const url = new URL(path, this.baseUrl);

    if (queryString) {
      url.search = queryString;
    }

    if (this.cookies.size > 0) {
      headers.set(
        "cookie",
        [...this.cookies.entries()]
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
      );
    }

    let body: string | undefined;

    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
    });

    this.captureCookies(response.headers);

    const raw = await response.text();

    return {
      status: response.status,
      data: parseJsonBody(raw) as T,
      headers: response.headers,
    };
  }

  async login(
    payload: LoginRequestPayload,
  ): Promise<BrowserJsonResponse<AuthResponsePayload>> {
    return this.requestJson<AuthResponsePayload>("/api/session/login", {
      method: "POST",
      body: payload,
    });
  }

  async sessionMe(
    profile: "clinic" | "platform",
  ): Promise<BrowserJsonResponse<SessionMePayload>> {
    return this.requestJson<SessionMePayload>("/api/session/me", {
      query: { profile },
    });
  }

  private captureCookies(headers: Headers): void {
    for (const rawCookie of extractSetCookieHeaders(headers)) {
      const firstSegment = rawCookie.split(";", 1)[0];
      const separatorIndex = firstSegment.indexOf("=");

      if (separatorIndex <= 0) {
        continue;
      }

      const name = firstSegment.slice(0, separatorIndex).trim();
      const value = firstSegment.slice(separatorIndex + 1).trim();

      if (isCookieDeletion(rawCookie, value)) {
        this.cookies.delete(name);
        continue;
      }

      this.cookies.set(name, value);
    }
  }
}
