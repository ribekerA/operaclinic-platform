"use client";

import { useMemo } from "react";
import { getNavigationByProfile, NavigationItem, UserProfile } from "@/lib/navigation";

export function useProfileNavigation(profile: UserProfile, roles?: string[]): NavigationItem[] {
  return useMemo(() => getNavigationByProfile(profile, roles), [profile, roles]);
}
