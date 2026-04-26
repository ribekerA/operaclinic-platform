import { NextRequest, NextResponse } from "next/server";
import {
  requestBackendWithSession,
  toJsonResponse,
} from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    userId: string;
  }>;
}

export async function PATCH(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { userId } = await context.params;
  const result = await requestBackendWithSession({
    method: "PATCH",
    path: `/users/${userId}/reactivate`,
  });

  return toJsonResponse(result);
}
