import { NextRequest, NextResponse } from "next/server";
import {
  requestBackendPublic,
  toJsonResponse,
} from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { slug } = await context.params;
  const body = await request.json().catch(() => null);

  const result = await requestBackendPublic({
    method: "POST",
    path: `/demo/multi/${slug}/notify-founder`,
    body,
  });

  return toJsonResponse(result);
}
