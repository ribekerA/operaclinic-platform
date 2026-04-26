import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentMessageBridgeService } from "../../src/modules/agent/agent-message-bridge.service";

const makeHandoffFind = (hasHandoff: boolean) =>
  vi.fn().mockResolvedValue(hasHandoff ? { id: "handoff-1" } : null);

function buildService(
  hasActiveHandoff: boolean,
  orchestratorResult?: object,
) {
  const prisma = {
    handoffRequest: {
      findFirst: makeHandoffFind(hasActiveHandoff),
    },
  };

  const orchestrator = {
    executeCaptacao: vi.fn().mockResolvedValue(
      orchestratorResult ?? {
        meta: { status: "WAITING_FOR_INPUT", actorUserId: "system", tenantId: "t1", threadId: "th1", correlationId: "c1", steps: [] },
        patient: null,
        handoff: null,
        thread: null,
        replyText: "ok",
      },
    ),
  };

  const configService = {
    get: vi.fn((key: string, fallback?: unknown) => {
      if (key === "agent.enabled") {
        return true;
      }

      if (key === "agent.rolloutPercentage") {
        return 100;
      }

      return fallback;
    }),
  };

  const service = new AgentMessageBridgeService(
    prisma as never,
    orchestrator as never,
    configService as never,
  );

  return { service, prisma, orchestrator, configService };
}

describe("AgentMessageBridgeService", () => {
  describe("routeInboundMessage", () => {
    it("calls CaptacaoAgent when thread has no active handoff", async () => {
      const { service, orchestrator } = buildService(false);

      await service.routeInboundMessage({
        tenantId: "tenant-1",
        threadId: "thread-1",
        messageText: "Quero agendar uma consulta",
        senderPhoneNumber: "+5511999999999",
        senderDisplayName: "Maria",
        patientId: null,
      });

      expect(orchestrator.executeCaptacao).toHaveBeenCalledOnce();
      expect(orchestrator.executeCaptacao).toHaveBeenCalledWith(
        expect.objectContaining({ activeTenantId: "tenant-1" }),
        expect.objectContaining({
          threadId: "thread-1",
          messageText: "Quero agendar uma consulta",
          patientPhone: "+5511999999999",
          patientName: "Maria",
        }),
      );
    });

    it("skips agent when thread has an active handoff", async () => {
      const { service, orchestrator } = buildService(true);

      await service.routeInboundMessage({
        tenantId: "tenant-1",
        threadId: "thread-1",
        messageText: "Quero agendar",
        senderPhoneNumber: "+5511999999999",
        senderDisplayName: null,
        patientId: null,
      });

      expect(orchestrator.executeCaptacao).not.toHaveBeenCalled();
    });

    it("skips agent when messageText is empty", async () => {
      const { service, orchestrator } = buildService(false);

      await service.routeInboundMessage({
        tenantId: "tenant-1",
        threadId: "thread-1",
        messageText: null,
        senderPhoneNumber: "+5511999999999",
        senderDisplayName: null,
        patientId: null,
      });

      expect(orchestrator.executeCaptacao).not.toHaveBeenCalled();
    });

    it("skips agent when messageText is only whitespace", async () => {
      const { service, orchestrator } = buildService(false);

      await service.routeInboundMessage({
        tenantId: "tenant-1",
        threadId: "thread-1",
        messageText: "   ",
        senderPhoneNumber: "+5511999999999",
        senderDisplayName: null,
        patientId: null,
      });

      expect(orchestrator.executeCaptacao).not.toHaveBeenCalled();
    });

    it("does NOT throw when agent execution fails", async () => {
      const prisma = {
        handoffRequest: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      const orchestrator = {
        executeCaptacao: vi.fn().mockRejectedValue(new Error("Agent exploded")),
      };

      const service = new AgentMessageBridgeService(
        prisma as never,
        orchestrator as never,
        {
          get: vi.fn((key: string, fallback?: unknown) => {
            if (key === "agent.enabled") {
              return true;
            }

            if (key === "agent.rolloutPercentage") {
              return 100;
            }

            return fallback;
          }),
        } as never,
      );

      // Should resolve without throwing
      await expect(
        service.routeInboundMessage({
          tenantId: "tenant-1",
          threadId: "thread-1",
          messageText: "Oi",
          senderPhoneNumber: "+5511999999999",
          senderDisplayName: null,
          patientId: null,
        }),
      ).resolves.toBeUndefined();
    });

    it("does NOT throw when DB query fails", async () => {
      const prisma = {
        handoffRequest: {
          findFirst: vi.fn().mockRejectedValue(new Error("DB connection lost")),
        },
      };
      const orchestrator = {
        executeCaptacao: vi.fn(),
      };

      const service = new AgentMessageBridgeService(
        prisma as never,
        orchestrator as never,
        {
          get: vi.fn((key: string, fallback?: unknown) => {
            if (key === "agent.enabled") {
              return true;
            }

            if (key === "agent.rolloutPercentage") {
              return 100;
            }

            return fallback;
          }),
        } as never,
      );

      await expect(
        service.routeInboundMessage({
          tenantId: "tenant-1",
          threadId: "thread-1",
          messageText: "Oi",
          senderPhoneNumber: "+5511999999999",
          senderDisplayName: null,
          patientId: null,
        }),
      ).resolves.toBeUndefined();

      expect(orchestrator.executeCaptacao).not.toHaveBeenCalled();
    });

    it("passes correlationId when provided", async () => {
      const { service, orchestrator } = buildService(false);

      await service.routeInboundMessage({
        tenantId: "tenant-1",
        threadId: "thread-1",
        messageText: "Oi",
        senderPhoneNumber: "+5511999999999",
        senderDisplayName: null,
        patientId: null,
        correlationId: "my-corr-id",
      });

      expect(orchestrator.executeCaptacao).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ correlationId: "my-corr-id" }),
      );
    });

    it("builds system actor with correct tenant context", async () => {
      const { service, orchestrator } = buildService(false);

      await service.routeInboundMessage({
        tenantId: "clinic-xyz",
        threadId: "thread-1",
        messageText: "Quero marcar",
        senderPhoneNumber: "+5511999999999",
        senderDisplayName: null,
        patientId: null,
      });

      const actorArg = orchestrator.executeCaptacao.mock.calls[0]?.[0];
      expect(actorArg.activeTenantId).toBe("clinic-xyz");
      expect(actorArg.tenantIds).toContain("clinic-xyz");
      expect(actorArg.profile).toBe("clinic");
    });

    it("skips execution when agent layer is disabled", async () => {
      const { prisma, orchestrator } = buildService(false);

      const service = new AgentMessageBridgeService(
        prisma as never,
        orchestrator as never,
        {
          get: vi.fn((key: string, fallback?: unknown) => {
            if (key === "agent.enabled") {
              return false;
            }

            if (key === "agent.rolloutPercentage") {
              return 100;
            }

            return fallback;
          }),
        } as never,
      );

      await service.routeInboundMessage({
        tenantId: "tenant-1",
        threadId: "thread-1",
        messageText: "Quero agendar",
        senderPhoneNumber: "+5511999999999",
        senderDisplayName: null,
        patientId: null,
      });

      expect(orchestrator.executeCaptacao).not.toHaveBeenCalled();
    });

    it("skips execution when rollout percentage is 0", async () => {
      const { prisma, orchestrator } = buildService(false);

      const service = new AgentMessageBridgeService(
        prisma as never,
        orchestrator as never,
        {
          get: vi.fn((key: string, fallback?: unknown) => {
            if (key === "agent.enabled") {
              return true;
            }

            if (key === "agent.rolloutPercentage") {
              return 0;
            }

            return fallback;
          }),
        } as never,
      );

      await service.routeInboundMessage({
        tenantId: "tenant-1",
        threadId: "thread-1",
        messageText: "Quero agendar",
        senderPhoneNumber: "+5511999999999",
        senderDisplayName: null,
        patientId: null,
      });

      expect(orchestrator.executeCaptacao).not.toHaveBeenCalled();
    });

    it("SECURITY: scopes handoffRequest query to tenantId — prevents cross-tenant handoff lookup", async () => {
      const { service, prisma } = buildService(false);

      await service.routeInboundMessage({
        tenantId: "tenant-A",
        threadId: "thread-A1",
        messageText: "Quero agendar",
        senderPhoneNumber: "+5511999999999",
        senderDisplayName: null,
        patientId: null,
      });

      expect(prisma.handoffRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-A",
            threadId: "thread-A1",
          }),
        }),
      );
    });

    it("SECURITY: two concurrent tenants do not share handoff lookup scope", async () => {
      const { service: serviceA, prisma: prismaA } = buildService(false);
      const { service: serviceB, prisma: prismaB } = buildService(false);

      await Promise.all([
        serviceA.routeInboundMessage({
          tenantId: "tenant-A",
          threadId: "thread-A1",
          messageText: "Mensagem A",
          senderPhoneNumber: "+5511111111111",
          senderDisplayName: null,
          patientId: null,
        }),
        serviceB.routeInboundMessage({
          tenantId: "tenant-B",
          threadId: "thread-B1",
          messageText: "Mensagem B",
          senderPhoneNumber: "+5522222222222",
          senderDisplayName: null,
          patientId: null,
        }),
      ]);

      expect(prismaA.handoffRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-A" }) }),
      );
      expect(prismaB.handoffRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-B" }) }),
      );

      // Confirm each prisma instance was called exactly once and with its own tenant scope
      const callsA = prismaA.handoffRequest.findFirst.mock.calls;
      const callsB = prismaB.handoffRequest.findFirst.mock.calls;
      expect(callsA.every((c: any[]) => c[0].where.tenantId === "tenant-A")).toBe(true);
      expect(callsB.every((c: any[]) => c[0].where.tenantId === "tenant-B")).toBe(true);
    });
  });
});
