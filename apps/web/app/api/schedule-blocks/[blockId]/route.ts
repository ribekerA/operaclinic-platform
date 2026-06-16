import { NextRequest, NextResponse } from "next/server";
import { requestBackendWithSession, toJsonResponse } from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ blockId: string }> },
): Promise<NextResponse> {
  const { blockId } = await params;
  const payload = await request.json().catch(() => null);

  const result = await requestBackendWithSession({
    method: "PATCH",
    path: `/schedule-blocks/${blockId}`,
    body: payload,
  });

  return toJsonResponse(result);
}
