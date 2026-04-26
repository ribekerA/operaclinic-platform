import { Injectable, Logger } from "@nestjs/common";
import type {
  AgentExecutionStatus,
  CaptacaoAgentRequestPayload,
  MessagingHandoffPayload,
  MessagingThreadDetailPayload,
  ReceptionPatientSummary,
} from "@operaclinic/shared";
import { AgentRuntimeSession } from "../agent-runtime.service";
import { IntentRouterService } from "../services/intent-router.service";
import { GuardrailvService } from "../services/guardrails.service";
import { EscalationPolicyService } from "../services/escalation-policy.service";
import type {
  AgentDecision,
  IntentClassification,
} from "../types/agent-runtime.types";

interface CaptacaoAgentExecutionResult {
  status: AgentExecutionStatus;
  patient: ReceptionPatientSummary | null;
  handoff: MessagingHandoffPayload | null;
  thread: MessagingThreadDetailPayload | null;
  replyText: string | null;
}

/**
 * CaptacaoAgentService v1
 *
 * Responsável pela qualificação inicial de leads e direcionamento para próximas etapas.
 *
 * Capacidades:
 * - Classificar intenção da mensagem inicial
 * - Identificar/criar lead
 * - Responder FAQ simples
 * - Coletar dados básicos (nome, interesse)
 * - Encaminhar para agendamento
 * - Abrir escalação quando necessário
 *
 * Limites implementados:
 * - Só usa skills: find_or_merge_patient, send_message, open_handoff
 * - Não cria appointment
 * - Não responde questões clínicas
 * - Escala quando: fora de escopo, clínico, ambiguidade, pedido explícito
 */
@Injectable()
export class CaptacaoAgentService {
  private readonly logger = new Logger(CaptacaoAgentService.name);

  // FAQ pré-configuradas simples
  private readonly faqDatabase: Record<string, string> = {
    horario:
      "Funcionamos de segunda a sexta de 08h às 18h, e aos sábados de 08h às 12h.",
    preco:
      "Os valores variam conforme o procedimento. Pode me passar o seu interesse que consigo informar melhor?",
    localizacao:
      "Estamos localizados no centro da cidade. Posso confirmar com você o melhor endereço após verificarem o procedimento desejado.",
    especializacao:
      "Temos profissionais especializados em diversas áreas. Qual seu interesse?",
  };

  constructor(
    private intentRouter: IntentRouterService,
    private guardrails: GuardrailvService,
    private escalationPolicy: EscalationPolicyService,
  ) {}

  async execute(
    session: AgentRuntimeSession,
    input: CaptacaoAgentRequestPayload,
  ): Promise<CaptacaoAgentExecutionResult> {
    const startTime = Date.now();

    this.logger.debug(
      `CaptacaoAgent v1: Processing lead message for tenant ${session.conversationContext.tenantId}`,
    );

    try {
      // 1. VALIDAR CONTEXTO COM GUARDRAILS
      const contextValidation = this.guardrails.validateContext(
        session.conversationContext,
      );

      if (!contextValidation.passed) {
        this.logger.warn(
          `CaptacaoAgent: Context validation failed: ${contextValidation.blockingIssues.join(", ")}`,
        );

        const replyText =
          "Desculpe, não consegui processar sua mensagem. Tente novamente.";
        const thread = await session.executeSkill("send_message", {
          threadId: input.threadId,
          text: replyText,
        });

        return {
          status: "FAILED",
          patient: null,
          handoff: null,
          thread,
          replyText,
        };
      }

      // 2. CLASSIFICAR INTENÇÃO usando Intent Router
      const intentClassification = this.intentRouter.classify(input.messageText);
      session.intentHistory.push(intentClassification.intent);

      this.logger.debug(
        `CaptacaoAgent: Intent classified as ${intentClassification.intent} (confidence: ${intentClassification.confidence})`,
      );

      // 3. TENTAR IDENTIFICAR/CRIAR LEAD se houver dados
      let patient: ReceptionPatientSummary | null = null;

      if (input.patientPhone?.trim()) {
        try {
          patient = await session.executeSkill("find_or_merge_patient", {
            fullName: input.patientName?.trim() || undefined,
            contacts: [
              {
                type: "WHATSAPP",
                value: input.patientPhone.trim(),
                isPrimary: true,
              },
            ],
          });

          this.logger.debug(
            `CaptacaoAgent: Found or created patient: ${patient?.id}`,
          );
        } catch (error) {
          this.logger.warn(
            `CaptacaoAgent: Failed to find_or_merge_patient: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Continua mesmo se falhar - não é bloqueante
        }
      }

      // 4. DECIDIR AÇÃO baseada na intenção
      let decision: AgentDecision;
      let replyText: string | null = null;
      let handoff: MessagingHandoffPayload | null = null;

      switch (intentClassification.intent) {
        case "FAQ_SIMPLE":
          decision = this.decideFAQResponse(intentClassification, input.messageText);
          break;

        case "LEAD_CAPTURE":
          decision = this.decideLeadCapture(patient, input.messageText, session);
          break;

        case "BOOK_APPOINTMENT":
          decision = this.decideBookAppointment(patient, input.messageText, session);
          break;

        case "RESCHEDULE_APPOINTMENT":
        case "CANCEL_APPOINTMENT":
          // Requer funcionalidade específica - escalar
          decision = this.decideEscalate(
            intentClassification,
            input.messageText,
            "Agente de Agendamento precisa processar esta solicitação",
          );
          break;

        case "HUMAN_REQUEST":
          // Pedido explícito de humano - escalar com HIGH priority
          decision = this.decideEscalate(
            intentClassification,
            input.messageText,
            "Cliente solicitou explicitamente conversar com um atendente humano",
            "HIGH",
          );
          break;

        case "OUT_OF_SCOPE":
          // Fora do escopo - escalar
          decision = this.decideEscalate(
            intentClassification,
            input.messageText,
            "Mensagem fora do escopo de captação de leads",
          );
          break;

        default:
          decision = this.decideEscalate(
            intentClassification,
            input.messageText,
            "Classificação indeterminada",
          );
      }

      // 5. EXECUTAR DECISÃO
      const executionResult = await this.executeDecision(
        session,
        decision,
        input.threadId,
      );

      replyText = executionResult.replyText;
      handoff = executionResult.handoff;

      // 6. REGISTRAR DECISÃO NA SESSÃO
      session.decisions.push(decision);

      // 7. RETORNAR RESULTADO
      const status = this.mapDecisionToStatus(decision);

      const result: CaptacaoAgentExecutionResult = {
        status,
        patient,
        handoff,
        thread: executionResult.thread,
        replyText,
      };

      const duration = Date.now() - startTime;
      this.logger.debug(
        `CaptacaoAgent: Completed in ${duration}ms with status ${status}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `CaptacaoAgent: Unhandled error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Fail-safe: sempre tenta enviar mensagem de erro
      try {
        const replyText =
          "Desculpe, houve um erro ao processar sua mensagem. Por favor, tente novamente ou aguarde para conversar com um atendente.";
        const thread = await session.executeSkill("send_message", {
          threadId: input.threadId,
          text: replyText,
        });

        return {
          status: "FAILED",
          patient: null,
          handoff: null,
          thread,
          replyText,
        };
      } catch {
        return {
          status: "FAILED",
          patient: null,
          handoff: null,
          thread: null,
          replyText: null,
        };
      }
    }
  }

  /**
   * Decide how to respond to FAQ questions
   */
  private decideFAQResponse(
    intent: IntentClassification,
    messageText: string,
  ): AgentDecision {
    // Tentar encontrar FAQ relacionada
    const faqKey = this.findFAQKey(messageText);

    if (faqKey && this.faqDatabase[faqKey]) {
      return {
        type: "SEND_MESSAGE",
        text: this.faqDatabase[faqKey],
        reason: `FAQ response to: ${messageText.substring(0, 50)}`,
      };
    }

    // Se não encontrou FAQ específica, responder genérico
    return {
      type: "SEND_MESSAGE",
      text: "Recebi sua pergunta. Pode me detalhar um pouco mais sobre o que você gostaria de saber? Ou me diga seu nome que posso te ajudar melhor.",
      reason: "Generic FAQ response when specific match not found",
    };
  }

  /**
   * Decide how to capture new lead information
   */
  private decideLeadCapture(
    patient: ReceptionPatientSummary | null,
    messageText: string,
    session?: AgentRuntimeSession,
  ): AgentDecision {
    if (!patient) {
      return {
        type: "SEND_MESSAGE",
        text: "Ótimo! Gostaria de te conhecer melhor. Qual seu nome completo e qual procedimento você tem interesse?",
        reason: "Lead capture: request name and interest",
      };
    }

    const pastIntents = session?.conversationContext.historicalContext?.lastIntents || [];
    const hasPastIntent = pastIntents.length > 0;

    if (hasPastIntent) {
      return {
        type: "SEND_MESSAGE",
        text: `Olá novamente ${patient.fullName || ""}! Vi que você falou conosco anteriormente. Gostaria de continuar de onde paramos ou tem interesse em outro procedimento agora?`,
        reason: "Lead capture: re-engagement with historical context",
      };
    }

    // Se patient existe, coletar interesse
    return {
      type: "SEND_MESSAGE",
      text: `Ótimo ${patient.fullName || ""}! Qual procedimento ou profissional você tem interesse em consultar?`,
      reason: "Lead capture: request interest (patient already identified)",
    };
  }

  /**
   * Decide how to handle appointment booking requests
   */
  private decideBookAppointment(
    patient: ReceptionPatientSummary | null,
    messageText: string,
    session?: AgentRuntimeSession,
  ): AgentDecision {
    if (!patient) {
      return {
        type: "SEND_MESSAGE",
        text: "Posso ajudar com seu agendamento! Me informe seu nome para começarmos.",
        reason: "Appointment request: identify patient first",
      };
    }

    const pastIntents = session?.conversationContext.historicalContext?.lastIntents || [];
    const hasPastIntent = pastIntents.length > 0;

    if (hasPastIntent) {
      return {
        type: "SEND_MESSAGE",
        text: `Olá novamente ${patient.fullName || ""}! Notei que você nos procurou há pouco tempo sobre agendamentos ou informações. Para te ajudar mais rápido hoje, qual a especialidade que precisa e o melhor dia?`,
        reason: "Appointment request: re-engagement with historical context",
      };
    }

    // Se temos patient, preparar para agendamento
    return {
      type: "SEND_MESSAGE",
      text: `Perfeito ${patient.fullName || ""}! Me diga a especialidade ou procedimento que você deseja, e qual seu melhor dia para atendimento.`,
      reason: "Appointment request: collect details (patient identified)",
    };
  }

  /**
   * Decide to escalate to human
   */
  private decideEscalate(
    intent: IntentClassification,
    messageText: string,
    reason: string,
    forcePriority?: "LOW" | "MEDIUM" | "HIGH",
  ): AgentDecision {
    // Determinar prioridade automática baseado no intent
    const priority =
      forcePriority ||
      (intent.intent === "HUMAN_REQUEST"
        ? "HIGH"
        : intent.intent === "OUT_OF_SCOPE"
          ? "MEDIUM"
          : "LOW");

    return {
      type: "ESCALATE",
      reason,
      handoffData: {
        threadId: "", // Será preenchido ao executar
        reason: `Escalação automática - ${intent.intent}`,
        priority,
        note: `Mensagem original: "${messageText.substring(0, 100)}${messageText.length > 100 ? "..." : ""}"`,
        metadata: {
          intent: intent.intent,
          confidence: intent.confidence,
          keywords: intent.keywords,
        },
      },
    };
  }

  /**
   * Execute the decision and generate response
   */
  private async executeDecision(
    session: AgentRuntimeSession,
    decision: AgentDecision,
    threadId: string,
  ): Promise<{
    replyText: string | null;
    handoff: MessagingHandoffPayload | null;
    thread: MessagingThreadDetailPayload | null;
  }> {
    try {
      switch (decision.type) {
        case "SEND_MESSAGE": {
          const thread = await session.executeSkill("send_message", {
            threadId,
            text: decision.text,
          });

          return {
            replyText: decision.text,
            handoff: null,
            thread,
          };
        }

        case "ESCALATE": {
          // Enviar mensagem de escalação
          const replyText =
            "Vou encaminhar sua conversa para um atendente que poderá ajudá-lo melhor.";
          const thread = await session.executeSkill("send_message", {
            threadId,
            text: replyText,
          });

          // Abrir handoff
          const handoffData = { ...decision.handoffData, threadId };
          const handoff = await session.executeSkill("open_handoff", handoffData);

          return {
            replyText,
            handoff,
            thread,
          };
        }

        case "SKILL_CALL": {
          // Executar skill genérico
          await session.executeSkill(
            decision.skillName as any,
            decision.payload,
          );

          return {
            replyText: null,
            handoff: null,
            thread: null,
          };
        }

        case "NO_ACTION":
        default: {
          return {
            replyText: null,
            handoff: null,
            thread: null,
          };
        }
      }
    } catch (error) {
      this.logger.error(
        `CaptacaoAgent: Error executing decision: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fail-safe: try to send error message
      try {
        const replyText =
          "Desculpe, encontramos uma dificuldade. Pode tentar novamente?";
        const thread = await session.executeSkill("send_message", {
          threadId,
          text: replyText,
        });

        return {
          replyText,
          handoff: null,
          thread,
        };
      } catch {
        return {
          replyText: null,
          handoff: null,
          thread: null,
        };
      }
    }
  }

  /**
   * Map agent decision to execution status
   */
  private mapDecisionToStatus(decision: AgentDecision): AgentExecutionStatus {
    switch (decision.type) {
      case "SEND_MESSAGE":
        return "WAITING_FOR_INPUT";
      case "ESCALATE":
        return "HANDOFF_OPENED";
      case "SKILL_CALL":
        return "COMPLETED";
      case "NO_ACTION":
        return "COMPLETED";
      default:
        return "COMPLETED";
    }
  }

  /**
   * Find relevant FAQ key from message
   */
  private findFAQKey(messageText: string): string | null {
    const lower = messageText.toLowerCase();

    if (
      lower.includes("horário") ||
      lower.includes("hora") ||
      lower.includes("aberto")
    ) {
      return "horario";
    }

    if (
      lower.includes("preço") ||
      lower.includes("valor") ||
      lower.includes("custa")
    ) {
      return "preco";
    }

    if (
      lower.includes("localiz") ||
      lower.includes("endereço") ||
      lower.includes("onde")
    ) {
      return "localizacao";
    }

    if (
      lower.includes("especialid") ||
      lower.includes("especialista") ||
      lower.includes("profissional")
    ) {
      return "especializacao";
    }

    return null;
  }
}
