import { NextRequest, NextResponse } from "next/server";
import {
  requestBackendWithSession,
  toJsonResponse,
} from "@/lib/server/backend-session";
import type { SessionProfile } from "@/lib/session/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const profile = request.nextUrl.searchParams.get("profile");
  const result = await requestBackendWithSession({
    method: "GET",
    path: "/auth/me",
    profile:
      profile === "platform" || profile === "clinic"
        ? (profile satisfies SessionProfile)
        : undefined,
  });

  return toJsonResponse(result);
}
