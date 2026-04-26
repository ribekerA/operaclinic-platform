import { NextResponse } from "next/server";
import { requestBackendPublic, toJsonResponse } from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = await requestBackendPublic({
    method: "GET",
    path: "/health/readiness",
  });

  return toJsonResponse(result);
}
