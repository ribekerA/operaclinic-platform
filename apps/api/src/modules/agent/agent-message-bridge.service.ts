import { Injectable, Logger } from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { AgentOrchestratorService } from "./agent-orchestrator.service";
import { HandoffStatus } from "@prisma/client";

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

      this.logger.debug(
        `AgentBridge: Triggering CaptacaoAgent for thread ${payload.threadId} (tenant: ${payload.tenantId})`,
      );

      // Build a synthetic AuthenticatedUser for the agent runtime context.
      // The agent runs as a system actor, not a real clinic user.
      const systemActor = this.buildSystemActor(payload.tenantId);

      const result = await this.orchestrator.executeCaptacao(
        systemActor,
        {
          threadId: payload.threadId,
          messageText: payload.messageText.trim(),
          patientPhone: payload.senderPhoneNumber,
          patientName: payload.senderDisplayName ?? undefined,
          correlationId: payload.correlationId ?? randomUUID(),
        },
      );

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
