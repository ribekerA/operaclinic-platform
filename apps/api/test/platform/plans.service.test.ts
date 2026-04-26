import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlansService } from "../../src/modules/platform/plans.service";

describe("PlansService", () => {
  const prisma = {
    $transaction: vi.fn(),
  };

  const auditService = {
    record: vi.fn(),
  };

  const actor = {
    userId: "user-1",
    profile: "platform",
    roles: ["SUPER_ADMIN"],
    tenantIds: [],
    activeTenantId: null,
    availableTenants: [],
    availableClinics: [],
    sessionVersion: 0,
  };

  beforeEach(() => {
    prisma.$transaction.mockReset();
    auditService.record.mockReset();
  });

  it("rejects unknown public commercial plan codes", async () => {
    const service = new PlansService(prisma as never, auditService as never);

    await expect(
      service.createPlan(
        {
          code: "PUBLICO_SOLTO",
          name: "Plano solto",
          priceCents: 1000,
          isPublic: true,
        },
        actor as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("normalizes public commercial plans from the shared catalog", async () => {
    const txMock = {
      plan: {
        create: vi.fn().mockResolvedValue({
          id: "plan-1",
          code: "ESTETICA_FLOW",
          name: "Flow Estetica",
          description:
            "Para clinicas com forte operacao no WhatsApp, confirmacao e remarcacao frequente.",
          priceCents: 34900,
          currency: "BRL",
          isPublic: true,
          isActive: true,
          createdAt: new Date("2026-03-16T12:00:00.000Z"),
          updatedAt: new Date("2026-03-16T12:00:00.000Z"),
        }),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: (tx: never) => unknown) =>
      callback(txMock as never),
    );

    const service = new PlansService(prisma as never, auditService as never);

    const result = await service.createPlan(
      {
        code: "ESTETICA_FLOW",
        name: "Nome divergente",
        description: "Descricao divergente",
        priceCents: 999,
        currency: "USD",
        isPublic: true,
      },
      actor as never,
    );

    expect(txMock.plan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: "ESTETICA_FLOW",
          name: "Flow Estetica",
          description:
            "Para clinicas com forte operacao no WhatsApp, confirmacao e remarcacao frequente.",
          priceCents: 34900,
          currency: "BRL",
          isPublic: true,
        }),
      }),
    );
    expect(result.name).toBe("Flow Estetica");
    expect(result.priceCents).toBe(34900);
  });
});
