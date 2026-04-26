import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  CommercialOnboardingSummaryPayload,
  CommercialPlanSummaryPayload,
  CommercialStartOnboardingResponsePayload,
  CommercialAdminListOnboardingsQuery,
  CommercialAdminOnboardingSummary,
} from "@operaclinic/shared";
import { findCommercialPublicPlanCatalogEntry } from "@operaclinic/shared";
import {
  CommercialOnboardingStatus,
  Prisma,
  RoleCode,
  SubscriptionStatus,
  TenantStatus,
  UserStatus,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { PrismaService } from "../../database/prisma.service";
import { TenantSettingsService } from "../platform/tenant-settings.service";
import { CompleteCommercialOnboardingDto } from "./dto/complete-commercial-onboarding.dto";
import { StartCommercialOnboardingDto } from "./dto/start-commercial-onboarding.dto";
import type { PaymentAdapter } from "./adapters/payment.adapter";
import { PaymentAdapterFactory } from "./adapters/payment-adapter.factory";

const onboardingInclude = {
  plan: true,
} satisfies Prisma.CommercialOnboardingInclude;

type CommercialOnboardingRecord = Prisma.CommercialOnboardingGetPayload<{
  include: typeof onboardingInclude;
}>;

type CommercialTransactionClient = Prisma.TransactionClient;

const EDITABLE_ONBOARDING_STATUSES = [
  CommercialOnboardingStatus.INITIATED,
  CommercialOnboardingStatus.AWAITING_PAYMENT,
] as const;

const ACTIVE_PENDING_ONBOARDING_STATUSES = [
  CommercialOnboardingStatus.INITIATED,
  CommercialOnboardingStatus.AWAITING_PAYMENT,
  CommercialOnboardingStatus.PAID,
  CommercialOnboardingStatus.ONBOARDING_STARTED,
] as const;

const PARTIAL_UNIQUE_INDEX_ADMIN_EMAIL =
  "uq_commercial_onboardings_pending_admin_email";
const PARTIAL_UNIQUE_INDEX_CLINIC_CONTACT_EMAIL =
  "uq_commercial_onboardings_pending_clinic_contact_email";

@Injectable()
export class CommercialService {
  private readonly logger = new Logger(CommercialService.name);
  private readonly paymentAdapter: PaymentAdapter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantSettingsService: TenantSettingsService,
    private readonly configService: ConfigService,
    private readonly paymentAdapterFactory: PaymentAdapterFactory,
  ) {
    this.paymentAdapter = this.paymentAdapterFactory.getAdapter();
  }

  async listPublicPlans(): Promise<CommercialPlanSummaryPayload[]> {
    const plans = await this.prisma.plan.findMany({
      where: {
        isActive: true,
        isPublic: true,
      },
      orderBy: [
        { priceCents: "asc" },
        { createdAt: "asc" },
      ],
    });

    return plans
      .filter((plan) => findCommercialPublicPlanCatalogEntry(plan.code))
      .map((plan) => this.mapPlan(plan));
  }

  async startOnboarding(
    input: StartCommercialOnboardingDto,
  ): Promise<CommercialStartOnboardingResponsePayload> {
    await this.expireStaleOnboardings();

    const planId = input.planId?.trim();

    if (!planId) {
      throw new BadRequestException("planId is required.");
    }

    const plan = await this.findPublicPlanById(planId);
    const publicToken = this.generatePublicToken();
    const publicTokenHash = this.hashPublicToken(publicToken);

    const onboarding = await this.prisma.$transaction(async (tx) => {
      const created = await tx.commercialOnboarding.create({
        data: {
          planId: plan.id,
          publicTokenHash,
          expiresAt: this.calculateExpiresAt(),
          status: CommercialOnboardingStatus.INITIATED,
        },
        include: onboardingInclude,
      });

      await this.recordAuditLog(tx, {
        action: AUDIT_ACTIONS.COMMERCIAL_ONBOARDING_INITIATED,
        actorProfile: "public",
        targetType: "commercial_onboarding",
        targetId: created.id,
        metadata: {
          planId: plan.id,
          planCode: plan.code,
        },
      });

      return created;
    });

    return {
      onboardingToken: publicToken,
      onboarding: this.mapOnboardingSummary(onboarding),
    };
  }

  async getOnboarding(
    publicToken: string,
  ): Promise<CommercialOnboardingSummaryPayload> {
    await this.expireStaleOnboardings();
    const onboarding = await this.findOnboardingByPublicTokenOrThrow(publicToken, {
      allowExpired: true,
    });
    return this.mapOnboardingSummary(onboarding);
  }

  async completeOnboarding(
    publicToken: string,
    input: CompleteCommercialOnboardingDto,
  ): Promise<CommercialOnboardingSummaryPayload> {
    await this.expireStaleOnboardings();
    const onboarding = await this.findOnboardingByPublicTokenOrThrow(publicToken);

    if (!this.isEditableOnboardingStatus(onboarding.status)) {
      throw new BadRequestException(
        "Commercial onboarding cannot be edited after checkout confirmation.",
      );
    }

    const clinicDisplayName = this.requireNonEmpty(
      input.clinicDisplayName,
      "clinicDisplayName",
      160,
    );
    const clinicContactEmail = this.normalizeRequiredEmail(
      input.clinicContactEmail,
      "clinicContactEmail",
    );
    const clinicContactPhone = this.requireNonEmpty(
      input.clinicContactPhone,
      "clinicContactPhone",
      40,
    );
    const timezone = this.normalizeTimezone(input.timezone);
    const initialUnitName =
      this.normalizeNullableString(input.initialUnitName, 160) ??
      "Unidade Principal";
    const adminFullName = this.requireNonEmpty(input.adminFullName, "adminFullName", 160);
    const adminEmail = this.normalizeRequiredEmail(input.adminEmail, "adminEmail");
    await this.ensureAdminEmailAvailable(adminEmail);
    await this.ensurePendingOnboardingAvailability({
      currentOnboardingId: onboarding.id,
      adminEmail,
      clinicContactEmail,
    });
    const nextExpiresAt = this.calculateExpiresAt();

    let updated: CommercialOnboardingRecord;

    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const next = await tx.commercialOnboarding.update({
          where: { id: onboarding.id },
          data: {
            clinicDisplayName,
            clinicLegalName: this.normalizeNullableString(input.clinicLegalName, 180),
            clinicDocumentNumber: this.normalizeNullableString(
              input.clinicDocumentNumber,
              40,
            ),
            clinicContactEmail,
            clinicContactPhone,
            timezone,
            initialUnitName,
            adminFullName,
            adminEmail,
            adminPasswordHash: null,
            expiresAt: nextExpiresAt,
            status: CommercialOnboardingStatus.AWAITING_PAYMENT,
            paymentReference: null,
            checkoutConfirmedAt: null,
          },
          include: onboardingInclude,
        });

        await this.recordAuditLog(tx, {
          action: AUDIT_ACTIONS.COMMERCIAL_ONBOARDING_COMPLETED,
          actorProfile: "public",
          targetType: "commercial_onboarding",
          targetId: next.id,
          metadata: {
            planId: next.planId,
            clinicDisplayName,
            adminEmail,
            expiresAt: nextExpiresAt.toISOString(),
          },
        });

        return next;
      });
    } catch (error) {
      this.rethrowKnownOnboardingConflict(error);
      throw error;
    }

    return this.mapOnboardingSummary(updated);
  }

  async createCheckout(
    publicToken: string,
  ): Promise<{ checkoutUrl: string; sessionId: string }> {
    await this.expireStaleOnboardings();

    const onboarding = await this.findOnboardingByPublicTokenOrThrow(publicToken);

    if (onboarding.status === CommercialOnboardingStatus.INITIATED) {
      throw new BadRequestException(
        "Complete the clinic registration before creating checkout.",
      );
    }

    if (
      onboarding.status === CommercialOnboardingStatus.PAID ||
      onboarding.status === CommercialOnboardingStatus.ONBOARDING_STARTED ||
      onboarding.status === CommercialOnboardingStatus.ONBOARDING_COMPLETED
    ) {
      throw new BadRequestException(
        "Checkout already confirmed or onboarding already completed.",
      );
    }

    try {
      const session = await this.paymentAdapter.createCheckout(
        onboarding.plan,
        onboarding.id,
        publicToken,
      );

      this.logger.debug(
        `Created checkout session ${session.id} for onboarding ${onboarding.id}`,
      );

      return {
        checkoutUrl: session.url,
        sessionId: session.id,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create checkout for onboarding ${onboarding.id}`,
        error instanceof Error ? error.message : String(error),
      );
      throw new BadRequestException(
        "Failed to create checkout session. Please try again.",
      );
    }
  }

  async confirmCheckout(
    publicToken: string,
    sessionId?: string,
  ): Promise<CommercialOnboardingSummaryPayload> {
    await this.expireStaleOnboardings();

    const onboarding = await this.findOnboardingByPublicTokenOrThrow(publicToken);

    if (onboarding.status === CommercialOnboardingStatus.INITIATED) {
      throw new BadRequestException(
        "Complete the clinic registration before confirming checkout.",
      );
    }

    if (
      onboarding.status === CommercialOnboardingStatus.PAID ||
      onboarding.status === CommercialOnboardingStatus.ONBOARDING_STARTED ||
      onboarding.status === CommercialOnboardingStatus.ONBOARDING_COMPLETED
    ) {
      return this.mapOnboardingSummary(onboarding);
    }

    const confirmedAt = new Date();
    const nextExpiresAt = this.calculateExpiresAt(confirmedAt);

    try {
      let paymentReference: string;

      // Use adapter to confirm payment
      if (sessionId) {
        // Stripe or other provider
        const confirmation = await this.paymentAdapter.confirmPayment(sessionId);
        if (confirmation.status !== "confirmed") {
          throw new BadRequestException(
            `Payment confirmation failed: ${confirmation.error || "Unknown error"}`,
          );
        }
        paymentReference = confirmation.reference;
      } else {
        if (!this.isMockCheckoutAvailable()) {
          throw new BadRequestException(
            "Mock checkout confirmation is disabled for this environment.",
          );
        }

        paymentReference = `mock-${Date.now()}`;
        this.logger.debug(
          `Using inline mock confirmation for onboarding ${onboarding.id}`,
        );
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        const next = await tx.commercialOnboarding.update({
          where: { id: onboarding.id },
          data: {
            status: CommercialOnboardingStatus.PAID,
            paymentReference,
            checkoutConfirmedAt: confirmedAt,
            expiresAt: nextExpiresAt,
          },
          include: onboardingInclude,
        });

        await this.recordAuditLog(tx, {
          action: AUDIT_ACTIONS.COMMERCIAL_CHECKOUT_CONFIRMED,
          actorProfile: "system",
          targetType: "commercial_onboarding",
          targetId: next.id,
          metadata: {
            paymentReference,
            sessionId: sessionId || "mock",
            mode: sessionId ? "production" : "mock",
            expiresAt: nextExpiresAt.toISOString(),
          },
        });

        return next;
      });

      return this.mapOnboardingSummary(updated);
    } catch (error) {
      this.logger.error(
        `Failed to confirm checkout for onboarding ${onboarding.id}`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async finalizeOnboarding(
    publicToken: string,
  ): Promise<CommercialOnboardingSummaryPayload> {
    await this.expireStaleOnboardings();
    const onboarding = await this.findOnboardingByPublicTokenOrThrow(publicToken);

    if (onboarding.status === CommercialOnboardingStatus.ONBOARDING_COMPLETED) {
      return this.mapOnboardingSummary(onboarding);
    }

    if (onboarding.status !== CommercialOnboardingStatus.PAID) {
      throw new BadRequestException(
        "Checkout must be confirmed before onboarding can be finalized.",
      );
    }

    this.assertOnboardingReadyForFinalize(onboarding);
    await this.ensureAdminEmailAvailable(onboarding.adminEmail as string);
    await this.findPublicPlanById(onboarding.planId);

    try {
      const finalized = await this.prisma.$transaction(async (tx) => {
        const now = new Date();

        await tx.commercialOnboarding.update({
          where: { id: onboarding.id },
          data: {
            status: CommercialOnboardingStatus.ONBOARDING_STARTED,
            onboardingStartedAt: now,
          },
        });

        const tenant = await this.createTenantRecord(tx, onboarding);
        const initialSettings = this.tenantSettingsService.buildInitialSettings();
        await this.tenantSettingsService.upsertMany(tenant.id, initialSettings, tx);

        const clinic = await tx.clinic.create({
          data: {
            tenantId: tenant.id,
            displayName: onboarding.clinicDisplayName as string,
            legalName: onboarding.clinicLegalName,
            documentNumber: onboarding.clinicDocumentNumber,
            contactEmail: onboarding.clinicContactEmail,
            contactPhone: onboarding.clinicContactPhone,
            timezone: onboarding.timezone ?? tenant.timezone,
            isActive: true,
          },
        });

        const unit = await tx.unit.create({
          data: {
            tenantId: tenant.id,
            name: onboarding.initialUnitName as string,
            isActive: true,
          },
        });

        const tenantAdminRole = await tx.role.findUnique({
          where: {
            code: RoleCode.TENANT_ADMIN,
          },
          select: {
            id: true,
          },
        });

        if (!tenantAdminRole) {
          throw new BadRequestException(
            "TENANT_ADMIN role is not configured.",
          );
        }

        const adminUser = await tx.user.create({
          data: {
            email: onboarding.adminEmail as string,
            fullName: onboarding.adminFullName as string,
            passwordHash: await hash(this.generateInvitedPasswordSeed(), 10),
            passwordChangedAt: null,
            status: UserStatus.INVITED,
          },
        });

        await tx.userRole.create({
          data: {
            userId: adminUser.id,
            roleId: tenantAdminRole.id,
            tenantId: tenant.id,
          },
        });

        const subscription = await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            planId: onboarding.planId,
            status: SubscriptionStatus.ACTIVE,
            startsAt: now,
          },
        });

        const completed = await tx.commercialOnboarding.update({
          where: { id: onboarding.id },
          data: {
            status: CommercialOnboardingStatus.ONBOARDING_COMPLETED,
            onboardingCompletedAt: now,
            adminPasswordHash: null,
            tenantId: tenant.id,
            clinicId: clinic.id,
            unitId: unit.id,
            adminUserId: adminUser.id,
            subscriptionId: subscription.id,
          },
          include: onboardingInclude,
        });

        await this.recordAuditLog(tx, {
          action: AUDIT_ACTIONS.COMMERCIAL_ONBOARDING_FINALIZED,
          actorProfile: "system",
          tenantId: tenant.id,
          targetType: "tenant",
          targetId: tenant.id,
          metadata: {
            onboardingId: onboarding.id,
            clinicId: clinic.id,
            unitId: unit.id,
            adminUserId: adminUser.id,
            subscriptionId: subscription.id,
            planId: onboarding.planId,
          },
        });

        return completed;
      });

      return this.mapOnboardingSummary(finalized);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "Commercial onboarding could not be finalized due to duplicate tenant or user data.",
        );
      }

      throw error;
    }
  }

  async escalateToStaff(
    publicToken: string,
    reason: string,
  ): Promise<CommercialOnboardingSummaryPayload> {
    await this.expireStaleOnboardings();
    const onboarding = await this.findOnboardingByPublicTokenOrThrow(publicToken);

    if (!this.isEditableOnboardingStatus(onboarding.status)) {
      throw new BadRequestException(
        "Escalation is only available for active onboardings.",
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const escalated = await tx.commercialOnboarding.update(
        {
          where: { id: onboarding.id },
          data: {
            status: CommercialOnboardingStatus.ESCALATED_TO_STAFF,
          },
          include: onboardingInclude,
        } as any,
      ) as CommercialOnboardingRecord;

      await this.recordAuditLog(tx, {
        action: AUDIT_ACTIONS.COMMERCIAL_ONBOARDING_ESCALATED,
        actorProfile: "patient_or_clinic",
        targetType: "commercial_onboarding",
        targetId: escalated.id,
        metadata: {
          reason: reason || "User requested manual assistance",
          previousStatus: onboarding.status,
          escalatedAt: new Date().toISOString(),
        },
      });

      this.logger.warn(
        `Commercial onboarding ${escalated.id} escalated to staff. Reason: ${reason}`,
      );

      return escalated;
    });

    return this.mapOnboardingSummary(updated);
  }

  async handlePaymentWebhook(
    body: Record<string, any>,
    request: any,
  ): Promise<void> {
    try {
      // Verify webhook signature using adapter
      const signature = request.headers["stripe-signature"] as string;
      if (!signature) {
        this.logger.warn("Webhook rejected: Missing signature header");
        throw new BadRequestException("Missing Stripe signature");
      }

      if (!this.paymentAdapter.verifyWebhookSignature) {
        this.logger.warn("Webhook adapter does not support signature verification");
        return;
      }

      // Verify signature - returns false if invalid
      const isValid = this.paymentAdapter.verifyWebhookSignature(
        JSON.stringify(body),
        signature,
      );

      if (!isValid) {
        this.logger.warn("Webhook rejected: Invalid signature");
        throw new BadRequestException("Invalid webhook signature");
      }

      // Deduplication: reject already-processed Stripe events (retry storms)
      const stripeEventId = typeof body?.id === "string" ? body.id.trim() : null;
      if (stripeEventId) {
        try {
          await this.prisma.commercialWebhookEvent.create({
            data: {
              providerEventId: stripeEventId,
              eventType: typeof body?.type === "string" ? body.type.slice(0, 80) : "unknown",
            },
          });
        } catch (dedupError: unknown) {
          const isPrismaUniqueViolation =
            dedupError instanceof Prisma.PrismaClientKnownRequestError &&
            dedupError.code === "P2002";
          if (isPrismaUniqueViolation) {
            this.logger.debug(
              `Payment webhook deduplicated: event ${stripeEventId} already processed`,
            );
            return; // ACK 200 without reprocessing
          }
          throw dedupError;
        }
      }

      await this.reconcileWebhookEvent(body);

      // Handle webhook events
      await this.paymentAdapter.handleWebhookEvent(body);
      this.logger.debug(`Successfully processed webhook event: ${body.type}`);
    } catch (error) {
      this.logger.error(
        `Failed to process payment webhook`,
        error instanceof Error ? error.message : String(error),
      );
      // Don't re-throw - Stripe expects 200 response even if we can't process
      // Re-throw would make Stripe retry the webhook
    }
  }

  private async reconcileWebhookEvent(event: Record<string, any>): Promise<void> {
    const eventType = String(event?.type || "");

    if (!eventType) {
      return;
    }

    if (eventType === "checkout.session.completed") {
      await this.reconcileCheckoutCompleted(event);
      return;
    }

    const subscriptionReference = this.extractSubscriptionReference(event);

    if (!subscriptionReference) {
      return;
    }

    if (eventType === "invoice.paid") {
      await this.syncInternalSubscriptionStatusByReference(
        subscriptionReference,
        SubscriptionStatus.ACTIVE,
        eventType,
      );
      return;
    }

    if (eventType === "invoice.payment_failed") {
      await this.syncInternalSubscriptionStatusByReference(
        subscriptionReference,
        SubscriptionStatus.PAST_DUE,
        eventType,
      );
      return;
    }

    if (eventType === "customer.subscription.deleted") {
      await this.syncInternalSubscriptionStatusByReference(
        subscriptionReference,
        SubscriptionStatus.CANCELED,
        eventType,
        new Date(),
      );
      return;
    }

    if (eventType === "customer.subscription.updated") {
      const stripeStatus = String(event?.data?.object?.status || "");
      const mappedStatus = this.mapStripeSubscriptionStatus(stripeStatus);

      if (!mappedStatus) {
        return;
      }

      const cancelAtUnix = Number(event?.data?.object?.cancel_at ?? 0);
      const endsAt =
        Number.isFinite(cancelAtUnix) && cancelAtUnix > 0
          ? new Date(cancelAtUnix * 1000)
          : mappedStatus === SubscriptionStatus.CANCELED
            ? new Date()
            : undefined;

      await this.syncInternalSubscriptionStatusByReference(
        subscriptionReference,
        mappedStatus,
        eventType,
        endsAt,
      );
    }
  }

  private async reconcileCheckoutCompleted(event: Record<string, any>): Promise<void> {
    const session = event?.data?.object as
      | {
          id?: string;
          subscription?: string;
          metadata?: { onboardingId?: string };
        }
      | undefined;

    const onboardingId = session?.metadata?.onboardingId?.trim();

    if (!onboardingId) {
      return;
    }

    const onboarding = await this.prisma.commercialOnboarding.findUnique({
      where: { id: onboardingId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!onboarding) {
      return;
    }

    if (
      onboarding.status === CommercialOnboardingStatus.PAID ||
      onboarding.status === CommercialOnboardingStatus.ONBOARDING_STARTED ||
      onboarding.status === CommercialOnboardingStatus.ONBOARDING_COMPLETED
    ) {
      return;
    }

    const confirmedAt = new Date();
    const nextExpiresAt = this.calculateExpiresAt(confirmedAt);
    const paymentReference =
      session?.subscription?.trim() || session?.id?.trim() || `stripe-${Date.now()}`;

    const updateResult = await this.prisma.$transaction(async (tx) => {
      // updateMany with status guard is race-condition-safe:
      // if two concurrent webhooks arrive, only one UPDATE will match status=AWAITING_PAYMENT
      const result = await tx.commercialOnboarding.updateMany({
        where: {
          id: onboarding.id,
          status: CommercialOnboardingStatus.AWAITING_PAYMENT,
        },
        data: {
          status: CommercialOnboardingStatus.PAID,
          paymentReference,
          checkoutConfirmedAt: confirmedAt,
          expiresAt: nextExpiresAt,
        },
      });

      if (result.count === 0) {
        // Already transitioned by a concurrent request — idempotent skip
        return { skipped: true };
      }

      await this.recordAuditLog(tx, {
        action: AUDIT_ACTIONS.COMMERCIAL_CHECKOUT_CONFIRMED,
        actorProfile: "system",
        targetType: "commercial_onboarding",
        targetId: onboarding.id,
        metadata: {
          paymentReference,
          mode: "webhook",
          eventType: event?.type,
          expiresAt: nextExpiresAt.toISOString(),
        },
      });

      return { skipped: false };
    });

    if (updateResult.skipped) {
      this.logger.debug(
        `reconcileCheckoutCompleted: onboarding ${onboarding.id} already confirmed by concurrent request — skipping`,
      );
    }
  }

  private extractSubscriptionReference(event: Record<string, any>): string | null {
    const object = event?.data?.object as Record<string, any> | undefined;

    const direct = object?.subscription;

    if (typeof direct === "string" && direct.trim()) {
      return direct.trim();
    }

    const lines = object?.lines?.data;
    if (Array.isArray(lines) && lines.length > 0) {
      const lineSubscription = lines[0]?.subscription;
      if (typeof lineSubscription === "string" && lineSubscription.trim()) {
        return lineSubscription.trim();
      }
    }

    const id = object?.id;
    if (
      event?.type === "customer.subscription.updated" ||
      event?.type === "customer.subscription.deleted"
    ) {
      if (typeof id === "string" && id.trim()) {
        return id.trim();
      }
    }

    return null;
  }

  private mapStripeSubscriptionStatus(
    stripeStatus: string,
  ): SubscriptionStatus | null {
    if (!stripeStatus) {
      return null;
    }

    switch (stripeStatus) {
      case "active":
      case "trialing":
        return SubscriptionStatus.ACTIVE;
      case "past_due":
      case "unpaid":
      case "incomplete":
        return SubscriptionStatus.PAST_DUE;
      case "canceled":
      case "incomplete_expired":
        return SubscriptionStatus.CANCELED;
      default:
        return null;
    }
  }

  private async syncInternalSubscriptionStatusByReference(
    paymentReference: string,
    status: SubscriptionStatus,
    eventType: string,
    endsAt?: Date,
  ): Promise<void> {
    const onboarding = await this.prisma.commercialOnboarding.findFirst({
      where: {
        paymentReference,
        subscriptionId: {
          not: null,
        },
      },
      select: {
        id: true,
        tenantId: true,
        subscriptionId: true,
      },
    });

    if (!onboarding?.subscriptionId) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.subscription.findUnique({
        where: {
          id: onboarding.subscriptionId as string,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!current) {
        return;
      }

      if (current.status === status && !endsAt) {
        return;
      }

      await tx.subscription.update({
        where: {
          id: current.id,
        },
        data: {
          status,
          endsAt: endsAt ?? undefined,
        },
      });

      await this.recordAuditLog(tx, {
        action: AUDIT_ACTIONS.COMMERCIAL_SUBSCRIPTION_STATUS_CHANGED,
        actorProfile: "system",
        tenantId: onboarding.tenantId,
        targetType: "subscription",
        targetId: current.id,
        metadata: {
          previousStatus: current.status,
          nextStatus: status,
          paymentReference,
          eventType,
          endsAt: endsAt?.toISOString() ?? null,
        },
      });
    });
  }

  private async findPublicPlanById(planId: string) {
    const plan = await this.prisma.plan.findFirst({
      where: {
        id: planId,
        isActive: true,
        isPublic: true,
      },
    });

    if (!plan) {
      throw new NotFoundException("Selected plan is not available.");
    }

    if (!findCommercialPublicPlanCatalogEntry(plan.code)) {
      throw new NotFoundException("Selected plan is not available.");
    }

    return plan;
  }

  private async findOnboardingByPublicTokenOrThrow(
    publicToken: string,
    options?: {
      allowExpired?: boolean;
    },
  ): Promise<CommercialOnboardingRecord> {
    const normalizedToken = publicToken?.trim();

    if (!normalizedToken) {
      throw new BadRequestException("publicToken is required.");
    }

    if (normalizedToken.length < 32) {
      throw new BadRequestException("publicToken is invalid.");
    }

    const existing = await this.prisma.commercialOnboarding.findUnique({
      where: {
        publicTokenHash: this.hashPublicToken(normalizedToken),
      },
      include: onboardingInclude,
    });

    if (!existing) {
      throw new NotFoundException("Commercial onboarding not found.");
    }

    const onboarding = await this.resolveOnboardingLifecycle(existing);

    if (
      onboarding.status === CommercialOnboardingStatus.EXPIRED &&
      !options?.allowExpired
    ) {
      throw new GoneException(
        "Commercial onboarding expired. Start again from plan selection.",
      );
    }

    return onboarding;
  }

  private async ensureAdminEmailAvailable(email: string): Promise<void> {
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      throw new ConflictException("Admin email already exists.");
    }
  }

  private async ensurePendingOnboardingAvailability(input: {
    currentOnboardingId?: string;
    adminEmail: string;
    clinicContactEmail: string;
  }): Promise<void> {
    const duplicate = await this.prisma.commercialOnboarding.findFirst({
      where: {
        id: input.currentOnboardingId
          ? {
              not: input.currentOnboardingId,
            }
          : undefined,
        status: {
          in: [...ACTIVE_PENDING_ONBOARDING_STATUSES],
        },
        OR: [
          {
            adminEmail: input.adminEmail,
          },
          {
            clinicContactEmail: input.clinicContactEmail,
          },
        ],
      },
      select: {
        id: true,
        adminEmail: true,
        clinicContactEmail: true,
      },
    });

    if (!duplicate) {
      return;
    }

    if (duplicate.adminEmail === input.adminEmail) {
      throw new ConflictException(
        "There is already an onboarding in progress for this admin email.",
      );
    }

    throw new ConflictException(
      "There is already an onboarding in progress for this clinic contact email.",
    );
  }

  private assertOnboardingReadyForFinalize(
    onboarding: CommercialOnboardingRecord,
  ): void {
    const requiredFields = [
      onboarding.clinicDisplayName,
      onboarding.clinicContactEmail,
      onboarding.clinicContactPhone,
      onboarding.initialUnitName,
      onboarding.adminFullName,
      onboarding.adminEmail,
    ];

    if (requiredFields.some((value) => !value)) {
      throw new BadRequestException(
        "Commercial onboarding is incomplete and cannot be finalized.",
      );
    }
  }

  private async expireStaleOnboardings(): Promise<void> {
    const now = new Date();
    const staleOnboardings = await this.prisma.commercialOnboarding.findMany({
      where: {
        status: {
          in: [...ACTIVE_PENDING_ONBOARDING_STATUSES],
        },
        expiresAt: {
          lte: now,
        },
      },
      select: {
        id: true,
        tenantId: true,
      },
    });

    if (staleOnboardings.length === 0) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const onboarding of staleOnboardings) {
        const updated = await tx.commercialOnboarding.updateMany({
          where: {
            id: onboarding.id,
            status: {
              in: [...ACTIVE_PENDING_ONBOARDING_STATUSES],
            },
            expiresAt: {
              lte: now,
            },
          },
          data: {
            status: CommercialOnboardingStatus.EXPIRED,
            adminPasswordHash: null,
          },
        });

        if (updated.count === 0) {
          continue;
        }

        await this.recordAuditLog(tx, {
          action: AUDIT_ACTIONS.COMMERCIAL_ONBOARDING_EXPIRED,
          actorProfile: "system",
          tenantId: onboarding.tenantId,
          targetType: "commercial_onboarding",
          targetId: onboarding.id,
          metadata: {
            reason: "ttl_elapsed",
            expiredAt: now.toISOString(),
          },
        });
      }
    });
  }

  private async resolveOnboardingLifecycle(
    onboarding: CommercialOnboardingRecord,
  ): Promise<CommercialOnboardingRecord> {
    if (
      onboarding.status === CommercialOnboardingStatus.ONBOARDING_COMPLETED ||
      onboarding.status === CommercialOnboardingStatus.EXPIRED
    ) {
      return onboarding;
    }

    if (onboarding.expiresAt.getTime() > Date.now()) {
      return onboarding;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.commercialOnboarding.updateMany({
        where: {
          id: onboarding.id,
          status: {
            in: [...ACTIVE_PENDING_ONBOARDING_STATUSES],
          },
          expiresAt: {
            lte: new Date(),
          },
        },
        data: {
          status: CommercialOnboardingStatus.EXPIRED,
          adminPasswordHash: null,
        },
      });

      const expired = await tx.commercialOnboarding.findUnique({
        where: { id: onboarding.id },
        include: onboardingInclude,
      });

      if (!expired) {
        throw new NotFoundException("Commercial onboarding not found.");
      }

      if (updated.count > 0) {
        await this.recordAuditLog(tx, {
          action: AUDIT_ACTIONS.COMMERCIAL_ONBOARDING_EXPIRED,
          actorProfile: "system",
          tenantId: onboarding.tenantId,
          targetType: "commercial_onboarding",
          targetId: onboarding.id,
          metadata: {
            reason: "token_access_after_expiration",
            expiredAt: new Date().toISOString(),
          },
        });
      }

      return expired;
    });
  }

  private async createTenantRecord(
    tx: CommercialTransactionClient,
    onboarding: CommercialOnboardingRecord,
  ) {
    const baseSlug = this.slugify(onboarding.clinicDisplayName as string);
    const fallbackSlug = `${baseSlug}-${onboarding.id.slice(0, 8)}`.slice(0, 100);

    for (const candidate of [baseSlug, fallbackSlug]) {
      try {
        return await tx.tenant.create({
          data: {
            slug: candidate,
            name: onboarding.clinicDisplayName as string,
            timezone: onboarding.timezone ?? "America/Sao_Paulo",
            status: TenantStatus.ACTIVE,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          candidate !== fallbackSlug
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new ConflictException("Unable to generate a unique tenant slug.");
  }

  private mapOnboardingSummary(
    onboarding: CommercialOnboardingRecord,
  ): CommercialOnboardingSummaryPayload {
    return {
      id: onboarding.id,
      status: onboarding.status,
      selectedPlan: this.mapPlan(onboarding.plan),
      clinic: {
        displayName: onboarding.clinicDisplayName,
        legalName: onboarding.clinicLegalName,
        documentNumber: onboarding.clinicDocumentNumber,
        contactEmail: onboarding.clinicContactEmail,
        contactPhone: onboarding.clinicContactPhone,
        timezone: onboarding.timezone,
        initialUnitName: onboarding.initialUnitName,
      },
      admin: {
        fullName: onboarding.adminFullName,
        email: onboarding.adminEmail,
      },
      payment: {
        reference: onboarding.paymentReference,
        confirmedAt: onboarding.checkoutConfirmedAt?.toISOString() ?? null,
        mockConfirmationAvailable: this.isMockCheckoutAvailable(),
      },
      onboarding: {
        tenantId: onboarding.tenantId,
        clinicId: onboarding.clinicId,
        unitId: onboarding.unitId,
        adminUserId: onboarding.adminUserId,
        subscriptionId: onboarding.subscriptionId,
        expiresAt: onboarding.expiresAt.toISOString(),
        startedAt: onboarding.onboardingStartedAt?.toISOString() ?? null,
        completedAt: onboarding.onboardingCompletedAt?.toISOString() ?? null,
      },
      nextStep: this.resolveNextStep(onboarding.status),
      login:
        onboarding.status === CommercialOnboardingStatus.ONBOARDING_COMPLETED
          ? {
              path: "/login/clinic",
              email: onboarding.adminEmail,
            }
          : {
              path: null,
              email: null,
            },
    };
  }

  private mapPlan(
    plan: {
      id: string;
      code: string;
      name: string;
      description: string | null;
      priceCents: number;
      currency: string;
      isPublic: boolean;
      isActive: boolean;
    },
  ): CommercialPlanSummaryPayload {
    const catalogEntry = findCommercialPublicPlanCatalogEntry(plan.code);

    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      priceCents: plan.priceCents,
      currency: plan.currency,
      isPublic: plan.isPublic,
      isActive: plan.isActive,
      publicMetadata: catalogEntry?.publicMetadata ?? null,
    };
  }

  private resolveNextStep(
    status: CommercialOnboardingStatus,
  ): CommercialOnboardingSummaryPayload["nextStep"] {
    switch (status) {
      case CommercialOnboardingStatus.INITIATED:
        return "complete_registration";
      case CommercialOnboardingStatus.AWAITING_PAYMENT:
        return "confirm_checkout";
      case CommercialOnboardingStatus.PAID:
      case CommercialOnboardingStatus.ONBOARDING_STARTED:
        return "finalize_onboarding";
      case CommercialOnboardingStatus.ONBOARDING_COMPLETED:
        return "login_clinic";
      case CommercialOnboardingStatus.EXPIRED:
        return "restart_onboarding";
      default:
        return "complete_registration";
    }
  }

  private isEditableOnboardingStatus(
    status: CommercialOnboardingStatus,
  ): status is (typeof EDITABLE_ONBOARDING_STATUSES)[number] {
    return (
      status === CommercialOnboardingStatus.INITIATED ||
      status === CommercialOnboardingStatus.AWAITING_PAYMENT
    );
  }

  private calculateExpiresAt(baseDate = new Date()): Date {
    const ttlHours = this.configService.get<number>(
      "commercial.onboardingTtlHours",
      48,
    );

    return new Date(baseDate.getTime() + ttlHours * 60 * 60 * 1000);
  }

  private generatePublicToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private hashPublicToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private slugify(rawValue: string): string {
    const normalized = rawValue
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 100);

    return normalized || "clinica";
  }

  private requireNonEmpty(
    value: string | undefined,
    field: string,
    maxLength: number,
  ): string {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException(`${field} is required.`);
    }

    if (normalized.length > maxLength) {
      throw new BadRequestException(
        `${field} must have at most ${maxLength} characters.`,
      );
    }

    return normalized;
  }

  private normalizeNullableString(
    value: string | undefined,
    maxLength: number,
  ): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();

    if (!normalized) {
      return null;
    }

    if (normalized.length > maxLength) {
      throw new BadRequestException(
        `Field must have at most ${maxLength} characters.`,
      );
    }

    return normalized;
  }

  private normalizeRequiredEmail(value: string | undefined, field: string): string {
    const email = value?.trim().toLowerCase();

    if (!email) {
      throw new BadRequestException(`${field} is required.`);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException(`${field} must be a valid email.`);
    }

    if (email.length > 180) {
      throw new BadRequestException(`${field} must have at most 180 characters.`);
    }

    return email;
  }

  private normalizeTimezone(value: string | undefined): string {
    const normalized = value?.trim();

    if (!normalized) {
      return "America/Sao_Paulo";
    }

    if (normalized.length > 64) {
      throw new BadRequestException("timezone must have at most 64 characters.");
    }

    return normalized;
  }

  private generateInvitedPasswordSeed(): string {
    return randomBytes(24).toString("base64url");
  }

  private isMockCheckoutAvailable(): boolean {
    return (
      !this.isProduction() &&
      this.configService.get<boolean>("commercial.enableMockCheckout", false)
    );
  }

  private isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  }

  private rethrowKnownOnboardingConflict(error: unknown): void {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      return;
    }

    const message = JSON.stringify(error.meta ?? {}) + error.message;

    if (message.includes(PARTIAL_UNIQUE_INDEX_ADMIN_EMAIL)) {
      throw new ConflictException(
        "There is already an onboarding in progress for this admin email.",
      );
    }

    if (message.includes(PARTIAL_UNIQUE_INDEX_CLINIC_CONTACT_EMAIL)) {
      throw new ConflictException(
        "There is already an onboarding in progress for this clinic contact email.",
      );
    }
  }

  async listOnboardings(
    query: CommercialAdminListOnboardingsQuery,
  ): Promise<CommercialAdminOnboardingSummary[]> {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const skip = (page - 1) * limit;

    const where: Prisma.CommercialOnboardingWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { clinicDisplayName: { contains: query.search, mode: "insensitive" } },
        { clinicContactEmail: { contains: query.search, mode: "insensitive" } },
        { adminEmail: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const onboardings = await this.prisma.commercialOnboarding.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: onboardingInclude,
    });

    return onboardings.map((ob) => ({
      id: ob.id,
      status: ob.status,
      clinicDisplayName: ob.clinicDisplayName,
      clinicContactEmail: ob.clinicContactEmail,
      adminEmail: ob.adminEmail,
      planCode: ob.plan.code,
      createdAt: ob.createdAt.toISOString(),
      updatedAt: ob.updatedAt.toISOString(),
      expiresAt: ob.expiresAt.toISOString(),
      paymentReference: ob.paymentReference,
      tenantId: ob.tenantId,
    }));
  }

  private async recordAuditLog(
    tx: CommercialTransactionClient,
    input: {
      action: string;
      actorProfile: string;
      targetType: string;
      targetId: string;
      tenantId?: string | null;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        action: input.action,
        actorUserId: null,
        actorProfile: input.actorProfile,
        actorRoles: [],
        tenantId: input.tenantId ?? null,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata,
      },
    });
  }
}
