import { NextResponse } from "next/server";
import {
  requestBackendWithSession,
  toJsonResponse,
} from "@/lib/server/backend-session";

interface PatientRouteContext {
  params: Promise<{
    patientId: string;
  }>;
}

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: PatientRouteContext,
): Promise<NextResponse> {
  const { patientId } = await context.params;

  const result = await requestBackendWithSession({
    method: "GET",
    path: `/professional-workspace/patients/${patientId}/summary`,
  });

  return toJsonResponse(result);
}
