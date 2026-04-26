import { Injectable, Logger } from "@nestjs/common";
import type {
  AgentExecutionStatus,
  AgendamentoAgentRequestPayload,
  MessagingHandoffPayload,
  MessagingThreadDetailPayload,
  ReceptionPatientSummary,
  ReceptionAvailabilitySlot,
  SkillAppointmentPayload,
  SkillSlotHoldPayload,
} from "@operaclinic/shared";
import { AgentRuntimeSession } from "../agent-runtime.service";
import { IntentRouterService } from "../services/intent-router.service";
import { GuardrailvService } from "../services/guardrails.service";
import { EscalationPolicyService } from "../services/escalation-policy.service";
import type {
  AgentDecision,
  IntentClassification,
  AgentIntentType,
} from "../types/agent-runtime.types";

interface AgendamentoAgentExecutionResult {
  status: AgentExecutionStatus;
  patient: ReceptionPatientSummary | null;
  availability: ReceptionAvailabilitySlot[];
  hold: SkillSlotHoldPayload | null;
  appointment: SkillAppointmentPayload | null;
  handoff: MessagingHandoffPayload | null;
  thread: MessagingThreadDetailPayload | null;
  replyText: string | null;
}

/**
 * AgendamentoAgentService v1
 *
 * Responsável pela condução completa do agendamento:
 * Do pedido inicial até a criação confirmada do appointment.
 *
 * Capacidades:
 * - Validar dados mínimos para agendamento
 * - Consultar disponibilidade real
 * - Oferecer horários reais ao paciente
 * - Reservar slot quando paciente confirma
 * - Criar appointment confirmado
 * - Escalar quando não conseguir completar
 *
 * Limites implementados:
 * - Só usa skills permitidas (10 no whitelist)
 * - Usa scheduling core para todas operações
 * - Respeita regras de agenda (não burla conflitos)
 * - Valida tenant em todas operações
 * - Escala em: sem disponibilidade, erro, pedido de exceção
 */
@Injectable()
export class AgendamentoAgentService {
  private readonly logger = new Logger(AgendamentoAgentService.name);

  constructor(
    private intentRouter: IntentRouterService,
    private guardrails: GuardrailvService,
    private escalationPolicy: EscalationPolicyService,
  ) {}

  async execute(
    session: AgentRuntimeSession,
    input: AgendamentoAgentRequestPayload,
  ): Promise<AgendamentoAgentExecutionResult> {
    const startTime = Date.now();

    this.logger.debug(
      `AgendamentoAgent v1: Processing booking request for tenant ${session.conversationContext.tenantId}`,
    );

    try {
      // 1. VALIDAR CONTEXTO
      const contextValidation = this.guardrails.validateContext(
        session.conversationContext,
      );

      if (!contextValidation.passed) {
        this.logger.warn(
          `AgendamentoAgent: Context validation failed: ${contextValidation.blockingIssues.join(", ")}`,
        );

        const replyText =
          "Desculpe, não consegui processar sua solicitação de agendamento. Tente novamente.";
        const thread = await session.executeSkill("send_message", {
          threadId: input.threadId,
          text: replyText,
        });

        return {
          status: "FAILED" as const,
          patient: null,
          availability: [],
          hold: null,
          appointment: null,
          handoff: null,
          thread,
          replyText,
        };
      }

      // 2. CLASSIFICAR INTENÇÃO (Se houver texto)
      let currentIntent: AgentIntentType = "BOOK_APPOINTMENT";
      let selectionIndex: number | null = null;

      if (input.messageText) {
        const intentClassification = this.intentRouter.classify(input.messageText);
        currentIntent = intentClassification.intent;
        session.intentHistory.push(currentIntent);
        
        // Detecção de Urgência
        const urgency = this.escalationPolicy.detectUrgency(input.messageText);
        if (urgency === "HIGH") {
            this.logger.debug("AgendamentoAgent: High urgency detected in message text.");
        }

        if (currentIntent === "SELECT_OPTION") {
          // A. Tentar extrair número direto (1, 2, 3...)
          const numMatch = input.messageText.match(/\b([1-9]|10)\b/);
          if (numMatch) {
            selectionIndex = parseInt(numMatch[1], 10) - 1;
          } else {
            // B. Tentar extrair ordinais por extenso
            const ordinals: Record<string, number> = {
              "primeiro": 0, "primeira": 0,
              "segundo": 1, "segunda": 1,
              "terceiro": 2, "terceira": 2,
              "quarto": 3, "quarta": 3,
            };
            for (const [word, idx] of Object.entries(ordinals)) {
              if (input.messageText.toLowerCase().includes(word)) {
                selectionIndex = idx;
                break;
              }
            }
          }
        }
      } else {
        session.intentHistory.push("BOOK_APPOINTMENT");
      }

      this.logger.debug(
        `AgendamentoAgent: Current Intent = ${currentIntent}${selectionIndex !== null ? ` (Selection: ${selectionIndex + 1})` : ""}`,
      );

      // 2.5 TRATAR SELEÇÃO DE SLOT (Booking v2)
      if (currentIntent === "SELECT_OPTION" && selectionIndex !== null) {
        const slots = session.conversationContext.historicalContext?.offeredSlots || [];
        const selectedSlot = slots[selectionIndex];

        if (selectedSlot && input.patientId) {
          this.logger.debug(`AgendamentoAgent: User selected slot ${selectionIndex + 1}. Proceeding with hold and create.`);
          
          try {
            // A. Reservar Slot (Hold)
            const hold = await session.executeSkill("hold_slot", {
              patientId: input.patientId,
              professionalId: input.professionalId || selectedSlot.professionalId,
              consultationTypeId: input.consultationTypeId || selectedSlot.consultationTypeId,
              startsAt: selectedSlot.startsAt,
              unitId: input.unitId || selectedSlot.unitId,
            });

            // B. Criar Agendamento
            const appointment = await session.executeSkill("create_appointment", {
              patientId: input.patientId,
              professionalId: input.professionalId || selectedSlot.professionalId,
              consultationTypeId: input.consultationTypeId || selectedSlot.consultationTypeId,
              startsAt: selectedSlot.startsAt,
              unitId: input.unitId || selectedSlot.unitId,
              slotHoldId: hold.id,
              idempotencyKey: `agent-booking-${session.conversationContext.threadId}-${selectedSlot.startsAt}`,
            });

            // C. Enviar Confirmação
            const replyText = `Perfeito! Seu agendamento foi confirmado para o dia ${new Date(selectedSlot.startsAt).toLocaleString("pt-BR")}. Esperamos por você!`;
            const thread = await session.executeSkill("send_message", {
              threadId: input.threadId,
              text: replyText,
            });

            return {
              status: "COMPLETED" as const,
              patient: null,
              availability: [],
              hold,
              appointment,
              handoff: null,
              thread,
              replyText,
            };
          } catch (error) {
            this.logger.warn(`AgendamentoAgent: Failed to complete selection: ${error instanceof Error ? error.message : String(error)}`);
            // Escalar se falhar a reserva/criação
            currentIntent = "HUMAN_REQUEST"; // Forçar escalação no próximo passo
          }
        }
      }

      // 3. VALIDAÇÃO DE DADOS MÍNIMOS
      if (!input.patientId) {
        const decision = this.decideRequestPatientData();
        const result = await this.executeDecision(
          session,
          decision,
          input.threadId,
        );

        return {
          status: this.mapDecisionToStatus(decision),
          patient: null,
          availability: [],
          hold: null,
          appointment: null,
          handoff: result.handoff,
          thread: result.thread,
          replyText: result.replyText,
        };
      }

      // 4. PACIENTE JÁ RESOLVIDO VIA INPUT
      const patient: ReceptionPatientSummary = {
        id: input.patientId,
        fullName: null,
        contacts: [],
        birthDate: null,
        documentNumber: null,
        notes: null,
        isActive: true,
      };
      this.logger.debug(
        `AgendamentoAgent: Using provided patientId: ${input.patientId}`,
      );

      if (!input.professionalId || !input.consultationTypeId) {
        const decision = this.decideRequestServiceInfo();
        const result = await this.executeDecision(
          session,
          decision,
          input.threadId,
        );

        return {
          status: this.mapDecisionToStatus(decision),
          patient,
          availability: [],
          hold: null,
          appointment: null,
          handoff: result.handoff,
          thread: result.thread,
          replyText: result.replyText,
        };
      }

      // 5. CONSULTAR DISPONIBILIDADE
      let availability: ReceptionAvailabilitySlot[] = [];

      try {
        const searchDate = input.preferredDate || new Date().toISOString().slice(0, 10);

        const searchResult = await session.executeSkill("search_availability", {
          professionalId: input.professionalId,
          consultationTypeId: input.consultationTypeId,
          date: searchDate,
          unitId: input.unitId,
        });

        availability = Array.isArray(searchResult) ? searchResult : [];

        this.logger.debug(
          `AgendamentoAgent: Found ${availability.length} available slots`,
        );
      } catch (error) {
        this.logger.warn(
          `AgendamentoAgent: Failed to search_availability: ${error instanceof Error ? error.message : String(error)}`,
        );

        // Sem horários encontrados → escalar
        const decision = this.decideEscalate(
          { intent: "BOOK_APPOINTMENT", confidence: 0.8, keywords: [], suggestedSkills: [], requiresEscalation: true, reason: "Calendar unavailable" },
          "Paciente solicitou agendamento mas não há disponibilidade",
          "Nenhuma disponibilidade encontrada para os critérios informados",
        );

        const result = await this.executeDecision(
          session,
          decision,
          input.threadId,
        );

        return {
          status: this.mapDecisionToStatus(decision),
          patient,
          availability: [],
          hold: null,
          appointment: null,
          handoff: result.handoff,
          thread: result.thread,
          replyText: result.replyText,
        };
      }

      // 6. DECIDIR AÇÃO
      let decision: AgentDecision;
      let offeredSlots: ReceptionAvailabilitySlot[];

      if (availability.length === 0) {
        decision = this.decideEscalate(
          { intent: "BOOK_APPOINTMENT", confidence: 0.8, keywords: [], suggestedSkills: [], requiresEscalation: true, reason: "No availability" },
          input.messageText || "Nenhum horário disponível",
          "Nenhum horário disponível",
        );
        offeredSlots = [];
      } else if (availability.length <= 3) {
        decision = this.decideOfferSlots(patient || { id: input.patientId, fullName: null, contacts: [], birthDate: null, documentNumber: null, notes: null, isActive: true }, availability);
        offeredSlots = availability;
      } else {
        const topSlots = availability.slice(0, 3);
        decision = this.decideOfferSlots(patient || { id: input.patientId, fullName: null, contacts: [], birthDate: null, documentNumber: null, notes: null, isActive: true }, topSlots);
        offeredSlots = topSlots;
      }

      // 7. EXECUTAR DECISÃO
      const executionResult = await this.executeDecision(
        session,
        decision,
        input.threadId,
        offeredSlots,
      );

      // 8. REGISTRAR NA SESSION
      session.decisions.push(decision);

      // 9. RETORNAR
      const status = this.mapDecisionToStatus(decision);
      const duration = Date.now() - startTime;

      this.logger.debug(
        `AgendamentoAgent: Completed in ${duration}ms with status ${status}`,
      );

      return {
        status,
        patient,
        availability: offeredSlots,
        hold: null,
        appointment: null,
        handoff: executionResult.handoff,
        thread: executionResult.thread,
        replyText: executionResult.replyText,
      };
    } catch (error) {
      this.logger.error(
        `AgendamentoAgent: Unhandled error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      try {
        const replyText =
          "Desculpe, encontramos um erro ao processar seu agendamento. Tente novamente ou fale com um atendente.";
        const thread = await session.executeSkill("send_message", {
          threadId: input.threadId,
          text: replyText,
        });

        return {
          status: "FAILED" as const,
          patient: null,
          availability: [],
          hold: null,
          appointment: null,
          handoff: null,
          thread,
          replyText,
        };
      } catch {
        return {
          status: "FAILED" as const,
          patient: null,
          availability: [],
          hold: null,
          appointment: null,
          handoff: null,
          thread: null,
          replyText: null,
        };
      }
    }
  }

  /**
   * Solicitar dados do paciente
   */
  private decideRequestPatientData(): AgentDecision {
    return {
      type: "SEND_MESSAGE",
      text: "Para agendar, preciso confirmar seus dados. Você é novo paciente?",
      reason: "Patient data missing - request confirmation",
    };
  }

  /**
   * Solicitar serviço/profissional
   */
  private decideRequestServiceInfo(): AgentDecision {
    return {
      type: "SEND_MESSAGE",
      text: "Qual profissional ou especialidade você busca?",
      reason: "Service information missing - request details",
    };
  }

  /**
   * Oferecer slots disponíveis
   */
  private decideOfferSlots(
    patient: ReceptionPatientSummary,
    slots: ReceptionAvailabilitySlot[],
  ): AgentDecision {
    const slotOptions = slots
      .map(
        (slot, idx) =>
          `${idx + 1}. ${new Date(slot.startsAt).toLocaleString("pt-BR")}`,
      )
      .join("\n");

    const text = `Ótimo ${patient.fullName || ""}! Encontrei disponibilidades:\n\n${slotOptions}\n\nQual desses horários funciona para você? Responda com o número.`;

    return {
      type: "SEND_MESSAGE",
      text,
      reason: "Slots available - offer to patient",
    };
  }

  /**
   * Decidir escalar para atendente
   */
  private decideEscalate(
    intent: IntentClassification,
    messageText: string,
    reason: string,
  ): AgentDecision {
    const urgency = this.escalationPolicy.detectUrgency(messageText);
    const policy = this.escalationPolicy.shouldEscalate(intent.intent, 0);
    const priority = urgency || policy.priority;

    return {
      type: "ESCALATE",
      reason,
      handoffData: {
        threadId: "",
        reason: `Escalação automática - Agendamento: ${reason}`,
        priority,
        note: `Mensagem: "${messageText.substring(0, 100)}${messageText.length > 100 ? "..." : ""}"`,
        metadata: {
          intent: "BOOKING_ESCALATE",
          priority,
          reason,
        },
      },
    };
  }

  /**
   * Executar decisão
   */
  private async executeDecision(
    session: AgentRuntimeSession,
    decision: AgentDecision,
    threadId: string,
    offeredSlots: ReceptionAvailabilitySlot[] = [],
  ): Promise<{
    replyText: string | null;
    handoff: MessagingHandoffPayload | null;
    thread: MessagingThreadDetailPayload | null;
  }> {
    try {
      if (decision.type === "SEND_MESSAGE") {
        const sendDecision = decision as Extract<AgentDecision, { type: "SEND_MESSAGE" }>;
        const thread = await session.executeSkill("send_message", {
          threadId,
          text: sendDecision.text,
          metadata: offeredSlots.length > 0 ? { offeredSlots } : undefined,
        });

        return {
          replyText: sendDecision.text,
          handoff: null,
          thread,
        };
      }

      if (decision.type === "ESCALATE") {
        const escalateDecision = decision as Extract<AgentDecision, { type: "ESCALATE" }>;
        const replyText =
          "Vou conectar você com um especialista em agendamentos que poderá ajudar melhor.";
        const thread = await session.executeSkill("send_message", {
          threadId,
          text: replyText,
        });

        const handoffData = { ...escalateDecision.handoffData, threadId };
        const handoff = await session.executeSkill("open_handoff", handoffData);

        return {
          replyText,
          handoff,
          thread,
        };
      }

      return {
        replyText: null,
        handoff: null,
        thread: null,
      };
    } catch (error) {
      this.logger.error(
        `AgendamentoAgent: Error executing decision: ${error instanceof Error ? error.message : String(error)}`,
      );

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
   * Map decision to execution status
   */
  private mapDecisionToStatus(decision: AgentDecision): AgentExecutionStatus {
    if (decision.type === "SEND_MESSAGE") {
      return "WAITING_FOR_INPUT";
    }
    if (decision.type === "ESCALATE") {
      return "HANDOFF_OPENED";
    }
    return "COMPLETED";
  }
}
