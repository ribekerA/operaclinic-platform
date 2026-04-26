import { NextRequest, NextResponse } from "next/server";
import {
  requestBackendPublic,
  toJsonResponse,
} from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const result = await requestBackendPublic({
    method: "GET",
    path: "/commercial/plans",
    queryString: request.nextUrl.searchParams.toString(),
  });

  return toJsonResponse(result);
}
