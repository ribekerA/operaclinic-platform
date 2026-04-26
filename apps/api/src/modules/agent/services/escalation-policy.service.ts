import { Injectable, Logger } from "@nestjs/common";
import type {
  EscalationPolicyDecision,
  AgentIntentType,
} from "../types/agent-runtime.types";

/**
 * Escalation Policy Service
 * Determines when to escalate conversation to human
 * Defines priority and reasoning for handoffs
 */
@Injectable()
export class EscalationPolicyService {
  private readonly logger = new Logger(EscalationPolicyService.name);

  /**
   * Determine if conversation should be escalated
   */
  shouldEscalate(
    intent: AgentIntentType,
    failedAttempts: number,
    isOutOfScope: boolean = false,
  ): EscalationPolicyDecision {
    this.logger.debug(
      `Evaluating escalation: intent=${intent}, failedAttempts=${failedAttempts}, outOfScope=${isOutOfScope}`,
    );

    // Rule 1: Intent explicitly requires escalation
    if (this.intentRequiresEscalation(intent)) {
      return {
        shouldEscalate: true,
        intent,
        failedAttempts,
        reason: `Intent "${intent}" always requires human escalation`,
        priority: this.getPriorityForIntent(intent),
      };
    }

    // Rule 2: Out of scope messages
    if (isOutOfScope) {
      return {
        shouldEscalate: true,
        intent,
        failedAttempts,
        reason: "Message is out of scope for agent handling",
        priority: "HIGH",
      };
    }

    // Rule 3: Too many failed attempts
    if (failedAttempts >= 3) {
      return {
        shouldEscalate: true,
        intent,
        failedAttempts,
        reason: `Too many failed attempts (${failedAttempts})`,
        priority: "MEDIUM",
      };
    }

    // No escalation needed
    return {
      shouldEscalate: false,
      intent,
      failedAttempts,
      reason: "Intent can be handled by agent",
      priority: "LOW",
    };
  }

  /**
   * Check if specific intent requires immediate escalation
   */
  private intentRequiresEscalation(intent: AgentIntentType): boolean {
    const requiresEscalation: AgentIntentType[] = [
      "HUMAN_REQUEST",
      "OUT_OF_SCOPE",
    ];
    return requiresEscalation.includes(intent);
  }

  /**
   * Determine priority for handoff
   */
  private getPriorityForIntent(intent: AgentIntentType): "LOW" | "MEDIUM" | "HIGH" {
    const priorityMap: Record<AgentIntentType, "LOW" | "MEDIUM" | "HIGH"> = {
      FAQ_SIMPLE: "LOW",
      LEAD_CAPTURE: "LOW",
      BOOK_APPOINTMENT: "MEDIUM",
      RESCHEDULE_APPOINTMENT: "MEDIUM",
      CANCEL_APPOINTMENT: "MEDIUM",
      HUMAN_REQUEST: "HIGH",
      SELECT_OPTION: "LOW",
      OUT_OF_SCOPE: "HIGH",
    };
    return priorityMap[intent];
  }

  /**
   * Get escalation note for handoff reason
   */
  getEscalationNote(
    intent: AgentIntentType,
    failedAttempts: number,
    additionalContext?: string,
  ): string {
    const baseNote = this.getEscalationReason(intent, failedAttempts);
    if (additionalContext) {
      return `${baseNote}\n\nNota adicional: ${additionalContext}`;
    }
    return baseNote;
  }

  private getEscalationReason(
    intent: AgentIntentType,
    failedAttempts: number,
  ): string {
    const reasons: Record<AgentIntentType, string> = {
      FAQ_SIMPLE: "Dúvida simples que poderia ser melhor respondida pela recepção",
      LEAD_CAPTURE: "Novo lead que requer atenção de um representante",
      BOOK_APPOINTMENT: "Paciente deseja agendar consulta",
      RESCHEDULE_APPOINTMENT: "Paciente deseja remarcar consulta",
      CANCEL_APPOINTMENT: "Paciente deseja cancelar consulta",
      HUMAN_REQUEST: "Paciente solicitou explicitamente falar com um atendente",
      SELECT_OPTION: "Dificuldade do paciente em selecionar uma opção de horário disponível",
      OUT_OF_SCOPE: "Mensagem fora do escopo de atendimento automático",
    };

    const base = reasons[intent];

    if (failedAttempts > 0 && failedAttempts < 3) {
      return `${base} (tentativas anteriores: ${failedAttempts})`;
    }

    if (failedAttempts >= 3) {
      return `${base} (agent não conseguiu resolver após múltiplas tentativas)`;
    }

    return base;
  }

  /**
   * Detect urgency in user message text
   */
  detectUrgency(text: string): "HIGH" | null {
    const urgencyKeywords = [
      "urgente",
      "emergencia",
      "rapido",
      "agora",
      "atendente",
      "humano",
      "pelo amor de deus",
      "ajuda",
      "socorro",
    ];
    const lowerText = text.toLowerCase();
    if (urgencyKeywords.some((kw) => lowerText.includes(kw))) {
      return "HIGH";
    }
    return null;
  }

  /**
   * Validate escalation request
   */
  validateEscalationRequest(
    threadId: string,
    reason: string,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!threadId?.trim()) {
      errors.push("threadId is required");
    }

    if (!reason?.trim()) {
      errors.push("reason is required");
    }

    if (reason && reason.length > 500) {
      errors.push("reason is too long (max 500 characters)");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
