import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import type { ConversationContext } from "../types/agent-runtime.types";
import type { ClinicSkillContext } from "@operaclinic/shared";
import type { AuthenticatedUser } from "../../../auth/interfaces/authenticated-user.interface";

/**
 * Conversation Context Resolver
 * Safely resolves and validates all context information from incoming events
 * Ensures multi-tenant isolation and security
 */
@Injectable()
export class ConversationContextResolverService {
  private readonly logger = new Logger(ConversationContextResolverService.name);

  /**
   * Resolve context from skill context (internal agent calls)
   */
  resolveFromSkillContext(
    skillContext: ClinicSkillContext,
    threadId: string,
  ): ConversationContext {
    this.logger.debug(
      `Resolving context from skill context for tenant ${skillContext.tenantId}`,
    );

    if (!skillContext.tenantId?.trim()) {
      throw new BadRequestException("Skill context missing tenantId");
    }

    if (!skillContext.actorUserId?.trim()) {
      throw new BadRequestException("Skill context missing actorUserId");
    }

    if (!threadId?.trim()) {
      throw new BadRequestException("Thread ID is required");
    }

    return {
      tenantId: skillContext.tenantId.trim(),
      threadId: threadId.trim(),
      channel: "WHATSAPP", // Default for messaging
      correlationId: skillContext.correlationId || this.generateCorrelationId(),
      actorUserId: skillContext.actorUserId.trim(),
      actorRole: "AGENT", // Agent is the actor
      source: "AGENT",
      timestamp: new Date(),
      metadata: {
        skillSource: skillContext.source,
      },
    };
  }

  /**
   * Resolve context from authenticated user and webhook payload
   * Used when processing incoming messages
   */
  resolveFromWebhook(
    actor: AuthenticatedUser,
    payload: {
      tenantId: string;
      threadId: string;
      channel: "WHATSAPP" | "EMAIL" | "PHONE";
      patientId?: string;
      metadata?: Record<string, unknown>;
    },
  ): ConversationContext {
    this.logger.debug(`Resolving context from webhook for tenant ${payload.tenantId}`);

    // Validate tenant isolation - actor must belong to tenant
    if (!actor.tenantIds.includes(payload.tenantId)) {
      throw new BadRequestException(
        "Actor does not belong to specified tenant",
      );
    }

    if (!payload.tenantId?.trim()) {
      throw new BadRequestException("Webhook payload missing tenantId");
    }

    if (!payload.threadId?.trim()) {
      throw new BadRequestException("Webhook payload missing threadId");
    }

    return {
      tenantId: payload.tenantId.trim(),
      threadId: payload.threadId.trim(),
      patientId: payload.patientId ?? undefined,
      channel: payload.channel,
      correlationId: this.generateCorrelationId(),
      actorUserId: actor.id,
      actorRole: actor.roles?.[0] ?? "UNKNOWN",
      source: "MESSAGE",
      timestamp: new Date(),
      metadata: payload.metadata,
    };
  }

  /**
   * Safely extract clinic ID from context when available
   */
  resolveClinicId(context: ConversationContext): string | undefined {
    // For now, clinic is derived from tenant-clinic mapping
    // Future: could be stored in context.metadata
    return context.metadata?.clinicId as string | undefined;
  }

  /**
   * Validate that context is safe to use
   */
  validate(context: ConversationContext): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!context.tenantId?.trim()) {
      errors.push("tenantId is required and non-empty");
    }

    if (!context.threadId?.trim()) {
      errors.push("threadId is required and non-empty");
    }

    if (!context.actorUserId?.trim()) {
      errors.push("actorUserId is required and non-empty");
    }

    if (!context.correlationId?.trim()) {
      errors.push("correlationId is required and non-empty");
    }

    if (!["WHATSAPP", "EMAIL", "PHONE", "API"].includes(context.channel)) {
      errors.push(`Invalid channel: ${context.channel}`);
    }

    if (!["AGENT", "USER", "SYSTEM"].includes(context.actorRole)) {
      errors.push(`Invalid actor role: ${context.actorRole}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private generateCorrelationId(): string {
    return `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
