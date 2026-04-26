import { NextRequest, NextResponse } from "next/server";
import {
  requestBackendWithSession,
  toJsonResponse,
} from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const result = await requestBackendWithSession({
    method: "GET",
    path: "/reception/dashboard",
    queryString: request.nextUrl.searchParams.toString(),
  });

  return toJsonResponse(result);
}
