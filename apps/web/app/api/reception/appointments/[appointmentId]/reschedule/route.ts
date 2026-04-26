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

export async function PATCH(
  request: Request,
  context: AppointmentRouteContext,
): Promise<NextResponse> {
  const payload = await request.json().catch(() => null);
  const { appointmentId } = await context.params;

  const result = await requestBackendWithSession({
    method: "PATCH",
    path: `/reception/appointments/${appointmentId}/reschedule`,
    body: payload,
  });

  return toJsonResponse(result);
}
