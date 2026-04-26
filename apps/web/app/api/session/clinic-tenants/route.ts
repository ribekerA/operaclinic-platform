import { NextRequest, NextResponse } from "next/server";
import { requestBackendPublic, toJsonResponse } from "@/lib/server/backend-session";
import { ResolveClinicTenantsRequestPayload } from "@/lib/session/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const payload =
    (await request.json().catch(() => null)) as ResolveClinicTenantsRequestPayload | null;

  const result = await requestBackendPublic({
    method: "POST",
    path: "/auth/clinic-tenants",
    body: payload,
  });

  return toJsonResponse(result);
}
