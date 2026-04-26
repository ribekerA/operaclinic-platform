import { describe, expect, it, vi, beforeEach } from "vitest";
import { AgentRuntimeSession } from "../../src/modules/agent/agent-runtime.service";
import { AgendamentoAgentService } from "../../src/modules/agent/agents/agendamento-agent.service";
import { IntentRouterService } from "../../src/modules/agent/services/intent-router.service";
import { GuardrailvService } from "../../src/modules/agent/services/guardrails.service";
import { EscalationPolicyService } from "../../src/modules/agent/services/escalation-policy.service";

function createSessionMock() {
  return {
    conversationContext: {
      tenantId: "tenant-1",
      actorUserId: "user-1",
      source: "AGENT" as const,
      threadId: "thread-1",
      correlationId: "corr-1",
      channel: "WHATSAPP" as const,
      timestamp: new Date(),
    },
    intentHistory: [],
    decisions: [],
    executeSkill: vi.fn(),
    getSteps: vi.fn().mockReturnValue([]),
  } as unknown as AgentRuntimeSession;
}

describe("AgendamentoAgentService", () => {
  let service: AgendamentoAgentService;
  let intentRouter: IntentRouterService;
  let guardrails: GuardrailvService;
  let escalationPolicy: EscalationPolicyService;

  beforeEach(() => {
    intentRouter = new IntentRouterService();
    guardrails = new GuardrailvService();
    escalationPolicy = new EscalationPolicyService();
    service = new AgendamentoAgentService(
      intentRouter,
      guardrails,
      escalationPolicy,
    );
  });

  describe("scheduling flow", () => {
    it("captures scheduling intent and offers available slots", async () => {
      const session = createSessionMock();
      const executeSkill = vi.mocked(session.executeSkill);

      const mockSlots = [
        {
          startsAt: "2026-03-20T10:00:00Z",
          endsAt: "2026-03-20T11:00:00Z",
          professional: { id: "prof-1", displayName: "Dr. Silva" },
        },
        {
          startsAt: "2026-03-20T14:00:00Z",
          endsAt: "2026-03-20T15:00:00Z",
          professional: { id: "prof-1", displayName: "Dr. Silva" },
        },
      ];

      executeSkill.mockImplementation(async (name) => {
        switch (name) {
          case "search_availability":
            return mockSlots as never;
          case "send_message":
            return { id: "thread-1" } as never;
          default:
            throw new Error(`Unexpected skill ${name}`);
        }
      });

      const result = await service.execute(session, {
        threadId: "thread-1",
        patientId: "patient-1",
        professionalId: "prof-1",
        consultationTypeId: "type-1",
      });

      expect(result.status).toBe("WAITING_FOR_INPUT");
      expect(result.patient?.id).toBe("patient-1");
      expect(result.availability.length).toBeGreaterThan(0);
      expect(executeSkill.mock.calls.map(([name]) => name)).toContain(
        "search_availability",
      );
    });

    it("escalates when no availability found", async () => {
      const session = createSessionMock();
      const executeSkill = vi.mocked(session.executeSkill);

      executeSkill.mockImplementation(async (name) => {
        switch (name) {
          case "search_availability":
            return [] as never;
          case "send_message":
            return { id: "thread-1" } as never;
          case "open_handoff":
            return { id: "handoff-1", threadId: "thread-1" } as never;
          default:
            throw new Error(`Unexpected skill ${name}`);
        }
      });

      const result = await service.execute(session, {
        threadId: "thread-1",
        patientId: "patient-1",
        professionalId: "prof-1",
        consultationTypeId: "type-1",
      });

      expect(result.status).toBe("HANDOFF_OPENED");
      expect(result.handoff).toBeDefined();
    });

    it("handles successful patient data resolution", async () => {
      const session = createSessionMock();
      const executeSkill = vi.mocked(session.executeSkill);

      executeSkill.mockImplementation(async (name) => {
        switch (name) {
          case "search_availability":
            return [
              {
                startsAt: "2026-03-20T10:00:00Z",
                endsAt: "2026-03-20T11:00:00Z",
              },
            ] as never;
          case "send_message":
            return { id: "thread-1" } as never;
          default:
            throw new Error(`Unexpected skill ${name}`);
        }
      });

      const result = await service.execute(session, {
        threadId: "thread-1",
        patientId: "patient-1",
        professionalId: "prof-1",
        consultationTypeId: "type-1",
      });

      expect(result.status).toBe("WAITING_FOR_INPUT");
      expect(result.patient?.id).toBe("patient-1");
    });

    it("handles search_availability failure by escalating", async () => {
      const session = createSessionMock();
      const executeSkill = vi.mocked(session.executeSkill);

      executeSkill.mockImplementation(async (name) => {
        switch (name) {
          case "search_availability":
            throw new Error("Calendar service unavailable");
          case "send_message":
            return { id: "thread-1" } as never;
          case "open_handoff":
            return { id: "handoff-1", threadId: "thread-1" } as never;
          default:
            throw new Error(`Unexpected skill ${name}`);
        }
      });

      const result = await service.execute(session, {
        threadId: "thread-1",
        patientId: "patient-1",
        professionalId: "prof-1",
        consultationTypeId: "type-1",
      });

      expect(result.status).toBe("HANDOFF_OPENED");
    });

    it("handles context validation failure", async () => {
      const session = createSessionMock();
      session.conversationContext.tenantId = "";
      const executeSkill = vi.mocked(session.executeSkill);

      executeSkill.mockImplementation(async (name) => {
        if (name === "send_message") {
          return { id: "thread-1" } as never;
        }
        throw new Error(`Unexpected skill ${name}`);
      });

      const result = await service.execute(session, {
        threadId: "thread-1",
        patientId: "patient-1",
        professionalId: "prof-1",
        consultationTypeId: "type-1",
      });

      expect(result.status).toBe("FAILED");
    });

    it("tracks decisions in session", async () => {
      const session = createSessionMock();
      const executeSkill = vi.mocked(session.executeSkill);

      executeSkill.mockImplementation(async (name) => {
        switch (name) {
          case "search_availability":
            return [
              {
                startsAt: "2026-03-20T10:00:00Z",
                endsAt: "2026-03-20T11:00:00Z",
              },
            ] as never;
          case "send_message":
            return { id: "thread-1" } as never;
          default:
            throw new Error(`Unexpected skill ${name}`);
        }
      });

      await service.execute(session, {
        threadId: "thread-1",
        patientId: "patient-1",
        professionalId: "prof-1",
        consultationTypeId: "type-1",
      });

      expect(session.intentHistory.length).toBeGreaterThan(0);
      expect(session.decisions.length).toBeGreaterThan(0);
    });
  });

  describe("offer slots", () => {
    it("offers top 3 slots when more are available", async () => {
      const session = createSessionMock();
      const executeSkill = vi.mocked(session.executeSkill);

      const mockSlots = Array.from({ length: 10 }, (_, i) => ({
        startsAt: `2026-03-${20 + i}T10:00:00Z`,
        endsAt: `2026-03-${20 + i}T11:00:00Z`,
      }));

      executeSkill.mockImplementation(async (name) => {
        switch (name) {
          case "search_availability":
            return mockSlots as never;
          case "send_message":
            return { id: "thread-1" } as never;
          default:
            throw new Error(`Unexpected skill ${name}`);
        }
      });

      const result = await service.execute(session, {
        threadId: "thread-1",
        patientId: "patient-1",
        professionalId: "prof-1",
        consultationTypeId: "type-1",
      });

      expect(result.availability.length).toBeLessThanOrEqual(3);
    });
  });
});
