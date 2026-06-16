import { NextResponse } from "next/server";
import {
  requestBackendWithSession,
  toJsonResponse,
} from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = await requestBackendWithSession({
    method: "GET",
    path: "/messaging/appointment-follow-ups/stats",
  });

  return toJsonResponse(result);
}
