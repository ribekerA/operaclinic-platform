import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  applyPlanFeatureOverrides,
  getPlanFeatures,
  type PlanFeatureOverrides,
  type PlanFeatureSet,
  type PlanLimitOverrides,
  type PlanLimits,
} from "@operaclinic/shared";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../audit/audit.constants";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import {
  OPEN_SUBSCRIPTION_STATUSES,
  PLAN_LIMIT_OVERRIDE_SETTING_PREFIX,
  PLAN_LIMIT_UNLIMITED_VALUE,
} from "./plan-entitlements.constants";

/** Only the plan features whose type is a genuine `boolean` (differentiator features per D-013)
 *  are overridable/gateable — the `true`-literal ones (e.g. `whatsappChannel`) are always on for
 *  every commercial plan and are intentionally excluded from this key set. */
type OverridableFeatureKey<T> = {
  [K in keyof T]-?: boolean extends T[K] ? K : never;
}[keyof T];

export type PlanFeatureKey = OverridableFeatureKey<Omit<PlanFeatureSet, "limits">>;
export type PlanLimitKey = keyof PlanLimits;

const BOOLEAN_FEATURE_KEYS: PlanFeatureKey[] = [
  "scheduleOverride",
  "waitlist",
  "messagingTemplates",
  "operationalKpis",
  "executiveDashboard",
  "procedureProtocols",
  "multiUnit",
];

const LIMIT_KEYS: PlanLimitKey[] = ["maxProfessionals", "maxUnits", "monthlyAiConversations"];

/** Fallback plan applied to a tenant with no open (TRIAL/ACTIVE/PAST_DUE) subscription — the most
 *  restrictive commercial tier, never the most permissive, so a lapsed/canceled tenant never
 *  retains premium access by omission. */
const FALLBACK_PLAN_CODE = "ESTETICA_START";

export interface AiConversationQuotaResult {
  allowed: boolean;
  limit: number | null;
  usedThisMonth: number;
}

/**
 * Single source of truth for resolving a tenant's *effective* plan entitlements (base commercial
 * plan from packages/shared/src/plan-features.ts, composed with per-tenant overrides persisted in
 * TenantFeature/TenantSetting) and for enforcing them at runtime. See docs/decisions.md D-013/D-014.
 */
@Injectable()
export class PlanEntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async resolvePlanCode(tenantId: string): Promise<string | null> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId, status: { in: OPEN_SUBSCRIPTION_STATUSES } },
      orderBy: { startsAt: "desc" },
      include: { plan: true },
    });

    return subscription?.plan.code ?? null;
  }

  /** Resolves the tenant's effective PlanFeatureSet: base plan (with BASE_MVP alias resolved by
   *  getPlanFeatures) composed with any per-tenant overrides. */
  async getEffectiveFeatures(tenantId: string): Promise<PlanFeatureSet> {
    const planCode = await this.resolvePlanCode(tenantId);
    const base =
      (planCode ? getPlanFeatures(planCode) : null) ?? getPlanFeatures(FALLBACK_PLAN_CODE)!;

    const [featureOverrideRows, limitOverrideRows] = await Promise.all([
      this.prisma.tenantFeature.findMany({
        where: { tenantId, key: { in: BOOLEAN_FEATURE_KEYS } },
        select: { key: true, enabled: true },
      }),
      this.prisma.tenantSetting.findMany({
        where: {
          tenantId,
          key: { in: LIMIT_KEYS.map((key) => `${PLAN_LIMIT_OVERRIDE_SETTING_PREFIX}${key}`) },
        },
        select: { key: true, value: true },
      }),
    ]);

    const featureOverrides: PlanFeatureOverrides = {};
    for (const row of featureOverrideRows) {
      featureOverrides[row.key as PlanFeatureKey] = row.enabled;
    }

    const limitOverrides: PlanLimitOverrides = {};
    for (const row of limitOverrideRows) {
      const limitKey = row.key.slice(PLAN_LIMIT_OVERRIDE_SETTING_PREFIX.length) as PlanLimitKey;
      limitOverrides[limitKey] =
        row.value === PLAN_LIMIT_UNLIMITED_VALUE ? null : Number.parseInt(row.value, 10);
    }

    return applyPlanFeatureOverrides(base, featureOverrides, limitOverrides);
  }

  /** Throws a semantic 403 (error: "PLAN_FEATURE_NOT_AVAILABLE") if the tenant's effective plan
   *  does not include `feature`. Records a PLAN_FEATURE_BLOCKED audit event on block. */
  async assertFeatureEnabled(
    tenantId: string,
    feature: PlanFeatureKey,
    actor: AuthenticatedUser,
  ): Promise<PlanFeatureSet> {
    const features = await this.getEffectiveFeatures(tenantId);

    if (!features[feature]) {
      await this.auditService.record({
        action: AUDIT_ACTIONS.PLAN_FEATURE_BLOCKED,
        actor,
        tenantId,
        targetType: "plan_feature",
        targetId: feature,
        metadata: { feature },
      });

      throw new ForbiddenException({
        error: "PLAN_FEATURE_NOT_AVAILABLE",
        feature,
        message: `O plano contratado não inclui o recurso "${feature}".`,
      });
    }

    return features;
  }

  /** Throws a semantic 403 (error: "PLAN_LIMIT_REACHED") if `currentCount` has already reached the
   *  tenant's effective limit for `limitKey`. A `null` limit means unlimited. Records a
   *  PLAN_LIMIT_REACHED audit event on block. */
  async assertWithinLimit(
    tenantId: string,
    limitKey: PlanLimitKey,
    currentCount: number,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const features = await this.getEffectiveFeatures(tenantId);
    const limit = features.limits[limitKey];

    if (limit !== null && currentCount >= limit) {
      await this.auditService.record({
        action: AUDIT_ACTIONS.PLAN_LIMIT_REACHED,
        actor,
        tenantId,
        targetType: "plan_limit",
        targetId: limitKey,
        metadata: { limitKey, limit, currentCount },
      });

      throw new ForbiddenException({
        error: "PLAN_LIMIT_REACHED",
        limitKey,
        limit,
        message: `Limite do plano contratado atingido para "${limitKey}" (máximo: ${limit}).`,
      });
    }
  }

  /**
   * Checks whether starting/continuing an AI-agent conversation on `threadId` is within the
   * tenant's monthly quota. "1 conversation" = 1 distinct MessageThread with at least one
   * AgentExecution row in the current calendar month (see docs/decisions.md D-014). A thread
   * already counted this month is always allowed to continue — only a *new* thread's first
   * agent-execution this month is checked against the quota.
   */
  async checkAiConversationQuota(
    tenantId: string,
    threadId: string,
  ): Promise<AiConversationQuotaResult> {
    const features = await this.getEffectiveFeatures(tenantId);
    const limit = features.limits.monthlyAiConversations;

    if (limit === null) {
      return { allowed: true, limit: null, usedThisMonth: 0 };
    }

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const activeThreadsThisMonth = await this.prisma.agentExecution.findMany({
      where: { tenantId, startedAt: { gte: startOfMonth } },
      distinct: ["threadId"],
      select: { threadId: true },
    });

    const countedThreadIds = new Set(activeThreadsThisMonth.map((row) => row.threadId));
    const usedThisMonth = countedThreadIds.size;

    if (countedThreadIds.has(threadId)) {
      // Continuing a conversation already counted this month never gets newly blocked mid-flow.
      return { allowed: true, limit, usedThisMonth };
    }

    return { allowed: usedThisMonth < limit, limit, usedThisMonth };
  }
}
