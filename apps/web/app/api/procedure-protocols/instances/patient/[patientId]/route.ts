import { NextRequest, NextResponse } from "next/server";
import {
  requestBackendWithSession,
  toJsonResponse,
} from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ patientId: string }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { patientId } = await context.params;

  const result = await requestBackendWithSession({
    method: "GET",
    path: `/procedure-protocols/instances/patient/${patientId}`,
  });

  return toJsonResponse(result);
}
