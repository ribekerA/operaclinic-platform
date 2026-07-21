import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanEntitlementsService } from "../../src/common/plan-entitlements/plan-entitlements.service";

describe("PlanEntitlementsService.checkAudioTranscriptionQuota", () => {
  const prisma = {
    subscription: { findFirst: vi.fn() },
    tenantFeature: { findMany: vi.fn() },
    tenantSetting: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  };

  const auditService = {
    record: vi.fn(),
  };

  beforeEach(() => {
    prisma.subscription.findFirst.mockReset();
    prisma.tenantFeature.findMany.mockReset().mockResolvedValue([]);
    prisma.tenantSetting.findMany.mockReset().mockResolvedValue([]);
    prisma.$queryRaw.mockReset();
    auditService.record.mockReset();
  });

  function buildService(): PlanEntitlementsService {
    return new PlanEntitlementsService(prisma as never, auditService as never);
  }

  it("is unlimited for ESTETICA_SCALE and never sums usage (no cost incurred by the check itself)", async () => {
    prisma.subscription.findFirst.mockResolvedValue({ plan: { code: "ESTETICA_SCALE" } });

    const service = buildService();
    const result = await service.checkAudioTranscriptionQuota("tenant-1", 120);

    expect(result).toEqual({ allowed: true, limit: null, usedSecondsThisMonth: 0 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("allows the estimated increment when usage + estimate stays within the plan limit", async () => {
    prisma.subscription.findFirst.mockResolvedValue({ plan: { code: "ESTETICA_START" } }); // limit 3000
    prisma.$queryRaw.mockResolvedValue([{ total: 100 }]);

    const service = buildService();
    const result = await service.checkAudioTranscriptionQuota("tenant-1", 120);

    expect(result).toEqual({ allowed: true, limit: 3_000, usedSecondsThisMonth: 100 });
  });

  it("allows the estimated increment when it lands exactly on the limit boundary", async () => {
    prisma.subscription.findFirst.mockResolvedValue({ plan: { code: "ESTETICA_START" } }); // limit 3000
    prisma.$queryRaw.mockResolvedValue([{ total: 2_880 }]);

    const service = buildService();
    const result = await service.checkAudioTranscriptionQuota("tenant-1", 120);

    expect(result).toEqual({ allowed: true, limit: 3_000, usedSecondsThisMonth: 2_880 });
  });

  it("blocks the estimated increment when usage + estimate would exceed the plan limit", async () => {
    prisma.subscription.findFirst.mockResolvedValue({ plan: { code: "ESTETICA_START" } }); // limit 3000
    prisma.$queryRaw.mockResolvedValue([{ total: 2_950 }]);

    const service = buildService();
    const result = await service.checkAudioTranscriptionQuota("tenant-1", 120);

    expect(result).toEqual({ allowed: false, limit: 3_000, usedSecondsThisMonth: 2_950 });
  });

  it("falls back to the most restrictive plan (ESTETICA_START) when the tenant has no open subscription", async () => {
    prisma.subscription.findFirst.mockResolvedValue(null);
    prisma.$queryRaw.mockResolvedValue([{ total: 0 }]);

    const service = buildService();
    const result = await service.checkAudioTranscriptionQuota("tenant-1", 120);

    expect(result.limit).toBe(3_000);
  });

  it("applies a per-tenant TenantSetting override on top of the base plan default (global default + per-tenant override)", async () => {
    prisma.subscription.findFirst.mockResolvedValue({ plan: { code: "ESTETICA_START" } }); // base 3000
    prisma.tenantSetting.findMany.mockResolvedValue([
      { key: "planLimit.monthlyTranscriptionSeconds", value: "6000" },
    ]);
    prisma.$queryRaw.mockResolvedValue([{ total: 5_000 }]);

    const service = buildService();
    const result = await service.checkAudioTranscriptionQuota("tenant-1", 120);

    expect(result).toEqual({ allowed: true, limit: 6_000, usedSecondsThisMonth: 5_000 });
  });

  it("treats the 'unlimited' sentinel override as no limit, skipping the usage sum entirely", async () => {
    prisma.subscription.findFirst.mockResolvedValue({ plan: { code: "ESTETICA_START" } });
    prisma.tenantSetting.findMany.mockResolvedValue([
      { key: "planLimit.monthlyTranscriptionSeconds", value: "unlimited" },
    ]);

    const service = buildService();
    const result = await service.checkAudioTranscriptionQuota("tenant-1", 120);

    expect(result).toEqual({ allowed: true, limit: null, usedSecondsThisMonth: 0 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("sums usage via a tenant-scoped raw query when the plan is limited", async () => {
    prisma.subscription.findFirst.mockResolvedValue({ plan: { code: "ESTETICA_START" } });
    prisma.$queryRaw.mockResolvedValue([{ total: 42 }]);

    const service = buildService();
    await service.checkAudioTranscriptionQuota("tenant-1", 30);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw.mock.calls[0]).toContain("tenant-1");
  });

  it("treats a missing/empty aggregate row as zero usage", async () => {
    prisma.subscription.findFirst.mockResolvedValue({ plan: { code: "ESTETICA_START" } });
    prisma.$queryRaw.mockResolvedValue([]);

    const service = buildService();
    const result = await service.checkAudioTranscriptionQuota("tenant-1", 120);

    expect(result.usedSecondsThisMonth).toBe(0);
    expect(result.allowed).toBe(true);
  });
});
