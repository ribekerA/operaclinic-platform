import {
  CommercialOnboardingStatus,
  TenantStatus,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommercialService } from "../../src/modules/commercial/commercial.service";

const VALID_PUBLIC_TOKEN = "token-publico-comprido-para-testes-123456";

function buildPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-1",
    code: "ESTETICA_FLOW",
    name: "Flow Estetica",
    description: "Plano comercial publico.",
    priceCents: 34900,
    currency: "BRL",
    isPublic: true,
    isActive: true,
    ...overrides,
  };
}

function buildOnboarding(overrides: Record<string, unknown> = {}) {
  return {
    id: "onboarding-1",
    publicTokenHash: "hash-token",
    status: CommercialOnboardingStatus.INITIATED,
    planId: "plan-1",
    plan: buildPlan(),
    expiresAt: new Date("2099-03-17T18:00:00.000Z"),
    clinicDisplayName: null,
    clinicLegalName: null,
    clinicDocumentNumber: null,
    clinicContactEmail: null,
    clinicContactPhone: null,
    timezone: null,
    initialUnitName: null,
    adminFullName: null,
    adminEmail: null,
    adminPasswordHash: null,
    paymentReference: null,
    checkoutConfirmedAt: null,
    onboardingStartedAt: null,
    onboardingCompletedAt: null,
    tenantId: null,
    clinicId: null,
    unitId: null,
    adminUserId: null,
    subscriptionId: null,
    createdAt: new Date("2026-03-15T18:00:00.000Z"),
    updatedAt: new Date("2026-03-15T18:00:00.000Z"),
    ...overrides,
  };
}

describe("CommercialService", () => {
  const prisma = {
    plan: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    commercialOnboarding: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const tenantSettingsService = {
    buildInitialSettings: vi.fn(),
    upsertMany: vi.fn(),
  };

  const configService = {
    get: vi.fn((key: string, fallback?: unknown) => {
      if (key === "commercial.onboardingTtlHours") {
        return 48;
      }

      if (key === "commercial.enableMockCheckout") {
        return false;
      }

      return fallback;
    }),
  };

  const paymentAdapterFactory = {
    getAdapter: vi.fn(() => ({
      createCheckout: vi.fn(),
      confirmPayment: vi.fn(),
      handleWebhookEvent: vi.fn(),
      verifyWebhookSignature: vi.fn(),
    })),
  };

  beforeEach(() => {
    prisma.plan.findMany.mockReset();
    prisma.plan.findFirst.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.commercialOnboarding.create.mockReset();
    prisma.commercialOnboarding.findFirst.mockReset();
    prisma.commercialOnboarding.findMany.mockReset();
    prisma.commercialOnboarding.findUnique.mockReset();
    prisma.commercialOnboarding.update.mockReset();
    prisma.commercialOnboarding.updateMany.mockReset();
    prisma.$transaction.mockReset();
    tenantSettingsService.buildInitialSettings.mockReset();
    tenantSettingsService.upsertMany.mockReset();
    configService.get.mockClear();
    paymentAdapterFactory.getAdapter.mockClear();
    prisma.commercialOnboarding.findMany.mockResolvedValue([]);
    prisma.commercialOnboarding.findFirst.mockResolvedValue(null);
    delete process.env.NODE_ENV;
  });

  it("starts a commercial onboarding with a public plan only", async () => {
    prisma.plan.findFirst.mockResolvedValue(buildPlan());

    const txMock = {
      commercialOnboarding: {
        create: vi.fn().mockResolvedValue(buildOnboarding()),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: (tx: never) => unknown) =>
      callback(txMock as never),
    );

    const service = new CommercialService(
      prisma as never,
      tenantSettingsService as never,
      configService as never,
      paymentAdapterFactory as never,
    );

    const result = await service.startOnboarding({ planId: "plan-1" });

    expect(result.onboardingToken).toEqual(expect.any(String));
    expect(result.onboarding.status).toBe(CommercialOnboardingStatus.INITIATED);
    expect(result.onboarding.selectedPlan.code).toBe("ESTETICA_FLOW");
    expect(result.onboarding.selectedPlan.publicMetadata?.slug).toBe(
      "flow-estetica",
    );
    expect(txMock.commercialOnboarding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          planId: "plan-1",
          status: CommercialOnboardingStatus.INITIATED,
        }),
      }),
    );
  });

  it("completes the registration snapshot and moves the flow to awaiting payment", async () => {
    prisma.commercialOnboarding.findUnique.mockResolvedValue(buildOnboarding());
    prisma.user.findUnique.mockResolvedValue(null);

    const txMock = {
      commercialOnboarding: {
        update: vi.fn().mockResolvedValue(
          buildOnboarding({
            status: CommercialOnboardingStatus.AWAITING_PAYMENT,
            clinicDisplayName: "Clinica Aurora",
            clinicContactEmail: "contato@aurora.local",
            clinicContactPhone: "(11) 98888-0000",
            timezone: "America/Sao_Paulo",
            initialUnitName: "Unidade Jardins",
            adminFullName: "Dra. Paula",
            adminEmail: "admin@aurora.local",
            adminPasswordHash: "hashed-password",
          }),
        ),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: (tx: never) => unknown) =>
      callback(txMock as never),
    );

    const service = new CommercialService(
      prisma as never,
      tenantSettingsService as never,
      configService as never,
      paymentAdapterFactory as never,
    );

    const result = await service.completeOnboarding(VALID_PUBLIC_TOKEN, {
      clinicDisplayName: "Clinica Aurora",
      clinicContactEmail: "contato@aurora.local",
      clinicContactPhone: "(11) 98888-0000",
      timezone: "America/Sao_Paulo",
      initialUnitName: "Unidade Jardins",
      adminFullName: "Dra. Paula",
      adminEmail: "admin@aurora.local",
      adminPassword: "Senha123",
    });

    expect(result.status).toBe(CommercialOnboardingStatus.AWAITING_PAYMENT);
    expect(result.admin.email).toBe("admin@aurora.local");
    expect(result.nextStep).toBe("confirm_checkout");
    expect(txMock.commercialOnboarding.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clinicDisplayName: "Clinica Aurora",
          adminEmail: "admin@aurora.local",
          status: CommercialOnboardingStatus.AWAITING_PAYMENT,
        }),
      }),
    );
  });

  it("finalizes the onboarding creating tenant, clinic, unit, admin and subscription", async () => {
    const paidOnboarding = buildOnboarding({
      status: CommercialOnboardingStatus.PAID,
      clinicDisplayName: "Clinica Aurora",
      clinicContactEmail: "contato@aurora.local",
      clinicContactPhone: "(11) 98888-0000",
      timezone: "America/Sao_Paulo",
      initialUnitName: "Unidade Jardins",
      adminFullName: "Dra. Paula",
      adminEmail: "admin@aurora.local",
      adminPasswordHash: "hashed-password",
      checkoutConfirmedAt: new Date("2026-03-15T18:10:00.000Z"),
      paymentReference: "mock-1",
    });

    prisma.commercialOnboarding.findUnique.mockResolvedValue(paidOnboarding);
    prisma.plan.findFirst.mockResolvedValue(buildPlan());
    prisma.user.findUnique.mockResolvedValue(null);
    tenantSettingsService.buildInitialSettings.mockReturnValue({
      locale: "pt-BR",
      currency: "BRL",
    });

    const txMock = {
      commercialOnboarding: {
        update: vi
          .fn()
          .mockResolvedValueOnce(
            buildOnboarding({
              ...paidOnboarding,
              status: CommercialOnboardingStatus.ONBOARDING_STARTED,
              onboardingStartedAt: new Date("2026-03-15T18:12:00.000Z"),
            }),
          )
          .mockResolvedValueOnce(
            buildOnboarding({
              ...paidOnboarding,
              status: CommercialOnboardingStatus.ONBOARDING_COMPLETED,
              tenantId: "tenant-aurora",
              clinicId: "clinic-aurora",
              unitId: "unit-aurora",
              adminUserId: "user-admin",
              subscriptionId: "sub-aurora",
              onboardingStartedAt: new Date("2026-03-15T18:12:00.000Z"),
              onboardingCompletedAt: new Date("2026-03-15T18:12:01.000Z"),
            }),
          ),
      },
      tenant: {
        create: vi.fn().mockResolvedValue({
          id: "tenant-aurora",
          slug: "clinica-aurora",
          name: "Clinica Aurora",
          timezone: "America/Sao_Paulo",
          status: TenantStatus.ACTIVE,
        }),
      },
      clinic: {
        create: vi.fn().mockResolvedValue({
          id: "clinic-aurora",
        }),
      },
      unit: {
        create: vi.fn().mockResolvedValue({
          id: "unit-aurora",
        }),
      },
      role: {
        findUnique: vi.fn().mockResolvedValue({
          id: "role-tenant-admin",
        }),
      },
      user: {
        create: vi.fn().mockResolvedValue({
          id: "user-admin",
          email: "admin@aurora.local",
          status: UserStatus.INVITED,
        }),
      },
      userRole: {
        create: vi.fn(),
      },
      subscription: {
        create: vi.fn().mockResolvedValue({
          id: "sub-aurora",
        }),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: (tx: never) => unknown) =>
      callback(txMock as never),
    );

    const service = new CommercialService(
      prisma as never,
      tenantSettingsService as never,
      configService as never,
      paymentAdapterFactory as never,
    );

    const result = await service.finalizeOnboarding(VALID_PUBLIC_TOKEN);

    expect(result.status).toBe(CommercialOnboardingStatus.ONBOARDING_COMPLETED);
    expect(result.login).toEqual({
      path: "/login/clinic",
      email: "admin@aurora.local",
    });
    expect(txMock.tenant.create).toHaveBeenCalled();
    expect(txMock.clinic.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-aurora",
          displayName: "Clinica Aurora",
        }),
      }),
    );
    expect(txMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "admin@aurora.local",
          fullName: "Dra. Paula",
          status: UserStatus.INVITED,
        }),
      }),
    );
    expect(txMock.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-aurora",
          planId: "plan-1",
        }),
      }),
    );
    expect(txMock.commercialOnboarding.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CommercialOnboardingStatus.ONBOARDING_COMPLETED,
          adminPasswordHash: null,
        }),
      }),
    );
  });

  it("blocks duplicate pending onboarding for the same admin email", async () => {
    prisma.commercialOnboarding.findUnique.mockResolvedValue(buildOnboarding());
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.commercialOnboarding.findFirst.mockResolvedValue(
      buildOnboarding({
        id: "onboarding-2",
        status: CommercialOnboardingStatus.AWAITING_PAYMENT,
        adminEmail: "admin@aurora.local",
      }),
    );

    const service = new CommercialService(
      prisma as never,
      tenantSettingsService as never,
      configService as never,
      paymentAdapterFactory as never,
    );

    await expect(
      service.completeOnboarding(VALID_PUBLIC_TOKEN, {
        clinicDisplayName: "Clinica Aurora",
        clinicContactEmail: "contato@aurora.local",
        clinicContactPhone: "(11) 98888-0000",
        timezone: "America/Sao_Paulo",
        initialUnitName: "Unidade Jardins",
        adminFullName: "Dra. Paula",
        adminEmail: "admin@aurora.local",
        adminPassword: "Senha123",
      }),
    ).rejects.toThrow("There is already an onboarding in progress for this admin email.");
  });

  it("expires stale onboarding on lookup and clears the temporary admin password hash", async () => {
    const expiredOnboarding = buildOnboarding({
      status: CommercialOnboardingStatus.AWAITING_PAYMENT,
      expiresAt: new Date("2026-03-15T10:00:00.000Z"),
      adminEmail: "admin@aurora.local",
      adminPasswordHash: "hashed-password",
    });

    prisma.commercialOnboarding.findMany.mockResolvedValue([]);
    prisma.commercialOnboarding.findUnique.mockResolvedValueOnce(expiredOnboarding);

    const txMock = {
      commercialOnboarding: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(
          buildOnboarding({
            ...expiredOnboarding,
            status: CommercialOnboardingStatus.EXPIRED,
            adminPasswordHash: null,
          }),
        ),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: (tx: never) => unknown) =>
      callback(txMock as never),
    );

    const service = new CommercialService(
      prisma as never,
      tenantSettingsService as never,
      configService as never,
      paymentAdapterFactory as never,
    );

    const result = await service.getOnboarding(VALID_PUBLIC_TOKEN);

    expect(result.status).toBe(CommercialOnboardingStatus.EXPIRED);
    expect(result.nextStep).toBe("restart_onboarding");
    expect(txMock.commercialOnboarding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CommercialOnboardingStatus.EXPIRED,
          adminPasswordHash: null,
        }),
      }),
    );
  });

  it("requires explicit mock checkout enablement even outside production", async () => {
    prisma.commercialOnboarding.findUnique.mockResolvedValue(
      buildOnboarding({
        status: CommercialOnboardingStatus.AWAITING_PAYMENT,
      }),
    );

    configService.get.mockImplementation((key: string, fallback?: unknown) => {
      if (key === "commercial.onboardingTtlHours") {
        return 48;
      }

      if (key === "commercial.enableMockCheckout") {
        return false;
      }

      return fallback;
    });

    const service = new CommercialService(
      prisma as never,
      tenantSettingsService as never,
      configService as never,
      paymentAdapterFactory as never,
    );

    await expect(service.confirmCheckout(VALID_PUBLIC_TOKEN)).rejects.toThrow(
      "Mock checkout confirmation is disabled for this environment.",
    );
  });
});
