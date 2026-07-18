import { SetMetadata } from "@nestjs/common";
import type { PlanFeatureKey } from "../../common/plan-entitlements/plan-entitlements.service";

export const PLAN_FEATURE_KEY = "planFeature";
export const RequirePlanFeature = (feature: PlanFeatureKey) =>
  SetMetadata(PLAN_FEATURE_KEY, feature);
