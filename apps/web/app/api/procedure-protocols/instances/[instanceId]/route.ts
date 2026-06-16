import { NextRequest, NextResponse } from "next/server";
import {
  requestBackendWithSession,
  toJsonResponse,
} from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ instanceId: string }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { instanceId } = await context.params;

  const result = await requestBackendWithSession({
    method: "GET",
    path: `/procedure-protocols/instances/${instanceId}`,
  });

  return toJsonResponse(result);
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { instanceId } = await context.params;
  const payload = await request.json().catch(() => null);

  const result = await requestBackendWithSession({
    method: "PATCH",
    path: `/procedure-protocols/instances/${instanceId}`,
    body: payload,
  });

  return toJsonResponse(result);
}
