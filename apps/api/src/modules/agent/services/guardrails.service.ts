import { Injectable, Logger, ForbiddenException } from "@nestjs/common";
import type {
  GuardrailsResult,
  GuardailCheck,
  ConversationContext,
  AgentSession,
} from "../types/agent-runtime.types";

const ESCALATION_AFTER_FAILED_ATTEMPTS = 3;
const MAX_SESSION_DURATION_MINUTES = 30;

/**
 * Guardrails Service
 * Implements safety checks before any agent action
 * Prevents:
 * - No valid tenant context
 * - Execution of disallowed skills
 * - Operating on invalid thread
 * - Out-of-scope responses
 * - Forbidden clinical decisions
 * - Autonomous actions without escalation when needed
 */
@Injectable()
export class GuardrailvService {
  private readonly logger = new Logger(GuardrailvService.name);

  /**
   * Validate context is safe to use
   */
  validateContext(context: ConversationContext): GuardrailsResult {
    const checks: GuardailCheck[] = [];

    // Check 1: Tenant ID exists and is non-empty
    if (!context.tenantId?.trim()) {
      checks.push({
        name: "TENANT_ID_REQUIRED",
        status: "FAIL",
        reason: "tenantId is missing or empty",
      });
    } else {
      checks.push({
        name: "TENANT_ID_REQUIRED",
        status: "PASS",
      });
    }

    // Check 2: Thread ID exists
    if (!context.threadId?.trim()) {
      checks.push({
        name: "THREAD_ID_REQUIRED",
        status: "FAIL",
        reason: "threadId is missing or empty",
      });
    } else {
      checks.push({
        name: "THREAD_ID_REQUIRED",
        status: "PASS",
      });
    }

    // Check 3: Actor ID exists
    if (!context.actorUserId?.trim()) {
      checks.push({
        name: "ACTOR_ID_REQUIRED",
        status: "FAIL",
        reason: "actorUserId is missing or empty",
      });
    } else {
      checks.push({
        name: "ACTOR_ID_REQUIRED",
        status: "PASS",
      });
    }

    // Check 4: Channel is valid
    const validChannels = ["WHATSAPP", "EMAIL", "PHONE", "API"];
    if (!validChannels.includes(context.channel)) {
      checks.push({
        name: "VALID_CHANNEL",
        status: "FAIL",
        reason: `Invalid channel: ${context.channel}`,
      });
    } else {
      checks.push({
        name: "VALID_CHANNEL",
        status: "PASS",
      });
    }

    const blockingIssues = checks
      .filter((c) => c.status === "FAIL")
      .map((c) => c.reason ?? c.name);

    return {
      passed: blockingIssues.length === 0,
      checks,
      blockingIssues,
      warnings: [],
    };
  }

  /**
   * Validate skill is allowed for agent execution
   * Future: can be enhanced with per-tenant skill whitelist
   */
  validateSkillAllowed(skillName: string): GuardrailsResult {
    const checks: GuardailCheck[] = [];

    // For v1, all registered skills are allowed
    // Future: implement per-tenant/per-intent skill restrictions
    const allowedSkills = [
      "find_or_merge_patient",
      "search_availability",
      "hold_slot",
      "create_appointment",
      "confirm_appointment",
      "reschedule_appointment",
      "cancel_appointment",
      "open_handoff",
      "close_handoff",
      "send_message",
    ];

    if (allowedSkills.includes(skillName)) {
      checks.push({
        name: "SKILL_WHITELISTED",
        status: "PASS",
      });
    } else {
      checks.push({
        name: "SKILL_WHITELISTED",
        status: "FAIL",
        reason: `Skill "${skillName}" is not whitelisted for agent execution`,
      });
    }

    const blockingIssues = checks
      .filter((c) => c.status === "FAIL")
      .map((c) => c.reason ?? c.name);

    return {
      passed: blockingIssues.length === 0,
      checks,
      blockingIssues,
      warnings: [],
    };
  }

  /**
   * Check if session should escalate based on state
   */
  checkShouldEscalate(session: AgentSession): GuardrailsResult {
    const checks: GuardailCheck[] = [];
    const warnings: string[] = [];

    // Check 1: Failed attempts
    const failedAttempts = session.decisions.filter(
      (d) => d.type === "ESCALATE",
    ).length;

    if (failedAttempts >= ESCALATION_AFTER_FAILED_ATTEMPTS) {
      checks.push({
        name: "ESCALATION_REQUIRED_ATTEMPTS",
        status: "FAIL",
        reason: `Too many failed attempts (${failedAttempts}/${ESCALATION_AFTER_FAILED_ATTEMPTS})`,
      });
    } else if (failedAttempts > 0) {
      warnings.push(
        `Failed attempts: ${failedAttempts}/${ESCALATION_AFTER_FAILED_ATTEMPTS}`,
      );
      checks.push({
        name: "ESCALATION_ATTEMPTS_WARNING",
        status: "WARN",
        reason: `Approaching escalation threshold`,
      });
    } else {
      checks.push({
        name: "ESCALATION_ATTEMPTS_OK",
        status: "PASS",
      });
    }

    // Check 2: Session duration
    const durationMinutes =
      (new Date().getTime() - session.startedAt.getTime()) / (1000 * 60);
    if (durationMinutes > MAX_SESSION_DURATION_MINUTES) {
      warnings.push(
        `Session duration exceeds ${MAX_SESSION_DURATION_MINUTES} minutes`,
      );
      checks.push({
        name: "SESSION_DURATION_WARNING",
        status: "WARN",
        reason: "Long session - consider escalation",
      });
    } else {
      checks.push({
        name: "SESSION_DURATION_OK",
        status: "PASS",
      });
    }

    // Check 3: Already escalated
    if (session.isEscalated) {
      checks.push({
        name: "ALREADY_ESCALATED",
        status: "WARN",
        reason: "Conversation already escalated to human",
      });
    }

    const blockingIssues = checks
      .filter((c) => c.status === "FAIL")
      .map((c) => c.reason ?? c.name);

    return {
      passed: blockingIssues.length === 0,
      checks,
      blockingIssues,
      warnings,
    };
  }

  /**
   * Check if response is allowed (prevents clinical decisions, etc)
   */
  validateResponseAllowed(responseText: string): GuardrailsResult {
    const checks: GuardailCheck[] = [];
    const warnings: string[] = [];

    // Check 1: Message is not empty
    if (!responseText?.trim()) {
      checks.push({
        name: "MESSAGE_NOT_EMPTY",
        status: "FAIL",
        reason: "Cannot send empty response",
      });
    } else {
      checks.push({
        name: "MESSAGE_NOT_EMPTY",
        status: "PASS",
      });
    }

    // Check 2: No clinical advice
    const clinicalKeywords = [
      "diagnóstico",
      "prescrição",
      "medicamento",
      "doenças",
      "tratamento médico",
      "cirurgia",
    ];
    const lowerText = responseText.toLowerCase();
    const foundClinicalKeywords = clinicalKeywords.filter((kw) =>
      lowerText.includes(kw),
    );

    if (foundClinicalKeywords.length > 0) {
      warnings.push(
        `Message contains potential clinical advice: ${foundClinicalKeywords.join(", ")}`,
      );
      checks.push({
        name: "NO_CLINICAL_ADVICE",
        status: "WARN",
        reason: "Message may contain clinical guidance - escalate if unclear",
      });
    } else {
      checks.push({
        name: "NO_CLINICAL_ADVICE",
        status: "PASS",
      });
    }

    // Check 3: Reasonable length
    if (responseText.length >= 1000) {
      warnings.push("Response is very long - consider breaking into multiple messages");
      checks.push({
        name: "RESPONSE_LENGTH",
        status: "WARN",
        reason: "Message may be too long",
      });
    } else {
      checks.push({
        name: "RESPONSE_LENGTH",
        status: "PASS",
      });
    }

    const blockingIssues = checks
      .filter((c) => c.status === "FAIL")
      .map((c) => c.reason ?? c.name);

    return {
      passed: blockingIssues.length === 0,
      checks,
      blockingIssues,
      warnings,
    };
  }
}
