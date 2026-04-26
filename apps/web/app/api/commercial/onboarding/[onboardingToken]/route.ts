import { NextRequest, NextResponse } from "next/server";
import {
  requestBackendPublic,
  toJsonResponse,
} from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    onboardingToken: string;
  }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { onboardingToken } = await context.params;

  const result = await requestBackendPublic({
    method: "GET",
    path: `/commercial/onboarding/${onboardingToken}`,
  });

  return toJsonResponse(result);
}
