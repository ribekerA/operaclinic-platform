import { NextResponse } from "next/server";
import {
  requestBackendWithSession,
  toJsonResponse,
} from "@/lib/server/backend-session";

interface AppointmentRouteContext {
  params: Promise<{
    appointmentId: string;
  }>;
}

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: AppointmentRouteContext,
): Promise<NextResponse> {
  const { appointmentId } = await context.params;

  const result = await requestBackendWithSession({
    method: "GET",
    path: `/reception/appointments/${appointmentId}`,
  });

  return toJsonResponse(result);
}
