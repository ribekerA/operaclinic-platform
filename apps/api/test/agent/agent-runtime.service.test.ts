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
  let auditService: any;
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
      messageThreadResolution: { create: vi.fn().mockResolvedValue({ id: "resolution-1" }) },
    };
    auditService = { record: vi.fn().mockResolvedValue(undefined) };
    service = new AgentRuntimeService(
      skillRegistry,
      contextResolver,
      intentRouter,
      guardrails,
      escalationPolicy,
      skillExecutor,
      prisma,
      auditService,
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
    it("returns operational contract fields in output", async () => {
      const session = service.createSession({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        source: "api",
        threadId: "thread-contract-1",
        correlationId: "corr-contract",
      });

      const output = await service.processMessage(session, "quero agendar");

      expect(output.operational).toBeDefined();
      expect(output.operational.proximaAcaoRecomendada).toEqual(expect.any(String));
      expect(output.operational.justificativaAuditavelCurta).toEqual(expect.any(String));
      expect(["sim", "nao"]).toContain(output.operational.handoffNecessario);
      expect(Array.isArray(output.operational.fatosConfirmados)).toBe(true);
      expect(Array.isArray(output.operational.hipoteses)).toBe(true);
      expect(Array.isArray(output.operational.lacunas)).toBe(true);
    });

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

    it("escalates automatically when confidence is below threshold", async () => {
      intentRouter.classify = vi.fn(() => ({
        intent: "BOOK_APPOINTMENT",
        confidence: 0.45,
        keywords: ["agendar"],
        suggestedSkills: [],
        requiresEscalation: false,
        reason: "low confidence intent",
      }));
      escalationPolicy.shouldEscalate = vi.fn(
        (_intent: string, _failedAttempts: number, outOfScope: boolean) => ({
          shouldEscalate: outOfScope,
          intent: "BOOK_APPOINTMENT",
          failedAttempts: 0,
          reason: outOfScope ? "Low confidence fallback" : "Handled",
          priority: outOfScope ? "HIGH" : "LOW",
        }),
      );

      const session = service.createSession({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        source: "api",
        threadId: "thread-low-confidence",
        correlationId: "corr-low-confidence",
      });

      const output = await service.processMessage(session, "agendar talvez essa semana");

      expect(output.decision.type).toBe("ESCALATE");
      expect(output.operational.handoffNecessario).toBe("sim");
      expect(output.operational.hipoteses.length).toBeGreaterThan(0);
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

    it("routes to SKILL_CALL when intent has actionable suggested skills", async () => {
      intentRouter.classify = vi.fn(() => ({
        intent: "BOOK_APPOINTMENT",
        confidence: 0.92,
        keywords: ["agendar"],
        suggestedSkills: ["find_or_merge_patient", "search_availability", "create_appointment"],
        requiresEscalation: false,
        reason: "appointment intent with skills",
      }));

      const session = service.createSession({
        tenantId: "tenant-skill",
        actorUserId: "user-1",
        source: "api",
        threadId: "thread-skill-1",
        correlationId: "corr-skill",
      });

      const output = await service.processMessage(session, "quero agendar para sexta");

      expect(output.decision.type).toBe("SKILL_CALL");
      expect((output.decision as any).skillName).toBe("find_or_merge_patient");
      expect(output.operational.handoffNecessario).toBe("nao");
    });

    it("falls back to SEND_MESSAGE when only send_message is in suggestedSkills", async () => {
      intentRouter.classify = vi.fn(() => ({
        intent: "FAQ_SIMPLE",
        confidence: 0.88,
        keywords: ["horário"],
        suggestedSkills: ["send_message"],
        requiresEscalation: false,
        reason: "faq intent",
      }));

      const session = service.createSession({
        tenantId: "tenant-faq",
        actorUserId: "user-1",
        source: "api",
        threadId: "thread-faq-1",
        correlationId: "corr-faq",
      });

      const output = await service.processMessage(session, "qual o horário de funcionamento?");

      expect(output.decision.type).toBe("SEND_MESSAGE");
      expect((output.decision as any).text).toBeTruthy();
    });

    it("fires audit record for ESCALATE decision (fire-and-forget)", async () => {
      escalationPolicy.shouldEscalate = vi.fn().mockReturnValue({
        shouldEscalate: true,
        intent: "HUMAN_REQUEST",
        failedAttempts: 0,
        reason: "User requested human",
        priority: "HIGH",
      });
      escalationPolicy.getEscalationNote = vi.fn().mockReturnValue("Escalonamento solicitado");

      const session = service.createSession({
        tenantId: "tenant-audit",
        actorUserId: "user-audit",
        source: "api",
        threadId: "thread-audit-esc",
        correlationId: "corr-audit",
      });

      await service.processMessage(session, "quero falar com atendente");

      // Allow fire-and-forget to settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "AGENT_ESCALATED",
          tenantId: "tenant-audit",
          targetType: "MessageThread",
          targetId: "thread-audit-esc",
        }),
      );
    });

    it("emits AGENT_RESOLVED audit + creates MessageThreadResolution when agent handles with SEND_MESSAGE", async () => {
      intentRouter.classify = vi.fn().mockReturnValue({
        intent: "FAQ_SIMPLE",
        confidence: 0.9,
        keywords: [],
        suggestedSkills: [],
        requiresEscalation: false,
        reason: "FAQ classified",
      });
      escalationPolicy.shouldEscalate = vi.fn().mockReturnValue({
        shouldEscalate: false,
        intent: "FAQ_SIMPLE",
        failedAttempts: 0,
        reason: "handled",
        priority: "LOW",
      });

      const session = service.createSession({
        tenantId: "tenant-resolved",
        actorUserId: "user-resolved",
        source: "api",
        threadId: "thread-resolved",
        correlationId: "corr-resolved",
      });

      await service.processMessage(session, "qual o horário de funcionamento?");

      // Allow fire-and-forget to settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "AGENT_RESOLVED",
          tenantId: "tenant-resolved",
          targetType: "MessageThread",
          targetId: "thread-resolved",
        }),
      );

      expect(prisma.messageThreadResolution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: "tenant-resolved",
            threadId: "thread-resolved",
            actorType: "AUTOMATION",
          }),
        }),
      );
    });
  });
});
