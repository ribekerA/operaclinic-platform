import { NextResponse } from "next/server";
import {
  clearSessionCookies,
  getSessionCookieStore,
} from "@/lib/server/backend-session";
import type { SessionProfile } from "@/lib/session/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const profile = request.url.includes("profile=platform")
    ? "platform"
    : "clinic";
  clearSessionCookies(await getSessionCookieStore(), profile satisfies SessionProfile);

  return NextResponse.json({ ok: true });
}
