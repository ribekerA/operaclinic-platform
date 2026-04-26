import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookies,
  getSessionCookieStore,
  requestBackendWithSession,
  toJsonResponse,
} from "@/lib/server/backend-session";
import type { SessionProfile } from "@/lib/session/types";

export const dynamic = "force-dynamic";

function resolveProfile(value: string | null): SessionProfile {
  return value === "platform" ? "platform" : "clinic";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const profile = resolveProfile(request.nextUrl.searchParams.get("profile"));
  const payload = await request.json().catch(() => null);
  const result = await requestBackendWithSession({
    method: "POST",
    path: "/auth/change-password",
    body: payload,
    profile,
  });

  if (result.status >= 200 && result.status < 300) {
    const cookieStore = await getSessionCookieStore();
    clearSessionCookies(cookieStore, profile);
  }

  return toJsonResponse(result);
}
