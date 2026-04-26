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

export async function POST(
  request: NextRequest,
  context: ThreadRouteContext,
): Promise<NextResponse> {
  const { threadId } = await context.params;
  const payload = await request.json().catch(() => null);

  const result = await requestBackendWithSession({
    method: "POST",
    path: `/messaging/threads/${threadId}/messages`,
    body: payload,
  });

  return toJsonResponse(result);
}
