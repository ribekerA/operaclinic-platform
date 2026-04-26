import { describe, expect, it, vi } from "vitest";
import { AgentOrchestratorService } from "../../src/modules/agent/agent-orchestrator.service";

describe("AgentOrchestratorService", () => {
  it("builds agent context from the authenticated clinic user and fetches memory", async () => {
    const session = {
      getSteps: vi.fn().mockReturnValue([]),
      getSummary: vi.fn().mockReturnValue({
        context: {
          tenantId: "tenant-1",
          threadId: "thread-1",
        },
        intents: [],
        decisions: 0,
        skillCalls: 0,
        escalations: 0,
        isEscalated: false,
        duration: 12,
      }),
      skillCalls: [],
      startedAt: new Date("2026-03-20T10:00:00.000Z"),
    };
    const runtime = {
      createSessionFromContext: vi.fn().mockReturnValue(session),
    };
    const prisma = {
      messageThread: {
        findUnique: vi.fn().mockResolvedValue({
          id: "thread-1",
          patientId: "patient-1",
          lastIntent: "FAQ_SIMPLE",
          patient: {
            intentHistory: ["LEAD_CAPTURE"],
          },
        }),
      },
      messageEvent: {
        findFirst: vi.fn().mockResolvedValue({
          metadata: {
            source: "AGENT",
            offeredSlots: [
              {
                startAt: "2026-03-28T10:00:00.000Z",
                endAt: "2026-03-28T10:30:00.000Z",
              },
            ],
          },
        }),
      },
      agentExecution: {
        create: vi.fn().mockResolvedValue({
          id: "execution-1",
        }),
      },
      messageThreadResolution: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    };
    const captacaoAgent = {
      execute: vi.fn().mockResolvedValue({
        status: "WAITING_FOR_INPUT",
        patient: null,
        handoff: null,
        thread: null,
        replyText: "ok",
      }),
    };
    const agendamentoAgent = {
      execute: vi.fn(),
    };
    const service = new AgentOrchestratorService(
      prisma as never,
      runtime as never,
      captacaoAgent as never,
      agendamentoAgent as never,
    );

    const result = await service.executeCaptacao(
      {
        id: "user-1",
        email: "recepcao@clinica.local",
        profile: "clinic",
        roles: ["RECEPTION"] as any,
        tenantIds: ["tenant-1"],
        activeTenantId: "tenant-1",
      } as any,
      {
        threadId: "thread-1",
        messageText: "oi",
      },
    );

    expect(prisma.messageThread.findUnique).toHaveBeenCalledWith({
      where: { id: "thread-1" },
      include: { patient: true },
    });

    expect(runtime.createSessionFromContext).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        threadId: "thread-1",
        historicalContext: {
          lastIntents: ["LEAD_CAPTURE"],
          offeredSlots: [
            {
              startAt: "2026-03-28T10:00:00.000Z",
              endAt: "2026-03-28T10:30:00.000Z",
            },
          ],
        },
      }),
    );
    expect(result.meta.actorUserId).toBe("user-1");
    expect(result.meta.tenantId).toBe("tenant-1");
    expect(captacaoAgent.execute).toHaveBeenCalledWith(session, {
      threadId: "thread-1",
      messageText: "oi",
    });
    expect(prisma.agentExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        threadId: "thread-1",
        agent: "CAPTACAO",
        status: "WAITING_FOR_INPUT",
        correlationId: expect.any(String),
      }),
    });
    expect(prisma.messageThreadResolution.create).not.toHaveBeenCalled();
  });

  it("persists an automated thread resolution outcome when the agent completes without handoff", async () => {
    const session = {
      getSteps: vi.fn().mockReturnValue([]),
      getSummary: vi.fn().mockReturnValue({
        context: {
          tenantId: "tenant-1",
          threadId: "thread-1",
        },
        intents: [],
        decisions: 0,
        skillCalls: 0,
        escalations: 0,
        isEscalated: false,
        duration: 12,
      }),
      skillCalls: [],
      startedAt: new Date("2026-03-20T10:00:00.000Z"),
    };
    const runtime = {
      createSessionFromContext: vi.fn().mockReturnValue(session),
    };
    const prisma = {
      messageThread: {
        findUnique: vi.fn().mockResolvedValue({
          id: "thread-1",
          patientId: "patient-1",
          lastIntent: null,
          patient: null,
        }),
      },
      messageEvent: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      agentExecution: {
        create: vi.fn().mockResolvedValue({
          id: "execution-2",
        }),
      },
      messageThreadResolution: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    };
    const captacaoAgent = {
      execute: vi.fn().mockResolvedValue({
        status: "COMPLETED",
        patient: {
          id: "patient-1",
        },
        handoff: null,
        thread: {
          status: "OPEN",
        },
        replyText: "Conversa concluida",
      }),
    };
    const agendamentoAgent = {
      execute: vi.fn(),
    };
    const service = new AgentOrchestratorService(
      prisma as never,
      runtime as never,
      captacaoAgent as never,
      agendamentoAgent as never,
    );

    await service.executeCaptacao(
      {
        id: "user-1",
        email: "recepcao@clinica.local",
        profile: "clinic",
        roles: ["RECEPTION"] as any,
        tenantIds: ["tenant-1"],
        activeTenantId: "tenant-1",
      } as any,
      {
        threadId: "thread-1",
        messageText: "obrigado",
        correlationId: "corr-1",
      },
    );

    expect(prisma.messageThreadResolution.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        correlationId: "corr-1",
        actorType: "AUTOMATION",
      },
      select: {
        id: true,
      },
    });
    expect(prisma.messageThreadResolution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        threadId: "thread-1",
        patientId: "patient-1",
        agentExecutionId: "execution-2",
        actorType: "AUTOMATION",
        correlationId: "corr-1",
      }),
    });
  });
});
