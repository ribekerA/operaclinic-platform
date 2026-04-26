import { NextRequest, NextResponse } from "next/server";
import {
  requestBackendWithSession,
  toJsonResponse,
} from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = await requestBackendWithSession({
    method: "GET",
    path: "/integrations",
  });

  return toJsonResponse(result);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const payload = await request.json().catch(() => null);

  const result = await requestBackendWithSession({
    method: "POST",
    path: "/integrations",
    body: payload,
  });

  return toJsonResponse(result);
}
