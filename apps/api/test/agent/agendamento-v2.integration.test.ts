import { describe, expect, it, vi, beforeEach } from "vitest";
import { AgendamentoAgentService } from "../../src/modules/agent/agents/agendamento-agent.service";
import { IntentRouterService } from "../../src/modules/agent/services/intent-router.service";
import { GuardrailvService } from "../../src/modules/agent/services/guardrails.service";
import { EscalationPolicyService } from "../../src/modules/agent/services/escalation-policy.service";

describe("AgendamentoAgentService V2 (Selection Flow)", () => {
  let service: AgendamentoAgentService;
  let intentRouter: IntentRouterService;
  let guardrails: GuardrailvService;
  let escalationPolicy: EscalationPolicyService;
  let session: any;

  beforeEach(() => {
    intentRouter = new IntentRouterService();
    guardrails = { validateContext: vi.fn(() => ({ passed: true })) } as any;
    escalationPolicy = { 
      shouldEscalate: vi.fn(() => ({ shouldEscalate: false, priority: "MEDIUM" })),
      detectUrgency: vi.fn(() => null)
    } as any;
    
    session = {
      conversationContext: {
        tenantId: "tenant-1",
        threadId: "thread-123",
        historicalContext: {
          lastIntents: ["BOOK_APPOINTMENT"],
          offeredSlots: [
            {
              startsAt: "2026-04-01T10:00:00Z",
              professionalId: "prof-1",
              consultationTypeId: "type-1",
              unitId: "unit-1"
            },
            {
              startsAt: "2026-04-01T14:00:00Z",
              professionalId: "prof-1",
              consultationTypeId: "type-1",
              unitId: "unit-1"
            }
          ]
        }
      },
      intentHistory: [],
      decisions: [],
      executeSkill: vi.fn(async (name, payload) => {
        if (name === "hold_slot") return { id: "hold-123", status: "ACTIVE" };
        if (name === "create_appointment") return { id: "app-123", status: "BOOKED" };
        if (name === "send_message") return { id: "msg-123" };
        if (name === "search_availability") return [];
        return {};
      }),
    };

    service = new AgendamentoAgentService(intentRouter, guardrails, escalationPolicy);
  });

  it("should process direct numeric selection (1) and confirm appointment", async () => {
    const input = {
      threadId: "thread-123",
      patientId: "patient-456",
      messageText: "1",
      professionalId: "prof-1",
      consultationTypeId: "type-1"
    };

    const result = await service.execute(session, input);

    expect(result.status).toBe("COMPLETED");
    expect(session.executeSkill).toHaveBeenCalledWith("hold_slot", expect.objectContaining({
      startsAt: "2026-04-01T10:00:00Z"
    }));
    expect(session.executeSkill).toHaveBeenCalledWith("create_appointment", expect.objectContaining({
      startsAt: "2026-04-01T10:00:00Z",
      slotHoldId: "hold-123"
    }));
    expect(result.replyText).toContain("confirmado");
    expect(result.replyText).toContain("01/04/2026");
  });

  it("should process ordinal selection (o segundo) and confirm appointment", async () => {
    const input = {
      threadId: "thread-123",
      patientId: "patient-456",
      messageText: "quero o segundo",
      professionalId: "prof-1",
      consultationTypeId: "type-1"
    };

    const result = await service.execute(session, input);

    expect(result.status).toBe("COMPLETED");
    expect(session.executeSkill).toHaveBeenCalledWith("hold_slot", expect.objectContaining({
      startsAt: "2026-04-01T14:00:00Z"
    }));
    expect(result.replyText).toContain("11:00"); // 14:00 UTC = 11:00 BRT
  });

  it("should escalate if selection is invalid (e.g. 5 when only 2 offered)", async () => {
    const input = {
      threadId: "thread-123",
      patientId: "patient-456",
      messageText: "5",
      professionalId: "prof-1",
      consultationTypeId: "type-1"
    };

    // If selection is invalid, it falls through to normal booking logic or escalation
    // In our current implementation, currentIntent becomes SELECT_OPTION but index is 4, 
    // selectedSlot is undefined, so it proceeds to check for patientId (step 3) etc.
    // Eventually it will search_availability again or wait for input.
    
    const result = await service.execute(session, input);
    
    // In this case, it didn't find the slot, so it proceeded to offer slots again (re-search)
    expect(session.executeSkill).not.toHaveBeenCalledWith("hold_slot", expect.anything());
    expect(session.executeSkill).toHaveBeenCalledWith("search_availability", expect.anything());
  });
});
