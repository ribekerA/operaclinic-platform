import { NextRequest, NextResponse } from "next/server";
import {
  requestBackendWithSession,
  toJsonResponse,
} from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

interface HandoffRouteContext {
  params: Promise<{
    handoffId: string;
  }>;
}

export async function PATCH(
  request: NextRequest,
  context: HandoffRouteContext,
): Promise<NextResponse> {
  const { handoffId } = await context.params;
  const payload = await request.json().catch(() => null);

  const result = await requestBackendWithSession({
    method: "PATCH",
    path: `/messaging/handoffs/${handoffId}/close`,
    body: payload,
  });

  return toJsonResponse(result);
}
