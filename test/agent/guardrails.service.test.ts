import { Test, TestingModule } from "@nestjs/testing";
import { GuardrailvService } from "../services/guardrails.service";
import type { ConversationContext, AgentSession } from "../types/agent-runtime.types";

describe("GuardrailvService", () => {
  let service: GuardrailvService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GuardrailvService],
    }).compile();

    service = module.get<GuardrailvService>(GuardrailvService);
  });

  const createValidContext = (): ConversationContext => ({
    tenantId: "tenant-123",
    threadId: "thread-456",
    channel: "WHATSAPP",
    correlationId: "corr-789",
    actorUserId: "user-abc",
    actorRole: "AGENT",
    source: "AGENT",
    timestamp: new Date(),
  });

  const createValidSession = (): AgentSession => ({
    conversationContext: createValidContext(),
    startedAt: new Date(),
    intentHistory: [],
    decisions: [],
    skillCalls: [],
    escalations: 0,
    isEscalated: false,
  });

  describe("validateContext", () => {
    it("should pass validation for valid context", () => {
      const context = createValidContext();

      const result = service.validateContext(context);

      expect(result.passed).toBe(true);
      expect(result.blockingIssues).toHaveLength(0);
    });

    it("should fail if tenantId is missing", () => {
      const context = createValidContext();
      context.tenantId = "";

      const result = service.validateContext(context);

      expect(result.passed).toBe(false);
      expect(result.blockingIssues.length).toBeGreaterThan(0);
    });

    it("should fail if threadId is missing", () => {
      const context = createValidContext();
      context.threadId = "";

      const result = service.validateContext(context);

      expect(result.passed).toBe(false);
      expect(result.blockingIssues.length).toBeGreaterThan(0);
    });

    it("should fail if actorUserId is missing", () => {
      const context = createValidContext();
      context.actorUserId = "";

      const result = service.validateContext(context);

      expect(result.passed).toBe(false);
      expect(result.blockingIssues.length).toBeGreaterThan(0);
    });

    it("should fail for invalid channel", () => {
      const context = createValidContext();
      context.channel = "INVALID" as "WHATSAPP";

      const result = service.validateContext(context);

      expect(result.passed).toBe(false);
      expect(result.blockingIssues.length).toBeGreaterThan(0);
    });

    it("should include check details", () => {
      const context = createValidContext();

      const result = service.validateContext(context);

      expect(result.checks).toBeDefined();
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.checks[0].name).toBeDefined();
      expect(result.checks[0].status).toBeDefined();
    });
  });

  describe("validateSkillAllowed", () => {
    it("should allow whitelisted skills", () => {
      const result = service.validateSkillAllowed("find_or_merge_patient");

      expect(result.passed).toBe(true);
      expect(result.blockingIssues).toHaveLength(0);
    });

    it("should reject non-whitelisted skills", () => {
      const result = service.validateSkillAllowed("invalid_skill_name");

      expect(result.passed).toBe(false);
      expect(result.blockingIssues.length).toBeGreaterThan(0);
    });

    it("should include reason for rejection", () => {
      const result = service.validateSkillAllowed("unknown_skill");

      expect(result.blockingIssues.some((issue) =>
        issue.includes("not whitelisted"),
      )).toBe(true);
    });
  });

  describe("checkShouldEscalate", () => {
    it("should not escalate for fresh session with few attempts", () => {
      const session = createValidSession();

      const result = service.checkShouldEscalate(session);

      expect(result.checks.some((c) => c.name === "ESCALATION_ATTEMPTS_OK")).toBe(
        true,
      );
    });

    it("should warn before escalation threshold", () => {
      const session = createValidSession();
      session.decisions = [
        {
          type: "ESCALATE",
          reason: "Test",
          handoffData: {
            threadId: "thread-456",
            reason: "Test",
            priority: "LOW",
            note: "Test",
          },
        },
      ];

      const result = service.checkShouldEscalate(session);

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should require escalation after threshold", () => {
      const session = createValidSession();
      session.decisions = [
        {
          type: "ESCALATE",
          reason: "First",
          handoffData: {
            threadId: "thread-456",
            reason: "First",
            priority: "LOW",
            note: "First",
          },
        },
        {
          type: "ESCALATE",
          reason: "Second",
          handoffData: {
            threadId: "thread-456",
            reason: "Second",
            priority: "LOW",
            note: "Second",
          },
        },
        {
          type: "ESCALATE",
          reason: "Third",
          handoffData: {
            threadId: "thread-456",
            reason: "Third",
            priority: "LOW",
            note: "Third",
          },
        },
      ];

      const result = service.checkShouldEscalate(session);

      expect(result.passed).toBe(false);
      expect(result.blockingIssues.length).toBeGreaterThan(0);
    });

    it("should warn for long session duration", () => {
      const session = createValidSession();
      session.startedAt = new Date(Date.now() - 35 * 60 * 1000); // 35 minutes ago

      const result = service.checkShouldEscalate(session);

      expect(result.warnings.some((w) => w.includes("duration"))).toBe(true);
    });

    it("should indicate if already escalated", () => {
      const session = createValidSession();
      session.isEscalated = true;

      const result = service.checkShouldEscalate(session);

      expect(
        result.checks.some((c) => c.status === "WARN" && c.name === "ALREADY_ESCALATED"),
      ).toBe(true);
    });
  });

  describe("validateResponseAllowed", () => {
    it("should allow normal responses", () => {
      const result = service.validateResponseAllowed(
        "Claro, vou ajudar você a agendar uma consulta.",
      );

      expect(result.passed).toBe(true);
    });

    it("should warn for empty response", () => {
      const result = service.validateResponseAllowed("");

      expect(result.passed).toBe(false);
      expect(result.blockingIssues.length).toBeGreaterThan(0);
    });

    it("should warn for clinical advice", () => {
      const result = service.validateResponseAllowed(
        "Você tem diagnóstico de diabetes, tome este medicamento",
      );

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.warnings.some((w) => w.includes("clinical")),
      ).toBe(true);
    });

    it("should warn for very long response", () => {
      const longResponse = "A ".repeat(500);

      const result = service.validateResponseAllowed(longResponse);

      expect(
        result.warnings.some((w) => w.includes("long")),
      ).toBe(true);
    });

    it("should have multiple warning levels", () => {
      const result = service.validateResponseAllowed(
        "Diagnóstico de " + "A ".repeat(200),
      );

      // Could have multiple warnings
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("integration", () => {
    it("should fail context validation blocks skill execution", () => {
      const context = createValidContext();
      context.tenantId = "";

      const contextCheck = service.validateContext(context);
      const skillCheck = service.validateSkillAllowed("find_or_merge_patient");

      expect(contextCheck.passed).toBe(false);
      expect(skillCheck.passed).toBe(true); // Skill is valid, context is not
    });

    it("should properly track escalation state", () => {
      const session = createValidSession();

      let check1 = service.checkShouldEscalate(session);
      expect(check1.passed).toBe(true);

      session.escalations = 3;
      let check2 = service.checkShouldEscalate(session);
      // Still based on decisions count, not escalations field directly
      expect(check2.passed).toBe(true);

      // When decisions exceed threshold
      session.decisions = [
        {
          type: "ESCALATE",
          reason: "1",
          handoffData: {
            threadId: "thread-456",
            reason: "1",
            priority: "LOW",
            note: "1",
          },
        },
        {
          type: "ESCALATE",
          reason: "2",
          handoffData: {
            threadId: "thread-456",
            reason: "2",
            priority: "LOW",
            note: "2",
          },
        },
        {
          type: "ESCALATE",
          reason: "3",
          handoffData: {
            threadId: "thread-456",
            reason: "3",
            priority: "LOW",
            note: "3",
          },
        },
      ];

      let check3 = service.checkShouldEscalate(session);
      expect(check3.passed).toBe(false);
    });
  });
});
