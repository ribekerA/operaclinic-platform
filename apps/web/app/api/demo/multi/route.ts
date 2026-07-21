import { NextRequest, NextResponse } from "next/server";
import {
  requestBackendPublic,
  toJsonResponse,
} from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null);

  const result = await requestBackendPublic({
    method: "POST",
    path: "/demo/multi",
    body,
  });

  return toJsonResponse(result);
}
