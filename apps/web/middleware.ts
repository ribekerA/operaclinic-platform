import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenCookieName } from "@/lib/session/constants";
import { resolveRouteRedirect, SessionRouteSnapshot } from "@/lib/session-route-policy";

type DecodedSessionToken = SessionRouteSnapshot;

function decodeSessionFromToken(token: string): DecodedSessionToken | null {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
      profile?: string;
      roles?: unknown;
    };

    if (payload.profile === "platform" || payload.profile === "clinic") {
      return {
        profile: payload.profile,
        roles: Array.isArray(payload.roles)
          ? payload.roles.filter((role): role is string => typeof role === "string")
          : [],
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;
  const profile = pathname.startsWith("/platform") ? "platform" : "clinic";
  const token = request.cookies.get(getAccessTokenCookieName(profile))?.value;
  const session = token ? decodeSessionFromToken(token) : null;
  const redirectPath = resolveRouteRedirect(pathname, token && session ? session : null);

  if (redirectPath) {
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/platform/:path*", "/clinic/:path*"],
};
