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

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { onboardingToken } = await context.params;
  const queryString = request.nextUrl.searchParams.toString();

  const result = await requestBackendPublic({
    method: "POST",
    path: `/commercial/onboarding/${onboardingToken}/confirm-checkout`,
    queryString,
  });

  return toJsonResponse(result);
}
