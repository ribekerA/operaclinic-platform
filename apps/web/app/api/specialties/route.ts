import { NextRequest, NextResponse } from "next/server";
import {
  requestBackendWithSession,
  toJsonResponse,
} from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const result = await requestBackendWithSession({
    method: "GET",
    path: "/specialties",
    queryString: request.nextUrl.searchParams.toString(),
  });

  return toJsonResponse(result);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const payload = await request.json().catch(() => null);

  const result = await requestBackendWithSession({
    method: "POST",
    path: "/specialties",
    body: payload,
  });

  return toJsonResponse(result);
}

