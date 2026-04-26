import { NextRequest, NextResponse } from "next/server";
import {
  getSessionCookieStore,
  requestBackendWithSession,
  setSessionCookies,
  toJsonResponse,
} from "@/lib/server/backend-session";
import { AuthResponsePayload, SwitchClinicRequestPayload } from "@/lib/session/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const payload =
    (await request.json().catch(() => null)) as SwitchClinicRequestPayload | null;

  const result = await requestBackendWithSession({
    method: "POST",
    path: "/auth/switch-clinic",
    body: payload,
    profile: "clinic",
  });

  if (result.status >= 200 && result.status < 300) {
    setSessionCookies(
      await getSessionCookieStore(),
      "clinic",
      result.data as AuthResponsePayload,
    );
  }

  return toJsonResponse(result);
}
