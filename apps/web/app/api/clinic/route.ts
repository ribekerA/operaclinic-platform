import { NextRequest, NextResponse } from "next/server";
import {
  requestBackendWithSession,
  toJsonResponse,
} from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = await requestBackendWithSession({
    method: "GET",
    path: "/clinic",
  });

  return toJsonResponse(result);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const payload = await request.json().catch(() => null);

  const result = await requestBackendWithSession({
    method: "PATCH",
    path: "/clinic",
    body: payload,
  });

  return toJsonResponse(result);
}

