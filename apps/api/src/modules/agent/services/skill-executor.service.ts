import { Injectable, Logger } from "@nestjs/common";
import type {
  SkillExecutionRequest,
  SkillExecutionResult,
  ConversationContext,
} from "../types/agent-runtime.types";
import { SkillRegistryService } from "../../skill-registry/skill-registry.service";
import { GuardrailvService } from "./guardrails.service";
import { AgentObservabilityService } from "./agent-observability.service";
import type {
  ClinicSkillContext,
  ClinicSkillInputMap,
  ClinicSkillName,
} from "@operaclinic/shared";

/**
 * Skill Executor
 * Safely executes skills with guardrails and tenant validation
 * Wrapper around SkillRegistryService with additional security
 */
@Injectable()
export class SkillExecutorService {
  private readonly logger = new Logger(SkillExecutorService.name);

  constructor(
    private readonly skillRegistry: SkillRegistryService,
    private readonly guardrails: GuardrailvService,
    private readonly observability: AgentObservabilityService,
  ) {}

  /**
   * Execute skill with full validation
   */
  async execute(request: SkillExecutionRequest): Promise<SkillExecutionResult> {
    const { skillName, context } = request;
    const startTime = Date.now();

    this.logger.debug(
      `Executing skill ${skillName} for tenant ${context.tenantId}`,
    );

    try {
      // Guardrail 1: Validate context
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

      const contextCheck = this.guardrails.validateContext(conversationContext);
      if (!contextCheck.passed) {
        this.logger.warn(
          `Context validation failed: ${contextCheck.blockingIssues.join(", ")}`,
        );
        throw new Error(
          `Context validation failed: ${contextCheck.blockingIssues.join(", ")}`,
        );
      }

      // Guardrail 2: Validate skill is allowed
      const skillCheck = this.guardrails.validateSkillAllowed(skillName);
      if (!skillCheck.passed) {
        this.logger.warn(
          `Skill ${skillName} not allowed: ${skillCheck.blockingIssues.join(", ")}`,
        );
        throw new Error(
          `Skill ${skillName} not allowed: ${skillCheck.blockingIssues.join(", ")}`,
        );
      }

      // Execute skill
      const result = await this.skillRegistry.execute(
        skillName as ClinicSkillName,
        context,
        request.payload as ClinicSkillInputMap[ClinicSkillName],
      );

      const duration = Date.now() - startTime;

      this.observability.recordSkillExecution({
        skillName,
        tenantId: context.tenantId,
        correlationId: context.correlationId || "",
        durationMs: duration,
        success: true,
        timestamp: Date.now(),
      });

      this.logger.log(
        JSON.stringify({
          event: "agent.skill_execution",
          status: "success",
          skillName,
          tenantId: context.tenantId,
          correlationId: context.correlationId || "",
          durationMs: duration,
        }),
      );

      return {
        success: true,
        skillName,
        result,
        duration,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(
        `Skill ${skillName} execution failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      this.observability.recordSkillExecution({
        skillName,
        tenantId: context.tenantId,
        correlationId: context.correlationId || "",
        durationMs: duration,
        success: false,
        timestamp: Date.now(),
      });

      this.logger.error(
        JSON.stringify({
          event: "agent.skill_execution",
          status: "failed",
          skillName,
          tenantId: context.tenantId,
          correlationId: context.correlationId || "",
          durationMs: duration,
          error: error instanceof Error ? error.message : String(error),
        }),
      );

      return {
        success: false,
        skillName,
        error: error instanceof Error ? error.message : String(error),
        duration,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Pre-check if a skill WOULD be allowed (without executing it)
   * Useful for planning next steps
   */
  canExecute(
    skillName: string,
    context: ClinicSkillContext,
  ): { allowed: boolean; reason: string } {
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

    const contextCheck = this.guardrails.validateContext(conversationContext);
    if (!contextCheck.passed) {
      return {
        allowed: false,
        reason: `Context invalid: ${contextCheck.blockingIssues.join(", ")}`,
      };
    }

    const skillCheck = this.guardrails.validateSkillAllowed(skillName);
    if (!skillCheck.passed) {
      return {
        allowed: false,
        reason: `Skill not allowed: ${skillCheck.blockingIssues.join(", ")}`,
      };
    }

    return {
      allowed: true,
      reason: "Skill execution is allowed",
    };
  }
}
