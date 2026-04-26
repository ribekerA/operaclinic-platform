import { NextRequest, NextResponse } from "next/server";
import {
  requestBackendWithSession,
  toJsonResponse,
} from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    professionalId: string;
  }>;
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { professionalId } = await context.params;
  const payload = await request.json().catch(() => null);

  const result = await requestBackendWithSession({
    method: "PATCH",
    path: `/professionals/${professionalId}`,
    body: payload,
  });

  return toJsonResponse(result);
}

