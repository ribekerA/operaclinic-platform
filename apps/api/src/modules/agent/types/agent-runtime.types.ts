import type { ClinicSkillContext, ClinicSkillName } from "@operaclinic/shared";

// Re-export for convenience
export type { ClinicSkillName } from "@operaclinic/shared";

/**
 * Intent classification for routing agent behavior
 * Used to determine which skills and escalation policy apply
 */
export type AgentIntentType =
  | "FAQ_SIMPLE"
  | "LEAD_CAPTURE"
  | "BOOK_APPOINTMENT"
  | "RESCHEDULE_APPOINTMENT"
  | "CANCEL_APPOINTMENT"
  | "HUMAN_REQUEST"
  | "SELECT_OPTION"
  | "OUT_OF_SCOPE";

/**
 * Conversation Context - safely resolved from incoming event
 * Multi-tenant isolated, with all required routing information
 */
export interface ConversationContext {
  tenantId: string;
  clinicId?: string;
  threadId: string;
  patientId?: string | null;
  channel: "WHATSAPP" | "EMAIL" | "PHONE" | "API";
  correlationId: string;
  actorUserId: string;
  actorRole: string;
  source: "MESSAGE" | "EVENT" | "MANUAL" | "AGENT";
  timestamp: Date;
  metadata?: Record<string, unknown>;
  historicalContext?: {
    lastIntents: AgentIntentType[];
    offeredSlots?: any[];
  };
}

/**
 * Skill execution request - typed payload
 */
export interface SkillExecutionRequest {
  skillName: ClinicSkillName;
  payload: unknown;
  context: ClinicSkillContext;
}

/**
 * Result of skill execution
 */
export interface SkillExecutionResult {
  success: boolean;
  skillName: ClinicSkillName;
  result?: unknown;
  error?: string;
  duration: number;
  timestamp: string;
}

/**
 * Intent classification result
 */
export interface IntentClassification {
  intent: AgentIntentType;
  confidence: number; // 0-1
  keywords: string[];
  suggestedSkills: ClinicSkillName[];
  requiresEscalation: boolean;
  reason: string;
}

/**
 * Agent decision - what to do with a conversation
 */
export type AgentDecision =
  | {
      type: "SKILL_CALL";
      skillName: ClinicSkillName;
      payload: unknown;
      reason: string;
    }
  | {
      type: "SEND_MESSAGE";
      text: string;
      reason: string;
    }
  | {
      type: "ESCALATE";
      reason: string;
      handoffData: EscalationRequest;
    }
  | {
      type: "NO_ACTION";
      reason: string;
    };

/**
 * Escalation request - handoff to human
 */
export interface EscalationRequest {
  threadId: string;
  reason: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  note: string;
  metadata?: Record<string, unknown>;
}

/**
 * Complete agent input for processing
 */
export interface AgentInput {
  conversationContext: ConversationContext;
  messageText: string;
  historicalContext?: {
    lastIntents: AgentIntentType[];
    failedAttempts: number;
    previousDecisions: AgentDecision[];
  };
}

/**
 * Complete agent output/result
 */
export interface AgentOutput {
  decision: AgentDecision;
  intent: IntentClassification;
  reasoning: string;
  trace: AgentExecutionTrace;
  timestamp: string;
}

/**
 * Execution trace for observability
 */
export interface AgentExecutionTrace {
  correlationId: string;
  steps: AgentExecutionStep[];
  guardrailsChecked: GuardrailsResult;
  totalDuration: number;
  completedAt: string;
}

export interface AgentExecutionStep {
  name: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "SKIPPED";
  duration: number;
  result?: unknown;
  error?: string;
}

/**
 * Result of guardrails validation
 */
export interface GuardrailsResult {
  passed: boolean;
  checks: GuardailCheck[];
  blockingIssues: string[];
  warnings: string[];
}

export interface GuardailCheck {
  name: string;
  status: "PASS" | "FAIL" | "WARN" | "SKIP";
  reason?: string;
}

/**
 * Escalation policy decision
 */
export interface EscalationPolicyDecision {
  shouldEscalate: boolean;
  intent: AgentIntentType;
  failedAttempts: number;
  reason: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
}

/**
 * Agent session - maintains state across multiple interactions
 */
export interface AgentSession {
  conversationContext: ConversationContext;
  startedAt: Date;
  intentHistory: AgentIntentType[];
  decisions: AgentDecision[];
  skillCalls: SkillExecutionResult[];
  escalations: number;
  isEscalated: boolean;
}
