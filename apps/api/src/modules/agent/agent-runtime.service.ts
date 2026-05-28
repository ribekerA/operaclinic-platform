import { Injectable, Logger } from "@nestjs/common";
import type {
  AgentSkillTracePayload,
  ClinicSkillContext,
  ClinicSkillInputMap,
  ClinicSkillName,
  ClinicSkillOutputMap,
} from "@operaclinic/shared";
import type {
  ConversationContext,
  AgentInput,
  AgentOutput,
  AgentOperationalContract,
  AgentDecision,
  AgentSession,
  AgentExecutionTrace,
  AgentExecutionStep,
  AgentIntentType,
  IntentClassification,
  SkillExecutionResult,
  GuardrailsResult,
} from "./types/agent-runtime.types";
import { SkillRegistryService } from "../skill-registry/skill-registry.service";
import { ConversationContextResolverService } from "./services/conversation-context-resolver.service";
import { IntentRouterService } from "./services/intent-router.service";
import { GuardrailvService } from "./services/guardrails.service";
import { EscalationPolicyService } from "./services/escalation-policy.service";
import { SkillExecutorService } from "./services/skill-executor.service";
import { PrismaService } from "../../database/prisma.service";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { MessageThreadResolutionActorType } from "@prisma/client";

const LOW_CONFIDENCE_ESCALATION_THRESHOLD = 0.7;

/**
 * Agent Runtime Session
 * Maintains state for a single conversation session
 * Tracks decisions, skill calls, and escalations
 */
export class AgentRuntimeSession implements AgentSession {
  conversationContext: ConversationContext;
  startedAt: Date;
  intentHistory: AgentIntentType[];
  decisions: AgentDecision[];
  skillCalls: SkillExecutionResult[];
  escalations: number;
  isEscalated: boolean;

  // Backward compatible trace payload for logging
  private readonly legacySteps: AgentSkillTracePayload[] = [];
  private _guardrailsResult: GuardrailsResult | null = null;

  constructor(
    conversationContext: ConversationContext,
    private readonly skillExecutor: SkillExecutorService,
    private readonly logger: Logger,
  ) {
    this.conversationContext = conversationContext;
    this.startedAt = new Date();
    this.intentHistory = [];
    this.decisions = [];
    this.skillCalls = [];
    this.escalations = 0;
    this.isEscalated = false;
  }

  /**
   * Execute skill with full guardrails (new API)
   */
  async executeSkillSafe(
    skillName: ClinicSkillName,
    input: unknown,
  ): Promise<SkillExecutionResult> {
    const startedAt = new Date();

    this.logger.debug(
      `Executing skill ${skillName} for tenant ${this.conversationContext.tenantId}`,
    );

    try {
      const result = await this.skillExecutor.execute({
        skillName,
        payload: input,
        context: this.conversationContext as ClinicSkillContext,
      });

      this.skillCalls.push(result);

      // For backward compatibility
      this.legacySteps.push({
        skillName,
        status: result.success ? "SUCCESS" : "FAILED",
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        error: result.error ?? null,
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const result: SkillExecutionResult = {
        success: false,
        skillName,
        error: errorMsg,
        duration: new Date().getTime() - startedAt.getTime(),
        timestamp: new Date().toISOString(),
      };

      this.skillCalls.push(result);

      this.legacySteps.push({
        skillName,
        status: "FAILED",
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        error: errorMsg,
      });

      return result;
    }
  }

  /**
   * Execute skill with legacy API (backward compatible)
   */
  async executeSkill<TName extends ClinicSkillName>(
    name: TName,
    input: ClinicSkillInputMap[TName],
  ): Promise<ClinicSkillOutputMap[TName]> {
    const result = await this.executeSkillSafe(name, input);

    if (!result.success) {
      throw new Error(result.error ?? "Skill execution failed");
    }

    return result.result as ClinicSkillOutputMap[TName];
  }

  /**
   * Store guardrails validation result for inclusion in the execution trace
   */
  recordGuardrailsResult(result: GuardrailsResult): void {
    this._guardrailsResult = result;
  }

  /**
   * Get execution steps for tracing
   */
  getSteps(): AgentSkillTracePayload[] {
    return [...this.legacySteps];
  }

  /**
   * Record an intent classification
   */
  recordIntent(intent: IntentClassification): void {
    this.intentHistory.push(intent.intent);
    this.logger.debug(
      `Recorded intent: ${intent.intent} (confidence: ${intent.confidence})`,
    );
  }

  /**
   * Record a decision
   */
  recordDecision(decision: AgentDecision): void {
    this.decisions.push(decision);

    if (decision.type === "ESCALATE") {
      this.escalations++;
      this.isEscalated = true;
    }

    this.logger.debug(`Recorded decision: ${decision.type}`);
  }

  /**
   * Get session state summary
   */
  getSummary(): {
    context: ConversationContext;
    intents: AgentIntentType[];
    decisions: number;
    skillCalls: number;
    escalations: number;
    isEscalated: boolean;
    duration: number;
  } {
    return {
      context: this.conversationContext,
      intents: this.intentHistory,
      decisions: this.decisions.length,
      skillCalls: this.skillCalls.length,
      escalations: this.escalations,
      isEscalated: this.isEscalated,
      duration: new Date().getTime() - this.startedAt.getTime(),
    };
  }

  /**
   * Build complete trace with real step durations and actual guardrails result
   */
  buildTrace(): AgentExecutionTrace {
    const steps: AgentExecutionStep[] = this.legacySteps.map((s) => ({
      name: s.skillName,
      status: s.status === "FAILED" ? "FAILED" : "SUCCESS",
      duration: new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime(),
      error: s.error ?? undefined,
    }));

    const guardrailsChecked: GuardrailsResult = this._guardrailsResult ?? {
      passed: false,
      checks: [],
      blockingIssues: ["Guardrails not evaluated before trace was built"],
      warnings: [],
    };

    return {
      correlationId: this.conversationContext.correlationId,
      steps,
      guardrailsChecked,
      totalDuration: new Date().getTime() - this.startedAt.getTime(),
      completedAt: new Date().toISOString(),
    };
  }
}

/**
 * Agent Runtime Service
 * Main orchestrator for agent processing
 * Provides session creation and high-level processing
 */
@Injectable()
export class AgentRuntimeService {
  private readonly logger = new Logger(AgentRuntimeService.name);

  constructor(
    private readonly skillRegistry: SkillRegistryService,
    private readonly contextResolver: ConversationContextResolverService,
    private readonly intentRouter: IntentRouterService,
    private readonly guardrails: GuardrailvService,
    private readonly escalationPolicy: EscalationPolicyService,
    private readonly skillExecutor: SkillExecutorService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Create a new session with resolved context (new API)
   */
  createSessionFromContext(
    context: ConversationContext,
  ): AgentRuntimeSession {
    const validation = this.contextResolver.validate(context);
    if (!validation.valid) {
      throw new Error(
        `Invalid context: ${validation.errors.join(", ")}`,
      );
    }

    return new AgentRuntimeSession(context, this.skillExecutor, this.logger);
  }

  /**
   * Create a session (backward compatible API)
   */
  createSession(context: ClinicSkillContext): AgentRuntimeSession {
    const conversationContext: ConversationContext = {
      tenantId: context.tenantId,
      threadId: context.threadId || "",
      channel: "WHATSAPP",
      correlationId: context.correlationId || "",
      actorUserId: context.actorUserId,
      actorRole: "AGENT",
      source: "AGENT",
      timestamp: new Date(),
    };

    return this.createSessionFromContext(conversationContext);
  }

  /**
   * Process incoming message (new API)
   */
  async processMessage(
    session: AgentRuntimeSession,
    messageText: string,
  ): Promise<AgentOutput> {
    const startTime = Date.now();

    try {
      // Step 1: Classify intent
      const intentClassification = this.intentRouter.classify(messageText);
      session.recordIntent(intentClassification);

      // Async persistence of memory context (fire and forget)
      void this.persistMemoryContext(session, intentClassification.intent).catch(err => {
        this.logger.warn(`Failed to persist memory context for thread ${session.conversationContext.threadId}: ${err}`);
      });

      // Step 2: Check guardrails and record result in session for trace
      const guardCheck = this.guardrails.validateContext(
        session.conversationContext,
      );
      session.recordGuardrailsResult(guardCheck);

      if (!guardCheck.passed) {
        const decision: AgentDecision = {
          type: "ESCALATE",
          reason: "Guardrail check failed",
          handoffData: {
            threadId: session.conversationContext.threadId,
            reason: guardCheck.blockingIssues.join("; "),
            priority: "HIGH",
            note: "Contexto inválido detectado pelo sistema de segurança",
          },
        };

        session.recordDecision(decision);

        return this.buildOutput(session, decision, intentClassification, startTime);
      }

      // Step 3: Check escalation policy
      const outOfScopeOrLowConfidence =
        intentClassification.requiresEscalation ||
        intentClassification.confidence < LOW_CONFIDENCE_ESCALATION_THRESHOLD;

      const escalationDecision = this.escalationPolicy.shouldEscalate(
        intentClassification.intent,
        session.escalations,
        outOfScopeOrLowConfidence,
      );

      if (escalationDecision.shouldEscalate) {
        const decision: AgentDecision = {
          type: "ESCALATE",
          reason: escalationDecision.reason,
          handoffData: {
            threadId: session.conversationContext.threadId,
            reason: escalationDecision.reason,
            priority: escalationDecision.priority,
            note: this.escalationPolicy.getEscalationNote(
              intentClassification.intent,
              session.escalations,
            ),
          },
        };

        session.recordDecision(decision);

        return this.buildOutput(session, decision, intentClassification, startTime);
      }

      // Step 4: Can proceed with agent handling
      // Route to the primary actionable skill from the intent, or fall back
      // to a contextual templated response for simple FAQ-like intents.
      const primarySkill = intentClassification.suggestedSkills.find(
        (s) => s !== "send_message" && s !== "open_handoff",
      );

      const decision: AgentDecision = primarySkill
        ? {
            type: "SKILL_CALL",
            skillName: primarySkill as ClinicSkillName,
            payload: { messageText },
            reason: `Intent ${intentClassification.intent} routes to skill ${primarySkill}`,
          }
        : {
            type: "SEND_MESSAGE",
            text: this.buildIntentResponse(intentClassification.intent),
            reason: `Intent ${intentClassification.intent} answered via templated response`,
          };

      session.recordDecision(decision);

      return this.buildOutput(session, decision, intentClassification, startTime);
    } catch (error) {
      this.logger.error(
        `Message processing failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      const decision: AgentDecision = {
        type: "ESCALATE",
        reason: "Processing error",
        handoffData: {
          threadId: session.conversationContext.threadId,
          reason: "Erro ao processar mensagem",
          priority: "HIGH",
          note: error instanceof Error ? error.message : String(error),
        },
      };

      session.recordDecision(decision);

      return this.buildOutput(
        session,
        decision,
        {
          intent: "OUT_OF_SCOPE",
          confidence: 0,
          keywords: [],
          suggestedSkills: [],
          requiresEscalation: true,
          reason: "Error during processing",
        },
        startTime,
      );
    }
  }

  private buildOutput(
    session: AgentRuntimeSession,
    decision: AgentDecision,
    intent: IntentClassification,
    startTime: number,
  ): AgentOutput {
    const trace = session.buildTrace();
    const output: AgentOutput = {
      decision,
      intent,
      reasoning: `Classified as ${intent.intent}, escalation required: ${intent.requiresEscalation}`,
      operational: this.buildOperationalContract(decision, intent),
      trace: {
        ...trace,
        totalDuration: Date.now() - startTime,
        completedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    // Fire-and-forget: persist audit for key agent decisions (non-blocking)
    void this.recordAgentDecisionAudit(session, decision, intent).catch((err) => {
      this.logger.warn(
        `Failed to persist agent audit for thread ${session.conversationContext.threadId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return output;
  }

  private async recordAgentDecisionAudit(
    session: AgentRuntimeSession,
    decision: AgentDecision,
    intent: IntentClassification,
  ): Promise<void> {
    const systemActor = {
      id: session.conversationContext.actorUserId,
      tenantId: session.conversationContext.tenantId,
      profile: "AGENT" as const,
      roles: [] as any[],
    };

    const baseMetadata: Record<string, unknown> = {
      threadId: session.conversationContext.threadId,
      intent: intent.intent,
      confidence: intent.confidence,
      correlationId: session.conversationContext.correlationId,
    };

    if (decision.type === "ESCALATE") {
      await this.auditService.record({
        action: AUDIT_ACTIONS.AGENT_ESCALATED,
        actor: systemActor,
        tenantId: session.conversationContext.tenantId,
        targetType: "MessageThread",
        targetId: session.conversationContext.threadId,
        metadata: {
          ...baseMetadata,
          reason: decision.reason,
          priority: decision.handoffData?.priority ?? "MEDIUM",
        },
      });
    } else if (decision.type === "SKILL_CALL") {
      await this.auditService.record({
        action: AUDIT_ACTIONS.AGENT_SKILL_ROUTED,
        actor: systemActor,
        tenantId: session.conversationContext.tenantId,
        targetType: "MessageThread",
        targetId: session.conversationContext.threadId,
        metadata: {
          ...baseMetadata,
          skillName: decision.skillName,
          reason: decision.reason,
        },
      });
    } else if (decision.type === "SEND_MESSAGE") {
      await this.auditService.record({
        action: AUDIT_ACTIONS.AGENT_RESPONDED,
        actor: systemActor,
        tenantId: session.conversationContext.tenantId,
        targetType: "MessageThread",
        targetId: session.conversationContext.threadId,
        metadata: {
          ...baseMetadata,
          reason: decision.reason,
        },
      });

      // Emit explicit auto-resolution event — feeds the
      // resolvedWithoutHumanIntervention KPI in ClinicOperationalKpisService.
      await this.auditService.record({
        action: AUDIT_ACTIONS.AGENT_RESOLVED,
        actor: systemActor,
        tenantId: session.conversationContext.tenantId,
        targetType: "MessageThread",
        targetId: session.conversationContext.threadId,
        metadata: {
          ...baseMetadata,
          reason: "Agent handled interaction without human escalation",
        },
      });

      // Persist MessageThreadResolution with actorType=AUTOMATION so that
      // the existing KPI query (actorType=AUTOMATION count) has real data.
      if (session.conversationContext.threadId) {
        await this.prisma.messageThreadResolution.create({
          data: {
            tenantId: session.conversationContext.tenantId,
            threadId: session.conversationContext.threadId,
            patientId: session.conversationContext.patientId ?? null,
            actorType: MessageThreadResolutionActorType.AUTOMATION,
            correlationId: session.conversationContext.correlationId || null,
            note: `Agent auto-resolved: ${intent.intent}`,
            metadata: {
              intent: intent.intent,
              confidence: intent.confidence,
              correlationId: session.conversationContext.correlationId,
            },
            occurredAt: new Date(),
          },
        });
      }
    }
  }

  /**
   * Build a contextual templated response for simple intents that do not
   * require a skill execution (e.g., FAQ_SIMPLE). This avoids the generic
   * stub and provides an intent-aware message to the caller.
   */
  private buildIntentResponse(intent: AgentIntentType): string {
    switch (intent) {
      case "FAQ_SIMPLE":
        return "Entendido! Posso ajudar com informações gerais. Qual é sua dúvida?";
      case "LEAD_CAPTURE":
        return "Ótimo! Para melhor atendê-lo, pode me informar seu nome e interesse?";
      case "SELECT_OPTION":
        return "Entendido! Por favor, confirme a opção desejada.";
      default:
        return "Entendi sua solicitação. Estou processando para você.";
    }
  }

  private buildOperationalContract(
    decision: AgentDecision,
    intent: IntentClassification,
  ): AgentOperationalContract {
    const handoffNecessario = decision.type === "ESCALATE" ? "sim" : "nao";

    const proximaAcaoRecomendada =
      decision.type === "ESCALATE"
        ? "Escalar para atendimento humano com contexto da thread"
        : decision.type === "SEND_MESSAGE"
          ? "Responder paciente com orientacao segura dentro do fluxo oficial"
          : decision.type === "SKILL_CALL"
            ? `Executar skill ${decision.skillName} com contexto validado`
            : "Sem acao automatica; aguardar proxima interacao";

    const fatosConfirmados = [
      `Intent classificada: ${intent.intent}`,
      `Confianca da classificacao: ${intent.confidence.toFixed(2)}`,
      `Escalonamento exigido pela classificacao: ${intent.requiresEscalation ? "sim" : "nao"}`,
    ];

    const hipoteses =
      intent.confidence < LOW_CONFIDENCE_ESCALATION_THRESHOLD
        ? [
            "A mensagem pode estar ambigua ou fora do escopo do agente para decisao totalmente automatizada",
          ]
        : [];

    const lacunas =
      decision.type === "ESCALATE"
        ? ["Necessario validar contexto adicional em atendimento humano"]
        : [];

    return {
      proximaAcaoRecomendada,
      justificativaAuditavelCurta: decision.reason,
      handoffNecessario,
      fatosConfirmados,
      hipoteses,
      lacunas,
    };
  }

  private async persistMemoryContext(
    session: AgentRuntimeSession,
    newIntent: AgentIntentType,
  ): Promise<void> {
    const threadId = session.conversationContext.threadId;
    const patientId = session.conversationContext.patientId;

    if (!threadId) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.messageThread.update({
        where: { id: threadId },
        data: { lastIntent: newIntent },
      });

      if (patientId) {
        const patient = await tx.patient.findUnique({
          where: { id: patientId },
          select: { intentHistory: true },
        });

        const history = (patient?.intentHistory as string[]) || [];
        
        // Keep only last 10 intents to avoid huge arrays
        const newHistory = [...history, newIntent].slice(-10);

        await tx.patient.update({
          where: { id: patientId },
          data: { intentHistory: newHistory },
        });
      }
    });
  }
}
