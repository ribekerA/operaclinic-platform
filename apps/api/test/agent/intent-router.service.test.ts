import { Test, TestingModule } from "@nestjs/testing";
import { IntentRouterService } from "../../src/modules/agent/services/intent-router.service";
import type { AgentIntentType } from "../../src/modules/agent/types/agent-runtime.types";

describe("IntentRouterService", () => {
  let service: IntentRouterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IntentRouterService],
    }).compile();

    service = module.get<IntentRouterService>(IntentRouterService);
  });

  describe("classify", () => {
    it("should classify FAQ_SIMPLE intent", () => {
      const result = service.classify("Qual o horário de funcionamento?");

      expect(result.intent).toBe("FAQ_SIMPLE");
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.keywords.length).toBeGreaterThan(0);
    });

    it("should classify LEAD_CAPTURE intent", () => {
      const result = service.classify("Gostaria de conhecer mais sobre seus serviços");

      expect(result.intent).toBe("LEAD_CAPTURE");
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should classify BOOK_APPOINTMENT intent", () => {
      const result = service.classify("Quero agendar uma consulta");

      expect(result.intent).toBe("BOOK_APPOINTMENT");
      expect(result.suggestedSkills).toContain("find_or_merge_patient");
    });

    it("should classify RESCHEDULE_APPOINTMENT intent", () => {
      const result = service.classify("Gostaria de remarcar minha consulta");

      expect(result.intent).toBe("RESCHEDULE_APPOINTMENT");
    });

    it("should classify CANCEL_APPOINTMENT intent", () => {
      const result = service.classify("Preciso cancelar meu agendamento");

      expect(result.intent).toBe("CANCEL_APPOINTMENT");
    });

    it("should classify HUMAN_REQUEST intent", () => {
      const result = service.classify("Preciso falar com um atendente");

      expect(result.intent).toBe("HUMAN_REQUEST");
      expect(result.requiresEscalation).toBe(true);
    });

    it("should classify OUT_OF_SCOPE for unknown messages", () => {
      const result = service.classify("xyz123 abc @#$");

      expect(result.intent).toBe("OUT_OF_SCOPE");
      expect(result.requiresEscalation).toBe(true);
    });

    it("should handle empty message as OUT_OF_SCOPE", () => {
      const result = service.classify("");

      expect(result.intent).toBe("OUT_OF_SCOPE");
      expect(result.requiresEscalation).toBe(true);
    });

    it("should normalize text case-insensitively", () => {
      const result1 = service.classify("AGENDAR UMA CONSULTA");
      const result2 = service.classify("agendar uma consulta");
      const result3 = service.classify("Agendar Uma Consulta");

      expect(result1.intent).toBe(result2.intent);
      expect(result2.intent).toBe(result3.intent);
    });

    it("should match multiple keywords and calculate confidence", () => {
      const result = service.classify("Gostaria de conhecer informações e agendar consulta");

      // Should detect both LEAD_CAPTURE and BOOK_APPOINTMENT
      expect(["LEAD_CAPTURE", "BOOK_APPOINTMENT"]).toContain(result.intent);
      expect(result.confidence).toBeLessThanOrEqual(0.95); // Capped at 0.95
    });

    it("should include suggested skills in result", () => {
      const result = service.classify("Agendar consulta");

      expect(result.suggestedSkills).toBeDefined();
      expect(Array.isArray(result.suggestedSkills)).toBe(true);
    });

    it("should handle very long messages", () => {
      const longMessage = "Agendar " + "abc ".repeat(100);

      const result = service.classify(longMessage);

      expect(result.intent).toBe("BOOK_APPOINTMENT");
    });

    it("should provide reason for classification", () => {
      const result = service.classify("Qual é o valor da consulta?");

      expect(result.reason).toBeDefined();
      expect(result.reason.length).toBeGreaterThan(0);
    });
  });

  describe("listIntents", () => {
    it("should list all available intents", () => {
      const intents = service.listIntents();

      expect(intents).toBeDefined();
      expect(intents.length).toBe(7);
      expect(intents.map((i) => i.intent)).toContain("FAQ_SIMPLE");
      expect(intents.map((i) => i.intent)).toContain("LEAD_CAPTURE");
      expect(intents.map((i) => i.intent)).toContain("BOOK_APPOINTMENT");
      expect(intents.map((i) => i.intent)).toContain("OUT_OF_SCOPE");
    });

    it("should include description for each intent", () => {
      const intents = service.listIntents();

      intents.forEach((intent) => {
        expect(intent.description).toBeDefined();
        expect(intent.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe("confidence scoring", () => {
    it("should cap confidence at 0.95", () => {
      const result = service.classify("agendar uma consulta hoje");

      expect(result.confidence).toBeLessThanOrEqual(0.95);
    });

    it("should have lower confidence for out of scope", () => {
      const outOfScope = service.classify("zzz");
      const inScope = service.classify("agendar");

      expect(outOfScope.confidence).toBeLessThan(inScope.confidence);
    });
  });

  describe("keyword extraction", () => {
    it("should return matched keywords", () => {
      const result = service.classify("Qual horário e endereço");

      expect(result.keywords).toBeDefined();
      expect(result.keywords.length).toBeGreaterThan(0);
    });

    it("should return empty keywords for OUT_OF_SCOPE", () => {
      const result = service.classify("xyz123");

      expect(result.keywords).toEqual([]);
    });
  });
});
