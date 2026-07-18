import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PlanEntitlementsService } from "../../common/plan-entitlements/plan-entitlements.service";
import { HandoffRequestsService } from "../messaging/handoff-requests.service";
import { AgentOrchestratorService } from "./agent-orchestrator.service";
import { AnthropicSchedulingAgentService } from "./anthropic-scheduling-agent.service";
import { HandoffStatus } from "@prisma/client";

const BOOKING_INTENTS = new Set([
  "BOOK_APPOINTMENT",
  "SELECT_OPTION",
  "RESCHEDULE_APPOINTMENT",
  "CANCEL_APPOINTMENT",
]);

/**
 * Payload from an inbound WhatsApp message, normalized for agent processing.
 */
export interface AgentBridgeInboundPayload {
  /** The resolved tenant for the integration connection */
  tenantId: string;
  /** The messaging thread ID where the message arrived */
  threadId: string;
  /** The raw message text from the lead */
  messageText: string | null;
  /** The sender phone number (normalized) */
  senderPhoneNumber: string;
  /** The sender display name (if available) */
  senderDisplayName: string | null;
  /** The patient ID linked to this thread (if already identified) */
  patientId: string | null;
  /** A correlation ID for end-to-end tracing */
  correlationId?: string;
}

/**
 * AgentMessageBridgeService
 *
 * Connects the WhatsApp inbound webhook to the Agent Orchestrator.
 *
 * Responsibility:
 * - After a message is saved to the MessageThread, trigger the CaptacaoAgent
 *   if two conditions are met:
 *   1. The thread does NOT have an active handoff (OPEN or ASSIGNED).
 *   2. The message has text content (non-empty).
 *
 * Safety guarantees:
 * - All errors are caught and logged — the bridge never throws to the caller.
 * - If the agent fails, the inbound message is already persisted safely.
 * - Multi-tenant isolation is enforced by the agent runtime itself.
 */
@Injectable()
export class AgentMessageBridgeService {
  private readonly logger = new Logger(AgentMessageBridgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: AgentOrchestratorService,
    private readonly configService: ConfigService,
    private readonly anthropicAgent: AnthropicSchedulingAgentService,
    private readonly planEntitlements: PlanEntitlementsService,
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => HandoffRequestsService))
    private readonly handoffRequestsService: HandoffRequestsService,
  ) {}

  /**
   * Attempt to route an inbound message to the CaptacaoAgent.
   *
   * This method never throws — errors are logged and suppressed so the
   * caller (WhatsappWebhooksService) always succeeds in persisting the event.
   */
  async routeInboundMessage(payload: AgentBridgeInboundPayload): Promise<void> {
    try {
      if (!this.isAgentLayerEnabledForThread(payload.threadId)) {
        this.logger.debug(
          `AgentBridge: Skipping thread ${payload.threadId} - agent layer disabled by rollout gate`,
        );
        return;
      }

      if (!payload.messageText?.trim()) {
        this.logger.debug(
          `AgentBridge: Skipping thread ${payload.threadId} — no text content`,
        );
        return;
      }

      // Guard: only trigger agent if no active handoff exists
      const hasActiveHandoff = await this.threadHasActiveHandoff(
        payload.tenantId,
        payload.threadId,
      );

      if (hasActiveHandoff) {
        this.logger.debug(
          `AgentBridge: Skipping thread ${payload.threadId} — active handoff present`,
        );
        return;
      }

      const quota = await this.planEntitlements.checkAiConversationQuota(
        payload.tenantId,
        payload.threadId,
      );

      if (!quota.allowed) {
        this.logger.warn(
          `AgentBridge: Skipping thread ${payload.threadId} — monthly AI conversation quota exceeded (tenant: ${payload.tenantId}, used: ${quota.usedThisMonth}, limit: ${quota.limit})`,
        );

        await this.handoffRequestsService.ensureAutomaticHandoffForThread({
          tenantId: payload.tenantId,
          threadId: payload.threadId,
          reason: "Limite mensal de conversas atendidas por IA do plano contratado foi atingido.",
        });

        await this.auditService.record({
          action: AUDIT_ACTIONS.PLAN_AI_CONVERSATION_QUOTA_EXCEEDED,
          actor: this.buildSystemActor(payload.tenantId),
          tenantId: payload.tenantId,
          targetType: "message_thread",
          targetId: payload.threadId,
          metadata: { limit: quota.limit, usedThisMonth: quota.usedThisMonth },
        });

        return;
      }

      const correlationId = payload.correlationId ?? randomUUID();

      // LLM agent path — takes precedence when enabled and API key is set
      const anthropicEnabled =
        this.configService.get<boolean>("ANTHROPIC_AGENT_ENABLED", false) &&
        !!this.configService.get<string>("ANTHROPIC_API_KEY", "");

      if (anthropicEnabled) {
        this.logger.debug(
          `AgentBridge: LLM path for thread ${payload.threadId} (tenant: ${payload.tenantId})`,
        );
        await this.anthropicAgent.handle({
          tenantId: payload.tenantId,
          threadId: payload.threadId,
          patientId: payload.patientId,
          patientPhone: payload.senderPhoneNumber,
          patientName: payload.senderDisplayName,
          messageText: payload.messageText.trim(),
          correlationId,
        });
        return;
      }

      const systemActor = this.buildSystemActor(payload.tenantId);

      // Decide which agent handles this message
      const threadCtx = await this.resolveThreadContext(
        payload.tenantId,
        payload.threadId,
      );
      const isBookingMode =
        threadCtx.patientId !== null &&
        threadCtx.lastIntent !== null &&
        BOOKING_INTENTS.has(threadCtx.lastIntent);

      if (isBookingMode) {
        this.logger.debug(
          `AgentBridge: Triggering AgendamentoAgent for thread ${payload.threadId} (intent=${threadCtx.lastIntent})`,
        );

        const result = await this.orchestrator.executeAgendamento(systemActor, {
          threadId: payload.threadId,
          patientId: threadCtx.patientId!,
          messageText: payload.messageText.trim(),
          correlationId,
        });

        this.logger.debug(
          `AgentBridge: AgendamentoAgent completed for thread ${payload.threadId} — status: ${result.meta.status}`,
        );
        return;
      }

      this.logger.debug(
        `AgentBridge: Triggering CaptacaoAgent for thread ${payload.threadId} (tenant: ${payload.tenantId})`,
      );

      const result = await this.orchestrator.executeCaptacao(systemActor, {
        threadId: payload.threadId,
        messageText: payload.messageText.trim(),
        patientPhone: payload.senderPhoneNumber,
        patientName: payload.senderDisplayName ?? undefined,
        correlationId,
      });

      this.logger.debug(
        `AgentBridge: CaptacaoAgent completed for thread ${payload.threadId} — status: ${result.meta.status}`,
      );
    } catch (error) {
      // CRITICAL: Never propagate errors to the webhook handler.
      // The inbound message is already persisted; agent failure is non-blocking.
      this.logger.warn(
        `AgentBridge: Agent execution failed for thread ${payload.threadId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Resolve lightweight thread context to decide agent routing.
   */
  private async resolveThreadContext(
    tenantId: string,
    threadId: string,
  ): Promise<{ patientId: string | null; lastIntent: string | null }> {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId, tenantId },
      select: { patientId: true, lastIntent: true },
    });

    return {
      patientId: thread?.patientId ?? null,
      lastIntent: thread?.lastIntent ?? null,
    };
  }

  /**
   * Check if a thread has an active (OPEN or ASSIGNED) handoff.
   */
  private async threadHasActiveHandoff(
    tenantId: string,
    threadId: string,
  ): Promise<boolean> {
    const activeHandoff = await this.prisma.handoffRequest.findFirst({
      where: {
        tenantId,
        threadId,
        status: {
          in: [HandoffStatus.OPEN, HandoffStatus.ASSIGNED],
        },
      },
      select: { id: true },
    });

    return activeHandoff !== null;
  }

  /**
   * Build a synthetic system actor for agent execution context.
   *
   * The agent runtime requires an AuthenticatedUser-like object to build the
   * skill context. Since the trigger is automatic (from a webhook), we create
   * a system-level actor tied to the tenant.
   */
  private buildSystemActor(tenantId: string) {
    return {
      id: `system:agent-bridge:${tenantId}`,
      email: "agent-system@operaclinic.internal",
      profile: "clinic" as const,
      roles: ["RECEPTION" as const],
      tenantIds: [tenantId],
      activeTenantId: tenantId,
    };
  }

  private isAgentLayerEnabledForThread(threadId: string): boolean {
    const enabled = this.configService.get<boolean>("agent.enabled", true);

    if (!enabled) {
      return false;
    }

    const rolloutPercentage = this.configService.get<number>(
      "agent.rolloutPercentage",
      100,
    );

    if (rolloutPercentage >= 100) {
      return true;
    }

    if (rolloutPercentage <= 0) {
      return false;
    }

    const bucket = this.resolveThreadBucket(threadId);

    return bucket < rolloutPercentage;
  }

  private resolveThreadBucket(threadId: string): number {
    const digest = createHash("sha256").update(threadId).digest("hex").slice(0, 8);
    const numeric = Number.parseInt(digest, 16);

    return numeric % 100;
  }
}
