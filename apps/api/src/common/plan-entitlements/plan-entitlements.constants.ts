import { SubscriptionStatus } from "@prisma/client";

/**
 * Mirrors SubscriptionsService.OPEN_STATUSES (apps/api/src/modules/platform/subscriptions.service.ts).
 * Kept as an independent copy here so PlanEntitlementsService (a @Global module used across the
 * whole app) does not need to import PlatformModule, avoiding cross-module wiring/circular-dependency
 * risk for a value that changes rarely.
 */
export const OPEN_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];

/** Prefix used for TenantSetting rows that override a numeric plan limit for a tenant. */
export const PLAN_LIMIT_OVERRIDE_SETTING_PREFIX = "planLimit.";

/** Sentinel TenantSetting value meaning "no limit" (maps to `null`, i.e. unlimited). */
export const PLAN_LIMIT_UNLIMITED_VALUE = "unlimited";
