import { NextRequest, NextResponse } from "next/server";
import {
  requestBackendWithSession,
  toJsonResponse,
} from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

interface ThreadRouteContext {
  params: Promise<{
    threadId: string;
  }>;
}

export async function PATCH(
  request: NextRequest,
  context: ThreadRouteContext,
): Promise<NextResponse> {
  const { threadId } = await context.params;
  const payload = await request.json().catch(() => null);

  const result = await requestBackendWithSession({
    method: "PATCH",
    path: `/messaging/threads/${threadId}/patient`,
    body: payload,
  });

  return toJsonResponse(result);
}
