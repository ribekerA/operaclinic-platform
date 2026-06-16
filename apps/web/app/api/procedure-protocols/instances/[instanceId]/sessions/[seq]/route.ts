import { NextRequest, NextResponse } from "next/server";
import {
  requestBackendWithSession,
  toJsonResponse,
} from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ instanceId: string; seq: string }>;
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { instanceId, seq } = await context.params;
  const payload = await request.json().catch(() => null);

  const result = await requestBackendWithSession({
    method: "PATCH",
    path: `/procedure-protocols/instances/${instanceId}/sessions/${seq}`,
    body: payload,
  });

  return toJsonResponse(result);
}
