import {
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Prisma,
  PrismaClient,
  SubscriptionStatus,
} from "@prisma/client";
import Stripe from "stripe";
import { PrismaService } from "../../database/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaClient | PrismaService;

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private static readonly OPEN_STATUSES: SubscriptionStatus[] = [
    SubscriptionStatus.TRIAL,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.PAST_DUE,
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createActiveSubscription(
    tenantId: string,
    planId: string,
    dbClient?: DbClient,
  ): Promise<void> {
    const db = dbClient ?? this.prisma;

    await db.subscription.create({
      data: {
        tenantId,
        planId,
        status: SubscriptionStatus.ACTIVE,
        startsAt: new Date(),
      },
    });
  }

  async changeTenantPlan(
    tenantId: string,
    planId: string,
    dbClient?: DbClient,
  ): Promise<{ previousPlanIds: string[] }> {
    const db = dbClient ?? this.prisma;
    const now = new Date();

    const currentlyOpenSubscriptions = await db.subscription.findMany({
      where: {
        tenantId,
        status: {
          in: SubscriptionsService.OPEN_STATUSES,
        },
      },
      select: {
        id: true,
        planId: true,
      },
    });

    await db.subscription.updateMany({
      where: {
        tenantId,
        status: {
          in: SubscriptionsService.OPEN_STATUSES,
        },
      },
      data: {
        status: SubscriptionStatus.CANCELED,
        endsAt: now,
      },
    });

    await db.subscription.create({
      data: {
        tenantId,
        planId,
        status: SubscriptionStatus.ACTIVE,
        startsAt: now,
      },
    });

    return {
      previousPlanIds: [...new Set(currentlyOpenSubscriptions.map((item) => item.planId))],
    };
  }

  async cancelTenantSubscription(
    tenantId: string,
    input: {
      cancelAtPeriodEnd: boolean;
      reason?: string;
    },
    dbClient?: DbClient,
  ): Promise<{
    subscriptionId: string;
    previousStatus: SubscriptionStatus;
    nextStatus: SubscriptionStatus;
    endsAt: Date | null;
    cancelAtPeriodEnd: boolean;
    stripeReference: string | null;
  }> {
    const db = dbClient ?? this.prisma;
    const now = new Date();

    const subscription = await db.subscription.findFirst({
      where: {
        tenantId,
        status: {
          in: SubscriptionsService.OPEN_STATUSES,
        },
      },
      orderBy: {
        startsAt: "desc",
      },
      select: {
        id: true,
        status: true,
        endsAt: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException("No active subscription found for tenant.");
    }

    const onboarding = await db.commercialOnboarding.findFirst({
      where: {
        tenantId,
        subscriptionId: subscription.id,
      },
      select: {
        paymentReference: true,
      },
    });

    const stripeReference = onboarding?.paymentReference?.trim() || null;
    const stripeClient = this.buildStripeClient();
    let calculatedEndsAt: Date | null = subscription.endsAt;

    if (stripeClient && stripeReference?.startsWith("sub_")) {
      if (input.cancelAtPeriodEnd) {
        const updated = await stripeClient.subscriptions.update(stripeReference, {
          cancel_at_period_end: true,
        });

        if (Number.isFinite(updated.cancel_at) && (updated.cancel_at as number) > 0) {
          calculatedEndsAt = new Date((updated.cancel_at as number) * 1000);
        } else if (
          Number.isFinite(updated.current_period_end) &&
          (updated.current_period_end as number) > 0
        ) {
          calculatedEndsAt = new Date((updated.current_period_end as number) * 1000);
        }
      } else {
        await stripeClient.subscriptions.cancel(stripeReference);
        calculatedEndsAt = now;
      }
    }

    const nextStatus = input.cancelAtPeriodEnd
      ? subscription.status
      : SubscriptionStatus.CANCELED;

    await db.subscription.update({
      where: {
        id: subscription.id,
      },
      data: {
        status: nextStatus,
        endsAt: calculatedEndsAt ?? now,
      },
    });

    this.logger.log(
      `Tenant subscription cancellation processed tenant=${tenantId} subscription=${subscription.id} mode=${input.cancelAtPeriodEnd ? "period_end" : "immediate"}`,
    );

    return {
      subscriptionId: subscription.id,
      previousStatus: subscription.status,
      nextStatus,
      endsAt: calculatedEndsAt ?? now,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      stripeReference,
    };
  }

  async grantReferralBonusMonth(
    tenantId: string,
    dbClient?: DbClient,
  ): Promise<{
    subscriptionId: string;
    previousStatus: SubscriptionStatus;
    nextStatus: SubscriptionStatus;
    previousEndsAt: Date | null;
    nextEndsAt: Date;
  }> {
    const db = dbClient ?? this.prisma;

    const subscription = await db.subscription.findFirst({
      where: {
        tenantId,
        status: {
          in: SubscriptionsService.OPEN_STATUSES,
        },
      },
      orderBy: {
        startsAt: "desc",
      },
      select: {
        id: true,
        status: true,
        endsAt: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException("No active subscription found for tenant.");
    }

    const now = new Date();
    const baseEndsAt =
      subscription.endsAt && subscription.endsAt.getTime() > now.getTime()
        ? subscription.endsAt
        : now;

    const nextEndsAt = new Date(baseEndsAt.getTime() + 30 * 24 * 60 * 60 * 1000);

    await db.subscription.update({
      where: {
        id: subscription.id,
      },
      data: {
        status: SubscriptionStatus.ACTIVE,
        endsAt: nextEndsAt,
      },
    });

    return {
      subscriptionId: subscription.id,
      previousStatus: subscription.status,
      nextStatus: SubscriptionStatus.ACTIVE,
      previousEndsAt: subscription.endsAt,
      nextEndsAt,
    };
  }

  async applyReferralBonusInStripe(tenantId: string): Promise<{
    applied: boolean;
    subscriptionReference: string | null;
    customerId: string | null;
    amountCents: number;
    currency: string | null;
    error?: string;
  }> {
    const stripeClient = this.buildStripeClient();

    if (!stripeClient) {
      return {
        applied: false,
        subscriptionReference: null,
        customerId: null,
        amountCents: 0,
        currency: null,
        error: "Stripe client not configured.",
      };
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: {
          in: SubscriptionsService.OPEN_STATUSES,
        },
      },
      orderBy: {
        startsAt: "desc",
      },
      include: {
        plan: {
          select: {
            priceCents: true,
            currency: true,
          },
        },
      },
    });

    if (!subscription || subscription.plan.priceCents <= 0) {
      return {
        applied: false,
        subscriptionReference: null,
        customerId: null,
        amountCents: 0,
        currency: null,
        error: "No eligible subscription with billable plan found.",
      };
    }

    const onboarding = await this.prisma.commercialOnboarding.findFirst({
      where: {
        tenantId,
        subscriptionId: subscription.id,
      },
      select: {
        paymentReference: true,
      },
    });

    const subscriptionReference = onboarding?.paymentReference?.trim() || null;

    if (!subscriptionReference?.startsWith("sub_")) {
      return {
        applied: false,
        subscriptionReference,
        customerId: null,
        amountCents: 0,
        currency: subscription.plan.currency,
        error: "Stripe subscription reference not found.",
      };
    }

    try {
      const stripeSubscription = await stripeClient.subscriptions.retrieve(
        subscriptionReference,
      );

      const customerId =
        typeof stripeSubscription.customer === "string"
          ? stripeSubscription.customer
          : stripeSubscription.customer?.id || null;

      if (!customerId) {
        return {
          applied: false,
          subscriptionReference,
          customerId: null,
          amountCents: 0,
          currency: subscription.plan.currency,
          error: "Stripe customer not found for subscription.",
        };
      }

      const amountCents = subscription.plan.priceCents;
      const currency = subscription.plan.currency.toLowerCase();

      await stripeClient.customers.createBalanceTransaction(customerId, {
        amount: -amountCents,
        currency,
        description: `Referral bonus: 1 free month (tenant ${tenantId})`,
      });

      return {
        applied: true,
        subscriptionReference,
        customerId,
        amountCents,
        currency: subscription.plan.currency,
      };
    } catch (error) {
      this.logger.error(
        `Failed to apply Stripe referral bonus tenant=${tenantId} subscription=${subscriptionReference}`,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        applied: false,
        subscriptionReference,
        customerId: null,
        amountCents: subscription.plan.priceCents,
        currency: subscription.plan.currency,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  getOpenStatuses(): SubscriptionStatus[] {
    return [...SubscriptionsService.OPEN_STATUSES];
  }

  private buildStripeClient(): Stripe | null {
    const apiKey = this.configService.get<string>("stripe.secretKey", "").trim();

    if (!apiKey) {
      return null;
    }

    return new Stripe(apiKey, {
      apiVersion: "2024-06-20",
    });
  }
}
