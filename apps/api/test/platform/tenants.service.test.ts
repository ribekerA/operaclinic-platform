import {
  SubscriptionStatus,
  TenantStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TenantsService } from "../../src/modules/platform/tenants.service";
import { buildPlatformActor } from "../helpers/actors";

describe("TenantsService", () => {
  const prisma = {
    $transaction: vi.fn(),
  };
  const auditService = {
    record: vi.fn(),
  };
  const subscriptionsService = {
    getOpenStatuses: vi.fn(),
    createActiveSubscription: vi.fn(),
  };
  const tenantSettingsService = {
    buildInitialSettings: vi.fn(),
    upsertMany: vi.fn(),
    toMap: vi.fn(),
  };

  beforeEach(() => {
    prisma.$transaction.mockReset();
    auditService.record.mockReset();
    subscriptionsService.getOpenStatuses.mockReset();
    subscriptionsService.createActiveSubscription.mockReset();
    tenantSettingsService.buildInitialSettings.mockReset();
    tenantSettingsService.upsertMany.mockReset();
    tenantSettingsService.toMap.mockReset();

    subscriptionsService.getOpenStatuses.mockReturnValue([
      SubscriptionStatus.TRIAL,
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.PAST_DUE,
    ]);
    tenantSettingsService.buildInitialSettings.mockReturnValue({
      locale: "pt-BR",
      currency: "BRL",
      queue_mode: "reception",
    });
    tenantSettingsService.toMap.mockReturnValue({
      locale: "pt-BR",
      currency: "BRL",
      queue_mode: "reception",
    });
  });

  it("creates a tenant with base subscription and initial settings", async () => {
    const createdTenant = {
      id: "tenant-2",
      slug: "clinic-two",
      name: "Clinic Two",
      timezone: "America/Sao_Paulo",
      status: TenantStatus.ACTIVE,
      createdAt: new Date("2026-03-13T10:00:00.000Z"),
      updatedAt: new Date("2026-03-13T10:00:00.000Z"),
      tenantSettings: [
        {
          key: "locale",
          value: "pt-BR",
        },
      ],
      subscriptions: [
        {
          id: "subscription-1",
          status: SubscriptionStatus.ACTIVE,
          startsAt: new Date("2026-03-13T10:00:00.000Z"),
          endsAt: null,
          plan: {
            id: "plan-1",
            code: "BASE_MVP",
            name: "Base MVP",
          },
        },
      ],
    };
    const tx = {
      plan: {
        findFirst: vi.fn().mockResolvedValue({
          id: "plan-1",
          code: "BASE_MVP",
          isActive: true,
        }),
      },
      tenant: {
        create: vi.fn().mockResolvedValue({
          id: "tenant-2",
          slug: "clinic-two",
          name: "Clinic Two",
          timezone: "America/Sao_Paulo",
        }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(createdTenant),
      },
    };

    prisma.$transaction.mockImplementation(
      async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
    );

    const service = new TenantsService(
      prisma as never,
      auditService as never,
      subscriptionsService as never,
      tenantSettingsService as never,
    );

    const result = await service.createTenant(
      {
        slug: "clinic-two",
        name: "Clinic Two",
        timezone: "America/Sao_Paulo",
        settings: {
          queue_mode: "reception",
        },
      },
      buildPlatformActor(),
    );

    expect(tx.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: "clinic-two",
          name: "Clinic Two",
          timezone: "America/Sao_Paulo",
          status: TenantStatus.ACTIVE,
        }),
      }),
    );
    expect(tenantSettingsService.upsertMany).toHaveBeenCalledWith(
      "tenant-2",
      expect.objectContaining({
        queue_mode: "reception",
      }),
      tx,
    );
    expect(subscriptionsService.createActiveSubscription).toHaveBeenCalledWith(
      "tenant-2",
      "plan-1",
      tx,
    );
    expect(result.id).toBe("tenant-2");
    expect(result.currentPlan?.code).toBe("BASE_MVP");
    expect(result.settings).toEqual(
      expect.objectContaining({
        queue_mode: "reception",
      }),
    );
  });
});
