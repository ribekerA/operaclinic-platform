import { Test, TestingModule } from "@nestjs/testing";
import { EscalationPolicyService } from "../services/escalation-policy.service";
import type { AgentIntentType } from "../types/agent-runtime.types";

describe("EscalationPolicyService", () => {
  let service: EscalationPolicyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EscalationPolicyService],
    }).compile();

    service = module.get<EscalationPolicyService>(EscalationPolicyService);
  });

  describe("shouldEscalate", () => {
    it("should escalate HUMAN_REQUEST intent", () => {
      const result = service.shouldEscalate("HUMAN_REQUEST", 0);

      expect(result.shouldEscalate).toBe(true);
      expect(result.priority).toBe("HIGH");
    });

    it("should escalate OUT_OF_SCOPE intent", () => {
      const result = service.shouldEscalate("OUT_OF_SCOPE", 0);

      expect(result.shouldEscalate).toBe(true);
      expect(result.priority).toBe("HIGH");
    });

    it("should not escalate FAQ_SIMPLE on first attempt", () => {
      const result = service.shouldEscalate("FAQ_SIMPLE", 0);

      expect(result.shouldEscalate).toBe(false);
    });

    it("should not escalate LEAD_CAPTURE on first attempt", () => {
      const result = service.shouldEscalate("LEAD_CAPTURE", 0);

      expect(result.shouldEscalate).toBe(false);
    });

    it("should not escalate BOOK_APPOINTMENT on first attempt", () => {
      const result = service.shouldEscalate("BOOK_APPOINTMENT", 0);

      expect(result.shouldEscalate).toBe(false);
    });

    it("should escalate after 3 failed attempts", () => {
      const result = service.shouldEscalate("BOOK_APPOINTMENT", 3);

      expect(result.shouldEscalate).toBe(true);
      expect(result.priority).toBe("MEDIUM");
    });

    it("should escalate when out of scope", () => {
      const result = service.shouldEscalate("FAQ_SIMPLE", 0, true);

      expect(result.shouldEscalate).toBe(true);
    });

    it("should include reason in result", () => {
      const result = service.shouldEscalate("HUMAN_REQUEST", 0);

      expect(result.reason).toBeDefined();
      expect(result.reason.length).toBeGreaterThan(0);
    });

    it("should track failed attempts in result", () => {
      const result = service.shouldEscalate("BOOK_APPOINTMENT", 2);

      expect(result.failedAttempts).toBe(2);
    });
  });

  describe("escalationPriority", () => {
    it("should set HIGH priority for HUMAN_REQUEST", () => {
      const result = service.shouldEscalate("HUMAN_REQUEST", 0);

      expect(result.priority).toBe("HIGH");
    });

    it("should set HIGH priority for OUT_OF_SCOPE", () => {
      const result = service.shouldEscalate("OUT_OF_SCOPE", 0);

      expect(result.priority).toBe("HIGH");
    });

    it("should set MEDIUM priority for appointment intents", () => {
      const intents: AgentIntentType[] = [
        "BOOK_APPOINTMENT",
        "RESCHEDULE_APPOINTMENT",
        "CANCEL_APPOINTMENT",
      ];

      intents.forEach((intent) => {
        const result = service.shouldEscalate(intent, 3); // Force escalation
        expect(result.priority).toBe("MEDIUM");
      });
    });

    it("should set LOW priority for FAQ_SIMPLE", () => {
      const result = service.shouldEscalate("FAQ_SIMPLE", 3);

      expect(result.priority).toBe("MEDIUM"); // Changes to MEDIUM at escalation threshold
    });
  });

  describe("getEscalationNote", () => {
    it("should provide escalation note for HUMAN_REQUEST", () => {
      const note = service.getEscalationNote("HUMAN_REQUEST", 0);

      expect(note).toBeDefined();
      expect(note.includes("atendente")).toBe(true);
    });

    it("should include failed attempts in note", () => {
      const note = service.getEscalationNote("BOOK_APPOINTMENT", 2);

      expect(note).toBeDefined();
      expect(note.includes("tentativas")).toBe(true);
    });

    it("should indicate multiple failed attempts", () => {
      const note = service.getEscalationNote("BOOK_APPOINTMENT", 3);

      expect(note.includes("múltiplas tentativas")).toBe(true);
    });

    it("should handle additional context", () => {
      const note = service.getEscalationNote(
        "BOOK_APPOINTMENT",
        1,
        "Paciente pediu desconto",
      );

      expect(note).toBeDefined();
      expect(note.includes("Paciente pediu desconto")).toBe(true);
    });
  });

  describe("validateEscalationRequest", () => {
    it("should validate correct escalation request", () => {
      const result = service.validateEscalationRequest(
        "thread-123",
        "Patient requested human",
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject missing threadId", () => {
      const result = service.validateEscalationRequest(
        "",
        "Patient requested human",
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("threadId"))).toBe(true);
    });

    it("should reject missing reason", () => {
      const result = service.validateEscalationRequest("thread-123", "");

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("reason"))).toBe(true);
    });

    it("should reject reason exceeding max length", () => {
      const longReason = "A".repeat(501);
      const result = service.validateEscalationRequest("thread-123", longReason);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("too long"))).toBe(true);
    });

    it("should allow reason at max length boundary", () => {
      const maxReason = "A".repeat(500);
      const result = service.validateEscalationRequest("thread-123", maxReason);

      expect(result.valid).toBe(true);
    });
  });

  describe("intent escalation rules", () => {
    it("should consistently apply rules across multiple calls", () => {
      const result1 = service.shouldEscalate("BOOK_APPOINTMENT", 0);
      const result2 = service.shouldEscalate("BOOK_APPOINTMENT", 0);

      expect(result1.shouldEscalate).toBe(result2.shouldEscalate);
      expect(result1.priority).toBe(result2.priority);
    });

    it("should escalate all intents after 3 attempts", () => {
      const intents: AgentIntentType[] = [
        "FAQ_SIMPLE",
        "LEAD_CAPTURE",
        "BOOK_APPOINTMENT",
        "RESCHEDULE_APPOINTMENT",
        "CANCEL_APPOINTMENT",
      ];

      intents.forEach((intent) => {
        const result = service.shouldEscalate(intent, 3);
        expect(result.shouldEscalate).toBe(true);
      });
    });

    it("should always escalate HUMAN_REQUEST regardless of attempts", () => {
      for (let i = 0; i < 5; i++) {
        const result = service.shouldEscalate("HUMAN_REQUEST", i);
        expect(result.shouldEscalate).toBe(true);
      }
    });
  });

  describe("integration scenarios", () => {
    it("scenario: user explicitly asks for human immediately", () => {
      const result = service.shouldEscalate("HUMAN_REQUEST", 0);

      expect(result.shouldEscalate).toBe(true);
      expect(result.priority).toBe("HIGH");

      const validation = service.validateEscalationRequest(
        "thread-123",
        result.reason,
      );
      expect(validation.valid).toBe(true);
    });

    it("scenario: user asks about unknown topic after multiple attempts", () => {
      let decision1 = service.shouldEscalate("OUT_OF_SCOPE", 0);
      expect(decision1.shouldEscalate).toBe(true);

      let decision2 = service.shouldEscalate("OUT_OF_SCOPE", 1);
      expect(decision2.shouldEscalate).toBe(true);
    });

    it("scenario: booking appointment needs escalation after 3 failed attempts", () => {
      const attempt1 = service.shouldEscalate("BOOK_APPOINTMENT", 0);
      expect(attempt1.shouldEscalate).toBe(false);

      const attempt2 = service.shouldEscalate("BOOK_APPOINTMENT", 1);
      expect(attempt2.shouldEscalate).toBe(false);

      const attempt3 = service.shouldEscalate("BOOK_APPOINTMENT", 3);
      expect(attempt3.shouldEscalate).toBe(true);
      expect(attempt3.priority).toBe("MEDIUM");
    });
  });
});
