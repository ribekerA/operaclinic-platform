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
  AgentDecision,
  AgentSession,
  AgentExecutionTrace,
  AgentExecutionStep,
  AgentIntentType,
  IntentClassification,
  SkillExecutionResult,
} from "./types/agent-runtime.types";
import { SkillRegistryService } from "../skill-registry/skill-registry.service";
import { ConversationContextResolverService } from "./services/conversation-context-resolver.service";
import { IntentRouterService } from "./services/intent-router.service";
import { GuardrailvService } from "./services/guardrails.service";
import { EscalationPolicyService } from "./services/escalation-policy.service";
import { SkillExecutorService } from "./services/skill-executor.service";
import { PrismaService } from "../../database/prisma.service";

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
   * Build complete trace
   */
  buildTrace(): AgentExecutionTrace {
    const steps: AgentExecutionStep[] = this.legacySteps.map((s) => ({
      name: s.skillName,
      status: s.status === "FAILED" ? "FAILED" : "SUCCESS",
      duration: 0, // Would need to parse from timestamps if needed
      error: s.error ?? undefined,
    }));

    return {
      correlationId: this.conversationContext.correlationId,
      steps,
      guardrailsChecked: {
        passed: true,
        checks: [],
        blockingIssues: [],
        warnings: [],
      },
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
    const trace = session.buildTrace();

    try {
      // Step 1: Classify intent
      const intentClassification = this.intentRouter.classify(messageText);
      session.recordIntent(intentClassification);

      // Async persistence of memory context (fire and forget)
      void this.persistMemoryContext(session, intentClassification.intent).catch(err => {
        this.logger.warn(`Failed to persist memory context for thread ${session.conversationContext.threadId}: ${err}`);
      });

      // Step 2: Check guardrails
      const guardCheck = this.guardrails.validateContext(
        session.conversationContext,
      );

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

        return this.buildOutput(
          session,
          decision,
          intentClassification,
          startTime,
          trace,
        );
      }

      // Step 3: Check escalation policy
      const escalationDecision = this.escalationPolicy.shouldEscalate(
        intentClassification.intent,
        session.escalations,
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

        return this.buildOutput(
          session,
          decision,
          intentClassification,
          startTime,
          trace,
        );
      }

      // Step 4: Can proceed with agent handling
      const decision: AgentDecision = {
        type: "SEND_MESSAGE",
        text: "Entendi sua solicitação. Deixa eu processar isso para você...",
        reason: `Intent ${intentClassification.intent} can be handled`,
      };

      session.recordDecision(decision);

      return this.buildOutput(
        session,
        decision,
        intentClassification,
        startTime,
        trace,
      );
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
        trace,
      );
    }
  }

  private buildOutput(
    session: AgentRuntimeSession,
    decision: AgentDecision,
    intent: IntentClassification,
    startTime: number,
    trace: AgentExecutionTrace,
  ): AgentOutput {
    return {
      decision,
      intent,
      reasoning: `Classified as ${intent.intent}, escalation required: ${intent.requiresEscalation}`,
      trace: {
        ...trace,
        totalDuration: Date.now() - startTime,
        completedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
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
