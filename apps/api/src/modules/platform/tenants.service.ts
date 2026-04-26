import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  SubscriptionStatus,
  TenantStatus,
} from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { ChangeTenantPlanDto } from "./dto/change-tenant-plan.dto";
import { CancelTenantSubscriptionDto } from "./dto/cancel-tenant-subscription.dto";
import { CreateTenantDto } from "./dto/create-tenant.dto";
import { GrantReferralBonusDto } from "./dto/grant-referral-bonus.dto";
import { ListTenantsQueryDto } from "./dto/list-tenants-query.dto";
import { UpdateTenantDto } from "./dto/update-tenant.dto";
import { TenantSummaryResponse } from "./interfaces/tenant-summary.response";
import { SubscriptionsService } from "./subscriptions.service";
import { TenantSettingsService } from "./tenant-settings.service";

@Injectable()
export class TenantsService {
  private static readonly BASE_PLAN_CODE = "BASE_MVP";
  private static readonly DUNNING_SUSPEND_AFTER_DAYS = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly tenantSettingsService: TenantSettingsService,
  ) {}

  async listTenants(query: ListTenantsQueryDto): Promise<TenantSummaryResponse[]> {
    const where: Prisma.TenantWhereInput = {};

    if (query.status) {
      where.status = this.parseTenantStatus(query.status);
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ];
    }

    const tenants = await this.prisma.tenant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        tenantSettings: true,
        subscriptions: {
          where: {
            status: {
              in: this.subscriptionsService.getOpenStatuses(),
            },
          },
          orderBy: { startsAt: "desc" },
          take: 1,
          include: {
            plan: true,
          },
        },
      },
    });

    return tenants.map((tenant) => this.mapTenantSummary(tenant));
  }

  async createTenant(
    input: CreateTenantDto,
    actor: AuthenticatedUser,
  ): Promise<TenantSummaryResponse> {
    const slug = this.normalizeSlug(input.slug);
    const name = input.name?.trim();

    if (!name) {
      throw new BadRequestException("name is required.");
    }

    const timezone = input.timezone?.trim() || "America/Sao_Paulo";
    const initialSettings = this.tenantSettingsService.buildInitialSettings(input.settings);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const basePlan = await tx.plan.findFirst({
          where: {
            code: TenantsService.BASE_PLAN_CODE,
            isActive: true,
          },
        });

        if (!basePlan) {
          throw new BadRequestException(
            `Base plan '${TenantsService.BASE_PLAN_CODE}' not found or inactive.`,
          );
        }

        const createdTenant = await tx.tenant.create({
          data: {
            slug,
            name,
            timezone,
            status: TenantStatus.ACTIVE,
          },
        });

        await this.tenantSettingsService.upsertMany(
          createdTenant.id,
          initialSettings,
          tx,
        );

        await this.subscriptionsService.createActiveSubscription(
          createdTenant.id,
          basePlan.id,
          tx,
        );

        const tenantWithRelations = await tx.tenant.findUniqueOrThrow({
          where: { id: createdTenant.id },
          include: {
            tenantSettings: true,
            subscriptions: {
              where: {
                status: {
                  in: this.subscriptionsService.getOpenStatuses(),
                },
              },
              orderBy: { startsAt: "desc" },
              take: 1,
              include: {
                plan: true,
              },
            },
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.TENANT_CREATED,
            actor,
            tenantId: createdTenant.id,
            targetType: "tenant",
            targetId: createdTenant.id,
            metadata: {
              slug: createdTenant.slug,
              name: createdTenant.name,
              timezone: createdTenant.timezone,
              defaultPlanCode: basePlan.code,
              settings: initialSettings,
            },
          },
          tx,
        );

        return tenantWithRelations;
      });

      return this.mapTenantSummary(result);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Tenant slug already exists.");
      }

      throw error;
    }
  }

  async updateTenant(
    tenantId: string,
    input: UpdateTenantDto,
    actor: AuthenticatedUser,
  ): Promise<TenantSummaryResponse> {
    const before = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        tenantSettings: true,
      },
    });

    if (!before) {
      throw new NotFoundException("Tenant not found.");
    }

    const updateData: Prisma.TenantUpdateInput = {};

    if (typeof input.name === "string") {
      const name = input.name.trim();

      if (!name) {
        throw new BadRequestException("name cannot be empty.");
      }

      updateData.name = name;
    }

    if (typeof input.timezone === "string") {
      const timezone = input.timezone.trim();

      if (!timezone) {
        throw new BadRequestException("timezone cannot be empty.");
      }

      updateData.timezone = timezone;
    }

    if (input.status) {
      updateData.status = this.parseTenantStatus(input.status);
    }

    const normalizedSettings =
      input.settings === undefined
        ? undefined
        : this.tenantSettingsService.normalizeSettings(input.settings);

    if (
      Object.keys(updateData).length === 0 &&
      (!normalizedSettings || Object.keys(normalizedSettings).length === 0)
    ) {
      throw new BadRequestException(
        "No valid fields were provided for tenant update.",
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.tenant.update({
          where: { id: tenantId },
          data: updateData,
        });
      }

      if (normalizedSettings && Object.keys(normalizedSettings).length > 0) {
        await this.tenantSettingsService.upsertMany(
          tenantId,
          normalizedSettings,
          tx,
        );
      }

      const after = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        include: {
          tenantSettings: true,
          subscriptions: {
            where: {
              status: {
                in: this.subscriptionsService.getOpenStatuses(),
              },
            },
            orderBy: { startsAt: "desc" },
            take: 1,
            include: {
              plan: true,
            },
          },
        },
      });

      await this.auditService.record(
        {
          action: AUDIT_ACTIONS.TENANT_UPDATED,
          actor,
          tenantId,
          targetType: "tenant",
          targetId: tenantId,
          metadata: {
            before: {
              name: before.name,
              timezone: before.timezone,
              status: before.status,
            },
            after: {
              name: after.name,
              timezone: after.timezone,
              status: after.status,
            },
            updatedSettings: normalizedSettings ?? {},
          },
        },
        tx,
      );

      return after;
    });

    return this.mapTenantSummary(result);
  }

  async changeTenantPlan(
    tenantId: string,
    input: ChangeTenantPlanDto,
    actor: AuthenticatedUser,
  ): Promise<TenantSummaryResponse> {
    const planId = input.planId?.trim();

    if (!planId) {
      throw new BadRequestException("planId is required.");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant) {
        throw new NotFoundException("Tenant not found.");
      }

      const plan = await tx.plan.findUnique({
        where: { id: planId },
      });

      if (!plan) {
        throw new NotFoundException("Plan not found.");
      }

      const changeResult = await this.subscriptionsService.changeTenantPlan(
        tenantId,
        plan.id,
        tx,
      );

      const tenantWithRelations = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        include: {
          tenantSettings: true,
          subscriptions: {
            where: {
              status: {
                in: this.subscriptionsService.getOpenStatuses(),
              },
            },
            orderBy: { startsAt: "desc" },
            take: 1,
            include: {
              plan: true,
            },
          },
        },
      });

      await this.auditService.record(
        {
          action: AUDIT_ACTIONS.TENANT_PLAN_CHANGED,
          actor,
          tenantId,
          targetType: "tenant",
          targetId: tenantId,
          metadata: {
            previousPlanIds: changeResult.previousPlanIds,
            newPlanId: plan.id,
            newPlanCode: plan.code,
          },
        },
        tx,
      );

      return tenantWithRelations;
    });

    return this.mapTenantSummary(result);
  }

  async cancelTenantSubscription(
    tenantId: string,
    input: CancelTenantSubscriptionDto,
    actor: AuthenticatedUser,
  ): Promise<TenantSummaryResponse> {
    const cancelAtPeriodEnd = input.cancelAtPeriodEnd ?? true;
    const reason = input.reason?.trim() || "requested_by_operator";

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant) {
        throw new NotFoundException("Tenant not found.");
      }

      const cancellationResult = await this.subscriptionsService.cancelTenantSubscription(
        tenantId,
        {
          cancelAtPeriodEnd,
          reason,
        },
        tx,
      );

      const tenantWithRelations = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        include: {
          tenantSettings: true,
          subscriptions: {
            where: {
              status: {
                in: this.subscriptionsService.getOpenStatuses(),
              },
            },
            orderBy: { startsAt: "desc" },
            take: 1,
            include: {
              plan: true,
            },
          },
        },
      });

      await this.auditService.record(
        {
          action: AUDIT_ACTIONS.TENANT_SUBSCRIPTION_CANCELED,
          actor,
          tenantId,
          targetType: "subscription",
          targetId: cancellationResult.subscriptionId,
          metadata: {
            reason,
            cancelAtPeriodEnd: cancellationResult.cancelAtPeriodEnd,
            previousStatus: cancellationResult.previousStatus,
            nextStatus: cancellationResult.nextStatus,
            endsAt: cancellationResult.endsAt?.toISOString() ?? null,
            stripeReference: cancellationResult.stripeReference,
          },
        },
        tx,
      );

      return tenantWithRelations;
    });

    return this.mapTenantSummary(result);
  }

  async runBillingDunning(actor: AuthenticatedUser): Promise<{
    processed: number;
    reminded: number;
    suspended: number;
  }> {
    const now = new Date();
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.PAST_DUE,
      },
      include: {
        tenant: {
          select: {
            id: true,
            status: true,
          },
        },
        plan: {
          select: {
            id: true,
            code: true,
          },
        },
      },
      orderBy: {
        updatedAt: "asc",
      },
    });

    let reminded = 0;
    let suspended = 0;

    for (const subscription of subscriptions) {
      const overdueMs = now.getTime() - subscription.updatedAt.getTime();
      const overdueDays = Math.max(1, Math.floor(overdueMs / 86400000));

      const reminderLevel =
        overdueDays >= 7
          ? "final"
          : overdueDays >= 3
            ? "second"
            : "first";

      await this.prisma.$transaction(async (tx) => {
        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.TENANT_BILLING_REMINDER_ISSUED,
            actor,
            tenantId: subscription.tenantId,
            targetType: "subscription",
            targetId: subscription.id,
            metadata: {
              overdueDays,
              reminderLevel,
              subscriptionStatus: subscription.status,
              planCode: subscription.plan.code,
              issuedAt: now.toISOString(),
            },
          },
          tx,
        );

        if (
          overdueDays >= TenantsService.DUNNING_SUSPEND_AFTER_DAYS &&
          subscription.tenant.status !== TenantStatus.SUSPENDED
        ) {
          await tx.tenant.update({
            where: {
              id: subscription.tenantId,
            },
            data: {
              status: TenantStatus.SUSPENDED,
            },
          });

          await this.auditService.record(
            {
              action: AUDIT_ACTIONS.TENANT_BILLING_SUSPENDED,
              actor,
              tenantId: subscription.tenantId,
              targetType: "tenant",
              targetId: subscription.tenantId,
              metadata: {
                reason: "past_due_threshold_reached",
                overdueDays,
                thresholdDays: TenantsService.DUNNING_SUSPEND_AFTER_DAYS,
                subscriptionId: subscription.id,
                suspendedAt: now.toISOString(),
              },
            },
            tx,
          );

          suspended += 1;
        }
      });

      reminded += 1;
    }

    return {
      processed: subscriptions.length,
      reminded,
      suspended,
    };
  }

  async grantReferralBonus(
    tenantId: string,
    input: GrantReferralBonusDto,
    actor: AuthenticatedUser,
  ): Promise<TenantSummaryResponse> {
    const reason = input.note?.trim() || "referral_bonus_month";

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant) {
        throw new NotFoundException("Tenant not found.");
      }

      const bonusResult = await this.subscriptionsService.grantReferralBonusMonth(
        tenantId,
        tx,
      );

      await this.auditService.record(
        {
          action: AUDIT_ACTIONS.TENANT_REFERRAL_BONUS_GRANTED,
          actor,
          tenantId,
          targetType: "subscription",
          targetId: bonusResult.subscriptionId,
          metadata: {
            reason,
            referredTenantId: input.referredTenantId?.trim() || null,
            referralCode: input.referralCode?.trim() || null,
            previousStatus: bonusResult.previousStatus,
            nextStatus: bonusResult.nextStatus,
            previousEndsAt: bonusResult.previousEndsAt?.toISOString() ?? null,
            nextEndsAt: bonusResult.nextEndsAt.toISOString(),
          },
        },
        tx,
      );

      const tenantWithRelations = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        include: {
          tenantSettings: true,
          subscriptions: {
            where: {
              status: {
                in: this.subscriptionsService.getOpenStatuses(),
              },
            },
            orderBy: { startsAt: "desc" },
            take: 1,
            include: {
              plan: true,
            },
          },
        },
      });

      return tenantWithRelations;
    });

    const stripeSyncResult = await this.subscriptionsService.applyReferralBonusInStripe(
      tenantId,
    );

    await this.auditService.record({
      action: stripeSyncResult.applied
        ? AUDIT_ACTIONS.TENANT_REFERRAL_BONUS_STRIPE_SYNCED
        : AUDIT_ACTIONS.TENANT_REFERRAL_BONUS_STRIPE_SYNC_FAILED,
      actor,
      tenantId,
      targetType: "subscription",
      targetId: result.subscriptions[0]?.id ?? null,
      metadata: {
        applied: stripeSyncResult.applied,
        amountCents: stripeSyncResult.amountCents,
        currency: stripeSyncResult.currency,
        subscriptionReference: stripeSyncResult.subscriptionReference,
        customerId: stripeSyncResult.customerId,
        error: stripeSyncResult.error ?? null,
      },
    });

    return this.mapTenantSummary(result);
  }

  private parseTenantStatus(value: string): TenantStatus {
    if ((Object.values(TenantStatus) as string[]).includes(value)) {
      return value as TenantStatus;
    }

    throw new BadRequestException("Invalid tenant status.");
  }

  private normalizeSlug(rawSlug: string): string {
    const slug = rawSlug?.trim().toLowerCase();

    if (!slug) {
      throw new BadRequestException("slug is required.");
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new BadRequestException(
        "slug must contain only lowercase letters, numbers and hyphen.",
      );
    }

    return slug;
  }

  private mapTenantSummary(
    tenant: Prisma.TenantGetPayload<{
      include: {
        tenantSettings: true;
        subscriptions: {
          include: {
            plan: true;
          };
        };
      };
    }>,
  ): TenantSummaryResponse {
    const currentSubscription = tenant.subscriptions[0] ?? null;

    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      timezone: tenant.timezone,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      currentPlan: currentSubscription
        ? {
            id: currentSubscription.plan.id,
            code: currentSubscription.plan.code,
            name: currentSubscription.plan.name,
            status: currentSubscription.status,
            startsAt: currentSubscription.startsAt,
            endsAt: currentSubscription.endsAt,
          }
        : null,
      settings: this.tenantSettingsService.toMap(tenant.tenantSettings),
    };
  }
}
