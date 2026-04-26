import type { SessionProfile } from "@/lib/session/types";

export const LEGACY_ACCESS_TOKEN_COOKIE = "oc_access_token";
export const LEGACY_REFRESH_TOKEN_COOKIE = "oc_refresh_token";

export function getAccessTokenCookieName(profile: SessionProfile): string {
  return profile === "platform"
    ? "oc_platform_access_token"
    : "oc_clinic_access_token";
}

export function getRefreshTokenCookieName(profile: SessionProfile): string {
  return profile === "platform"
    ? "oc_platform_refresh_token"
    : "oc_clinic_refresh_token";
}

export const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 15;
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
