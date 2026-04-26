import { describe, expect, it, vi, beforeEach } from "vitest";
import { AgentRuntimeSession } from "../../src/modules/agent/agent-runtime.service";
import { CaptacaoAgentService } from "../../src/modules/agent/agents/captacao-agent.service";
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

describe("CaptacaoAgentService", () => {
  let service: CaptacaoAgentService;
  let intentRouter: any;
  let guardrails: any;
  let escalationPolicy: any;

  beforeEach(() => {
    intentRouter = { classify: vi.fn(() => ({ intent: "LEAD_CAPTURE", confidence: 0.9 })) };
    guardrails = { validateContext: vi.fn(() => ({ passed: true })) };
    escalationPolicy = { shouldEscalate: vi.fn(() => false) };
    service = new CaptacaoAgentService(intentRouter, guardrails, escalationPolicy);
  });

  it("captures scheduling intent and keeps the conversation in automation", async () => {
    const session = createSessionMock();
    const executeSkill = vi.mocked(session.executeSkill);

    executeSkill.mockImplementation(async (name) => {
      switch (name) {
        case "find_or_merge_patient":
          return { id: "patient-1", fullName: "Ana", contacts: [] } as never;
        case "send_message":
          return { id: "thread-1" } as never;
        default:
          throw new Error(`Unexpected skill ${name}`);
      }
    });

    const result = await service.execute(session, {
      threadId: "thread-1",
      messageText: "Quero agendar uma avaliacao",
      patientPhone: "5511999999999",
      patientName: "Ana",
    });

    expect(result.status).toBe("WAITING_FOR_INPUT");
    expect(result.patient?.id).toBe("patient-1");
    expect(result.handoff).toBeNull();
    expect(executeSkill.mock.calls.map(([name]) => name)).toEqual([
      "find_or_merge_patient",
      "send_message",
    ]);
  });

  it("opens handoff for unknown messages", async () => {
    // Mock intent router to return OUT_OF_SCOPE for unknown messages
    intentRouter.classify.mockReturnValueOnce({ intent: "OUT_OF_SCOPE", confidence: 0.2 });
    
    const session = createSessionMock();
    const executeSkill = vi.mocked(session.executeSkill);

    executeSkill.mockImplementation(async (name) => {
      switch (name) {
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
      messageText: "Tenho uma dúvida muito específica sobre meu caso",
    });

    expect(result.status).toBe("HANDOFF_OPENED");
    expect(result.handoff?.id).toBe("handoff-1");
    expect(executeSkill.mock.calls.map(([name]) => name)).toEqual([
      "send_message",
      "open_handoff",
    ]);
  });
});
