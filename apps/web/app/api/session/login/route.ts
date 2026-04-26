import { NextRequest, NextResponse } from "next/server";
import {
  getSessionCookieStore,
  requestBackendPublic,
  setSessionCookies,
  toJsonResponse,
} from "@/lib/server/backend-session";
import { AuthResponsePayload, LoginRequestPayload } from "@/lib/session/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const payload = (await request.json().catch(() => null)) as LoginRequestPayload | null;

  const result = await requestBackendPublic({
    method: "POST",
    path: "/auth/login",
    body: payload,
  });

  if (result.status >= 200 && result.status < 300) {
    const authPayload = result.data as AuthResponsePayload;
    setSessionCookies(
      await getSessionCookieStore(),
      authPayload.user.profile,
      authPayload,
    );
  }

  return toJsonResponse(result);
}
