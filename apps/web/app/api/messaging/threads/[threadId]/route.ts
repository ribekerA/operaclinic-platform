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

export async function GET(
  _request: NextRequest,
  context: ThreadRouteContext,
): Promise<NextResponse> {
  const { threadId } = await context.params;
  const result = await requestBackendWithSession({
    method: "GET",
    path: `/messaging/threads/${threadId}`,
  });

  return toJsonResponse(result);
}
