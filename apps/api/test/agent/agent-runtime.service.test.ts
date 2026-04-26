import { describe, expect, it, vi, beforeEach } from "vitest";
import { AgentRuntimeService } from "../../src/modules/agent/agent-runtime.service";
import { SkillRegistryService } from "../../src/modules/skill-registry/skill-registry.service";
import { ConversationContextResolverService } from "../../src/modules/agent/services/conversation-context-resolver.service";
import { IntentRouterService } from "../../src/modules/agent/services/intent-router.service";
import { GuardrailvService } from "../../src/modules/agent/services/guardrails.service";
import { EscalationPolicyService } from "../../src/modules/agent/services/escalation-policy.service";
import { SkillExecutorService } from "../../src/modules/agent/services/skill-executor.service";

describe("AgentRuntimeService", () => {
  let skillRegistry: any;
  let contextResolver: any;
  let intentRouter: any;
  let guardrails: any;
  let escalationPolicy: any;
  let skillExecutor: any;
  let prisma: any;
  let service: AgentRuntimeService;

  beforeEach(() => {
    skillRegistry = { execute: vi.fn() };
    contextResolver = {
      resolveFromWebhook: vi.fn(),
      resolveFromSkillContext: vi.fn(),
      validate: vi.fn(() => ({ valid: true, errors: [] })),
      resolveClinicId: vi.fn(),
    };
    intentRouter = { classify: vi.fn(() => ({ intent: "BOOK_APPOINTMENT", confidence: 0.9, keywords: [], suggestedSkills: [], requiresEscalation: false, reason: "classified" })) };
    guardrails = { validateContext: vi.fn(() => ({ passed: true, checks: [], blockingIssues: [], warnings: [] })), validateSkillAllowed: vi.fn(() => ({ passed: true })) };
    escalationPolicy = {
      shouldEscalate: vi.fn(() => ({ shouldEscalate: false, intent: "BOOK_APPOINTMENT", failedAttempts: 0, reason: "handled", priority: "LOW" })),
      getEscalationNote: vi.fn(() => "Nota de escalonamento"),
    };
    skillExecutor = {
      execute: vi.fn(async (request: any) => ({
        success: true,
        skillName: request.skillName,
        result: { id: "patient-1" },
        error: undefined,
        duration: 0,
        timestamp: new Date().toISOString(),
      })),
    };
    prisma = {
      $transaction: vi.fn((cb) => cb(prisma)),
      messageThread: { update: vi.fn() },
      patient: { findUnique: vi.fn(), update: vi.fn() },
    };
    service = new AgentRuntimeService(
      skillRegistry,
      contextResolver,
      intentRouter,
      guardrails,
      escalationPolicy,
      skillExecutor,
      prisma,
    );
  });

  it("records successful skill execution traces", async () => {
    skillExecutor.execute = vi.fn().mockResolvedValue({
      success: true,
      skillName: "find_or_merge_patient",
      result: { id: "patient-1" },
      error: undefined,
      duration: 0,
      timestamp: new Date().toISOString(),
    });
    const session = service.createSession({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      source: "AGENT",
      correlationId: "corr-1",
      threadId: "thread-1",
    });

    const result = await session.executeSkill("find_or_merge_patient", {
      contacts: [{ type: "WHATSAPP", value: "5511999999999", isPrimary: true }],
    });

    expect(result).toEqual({ id: "patient-1" });
    expect(skillExecutor.execute).toHaveBeenCalled();
    expect(session.getSteps()).toEqual([
      expect.objectContaining({
        skillName: "find_or_merge_patient",
        status: "SUCCESS",
        error: null,
      }),
    ]);
  });

  it("records failed skill execution traces", async () => {
    skillExecutor.execute = vi.fn().mockRejectedValue(new Error("boom"));
    const session = service.createSession({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      source: "AGENT",
      threadId: "thread-1",
      correlationId: "corr-1",
    });

    await expect(
      session.executeSkill("open_handoff", {
        threadId: "thread-1",
        reason: "Need human",
      }),
    ).rejects.toThrow("boom");

    expect(session.getSteps()).toEqual([
      expect.objectContaining({
        skillName: "open_handoff",
        status: "FAILED",
        error: "boom",
      }),
    ]);
  });

  describe("processMessage - fallback to handoff", () => {
    it("returns ESCALATE when policy triggers after too many failed attempts", async () => {
      escalationPolicy.shouldEscalate = vi.fn().mockReturnValue({
        shouldEscalate: true,
        intent: "BOOK_APPOINTMENT",
        failedAttempts: 3,
        reason: "Too many failed attempts (3)",
        priority: "MEDIUM",
      });
      escalationPolicy.getEscalationNote = vi.fn().mockReturnValue("Após 3 tentativas sem sucesso");

      const session = service.createSession({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        source: "api",
        threadId: "thread-esc-1",
        correlationId: "corr-esc",
      });

      const output = await service.processMessage(session, "quero agendar");

      expect(output.decision.type).toBe("ESCALATE");
      expect(output.decision.handoffData?.priority).toBe("MEDIUM");
      expect(output.decision.handoffData?.threadId).toBe("thread-esc-1");
      expect(output.decision.handoffData?.reason).toContain("Too many failed attempts");
    });

    it("returns ESCALATE with HIGH priority when guardrails fail", async () => {
      guardrails.validateContext = vi.fn().mockReturnValue({
        passed: false,
        blockingIssues: ["Invalid tenantId"],
        checks: [],
        warnings: [],
      });

      const session = service.createSession({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        source: "api",
        threadId: "thread-guard-1",
        correlationId: "corr-guard",
      });

      const output = await service.processMessage(session, "alguma mensagem");

      expect(output.decision.type).toBe("ESCALATE");
      expect(output.decision.handoffData?.priority).toBe("HIGH");
      expect(output.decision.handoffData?.threadId).toBe("thread-guard-1");
    });

    it("cascades to ESCALATE when intent classification throws", async () => {
      intentRouter.classify = vi.fn().mockImplementation(() => {
        throw new Error("Intent router crashed");
      });

      const session = service.createSession({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        source: "api",
        threadId: "thread-err-1",
        correlationId: "corr-err",
      });

      const output = await service.processMessage(session, "mensagem");

      expect(output.decision.type).toBe("ESCALATE");
      expect(output.decision.handoffData?.priority).toBe("HIGH");
    });

    it("does NOT escalate when policy and guardrails both pass", async () => {
      const session = service.createSession({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        source: "api",
        threadId: "thread-ok-1",
        correlationId: "corr-ok",
      });

      const output = await service.processMessage(session, "quero agendar");

      expect(output.decision.type).not.toBe("ESCALATE");
    });

    it("ESCALATE decision carries threadId for correct handoff targeting", async () => {
      escalationPolicy.shouldEscalate = vi.fn().mockReturnValue({
        shouldEscalate: true,
        intent: "HUMAN_REQUEST",
        failedAttempts: 0,
        reason: "User explicitly requested human",
        priority: "HIGH",
      });
      escalationPolicy.getEscalationNote = vi.fn().mockReturnValue("Solicitação de atendente");

      const session = service.createSession({
        tenantId: "tenant-abc",
        actorUserId: "user-1",
        source: "api",
        threadId: "thread-xyz-999",
        correlationId: "corr-xyz",
      });

      const output = await service.processMessage(session, "quero falar com atendente");

      expect(output.decision.handoffData?.threadId).toBe("thread-xyz-999");
      expect(output.decision.handoffData?.priority).toBe("HIGH");
    });
  });
});
