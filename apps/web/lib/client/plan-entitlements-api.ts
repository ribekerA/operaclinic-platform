import type { PlanEntitlementsSummary } from "@operaclinic/shared";
import { ApiRequestError, requestJson } from "@/lib/client/http";

export async function getPlanEntitlementsSummary(): Promise<PlanEntitlementsSummary> {
  return requestJson<PlanEntitlementsSummary>("/api/clinic/plan-entitlements");
}

export interface PlanUpsellInfo {
  kind: "feature" | "limit";
  key: string;
  message: string;
}

/** Detects a PLAN_FEATURE_NOT_AVAILABLE/PLAN_LIMIT_REACHED 403 (thrown by PlanEntitlementsService,
 *  see apps/api/src/common/plan-entitlements) so pages can render an upgrade CTA instead of a
 *  generic error banner. Returns null for any other error shape. */
export function getPlanUpsellInfo(error: unknown): PlanUpsellInfo | null {
  if (!(error instanceof ApiRequestError) || error.status !== 403) {
    return null;
  }

  const payload = error.payload;

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const code = (payload as Record<string, unknown>).error;

  if (code === "PLAN_FEATURE_NOT_AVAILABLE") {
    const feature = (payload as Record<string, unknown>).feature;
    return {
      kind: "feature",
      key: typeof feature === "string" ? feature : "recurso",
      message: error.message,
    };
  }

  if (code === "PLAN_LIMIT_REACHED") {
    const limitKey = (payload as Record<string, unknown>).limitKey;
    return {
      kind: "limit",
      key: typeof limitKey === "string" ? limitKey : "limite",
      message: error.message,
    };
  }

  return null;
}
