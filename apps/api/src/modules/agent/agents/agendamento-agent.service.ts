import { Injectable, Logger } from "@nestjs/common";
import type {
  AgentExecutionStatus,
  AgendamentoAgentRequestPayload,
  MessagingHandoffPayload,
  MessagingThreadDetailPayload,
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
  AgentIntentType,
  BookingContext,
  IntentClassification,
  TenantCatalog,
} from "../types/agent-runtime.types";

export interface AgendamentoAgentExecutionResult {
  status: AgentExecutionStatus;
  availability: ReceptionAvailabilitySlot[];
  hold: SkillSlotHoldPayload | null;
  appointment: SkillAppointmentPayload | null;
  handoff: MessagingHandoffPayload | null;
  thread: MessagingThreadDetailPayload | null;
  replyText: string | null;
  /** Updated booking context to be persisted for the next turn */
  bookingCtx: BookingContext | null;
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Extract a 1-based numeric selection from message text */
function extractSelectionIndex(text: string): number | null {
  const num = text.match(/\b([1-9]|10)\b/);
  if (num) return Number.parseInt(num[1], 10) - 1;

  const ordinals: Record<string, number> = {
    primeiro: 0, primeira: 0,
    segundo: 1, segunda: 1,
    terceiro: 2, terceira: 2,
    quarto: 3, quarta: 3,
    quinto: 4, quinta: 4,
  };
  for (const [word, idx] of Object.entries(ordinals)) {
    if (text.toLowerCase().includes(word)) return idx;
  }
  return null;
}

/** Parse Portuguese date hints → YYYY-MM-DD (best effort, fallback to today) */
function parsePreferredDate(text: string): string {
  const today = new Date();

  // explicit dd/mm or dd/mm/yyyy
  const dmy = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    const year = dmy[3] ?? String(today.getFullYear());
    return `${year}-${month}-${day}`;
  }

  const lower = text.toLowerCase();
  if (lower.includes("amanhã") || lower.includes("amanha")) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  const weekdays: Record<string, number> = {
    segunda: 1, "segunda-feira": 1,
    terça: 2, "terça-feira": 2, terca: 2,
    quarta: 3, "quarta-feira": 3,
    quinta: 4, "quinta-feira": 4,
    sexta: 5, "sexta-feira": 5,
    sábado: 6, sabado: 6,
    domingo: 0,
  };
  for (const [name, dow] of Object.entries(weekdays)) {
    if (lower.includes(name)) {
      const current = today.getDay();
      let diff = dow - current;
      if (diff <= 0) diff += 7;
      const d = new Date(today);
      d.setDate(d.getDate() + diff);
      return d.toISOString().slice(0, 10);
    }
  }

  // fallback: today
  return today.toISOString().slice(0, 10);
}

function formatDatePt(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function formatDatetimePt(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── main service ──────────────────────────────────────────────────────────────

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
    this.logger.debug(
      `AgendamentoAgent: tenant=${session.conversationContext.tenantId}`,
    );

    try {
      // ── 1. Validate context ────────────────────────────────────────────────
      const ctxCheck = this.guardrails.validateContext(session.conversationContext);
      if (!ctxCheck.passed) {
        return this.failWith(session, input.threadId, null,
          "Desculpe, não consegui processar sua solicitação. Tente novamente.",
        );
      }

      // ── 2. Load persisted booking state ───────────────────────────────────
      const ctx = session.conversationContext;
      const hist = ctx.historicalContext;
      const catalog: TenantCatalog = hist?.tenantCatalog ?? { professionals: [], consultationTypes: [] };

      // Merge incoming input with whatever was gathered in previous turns
      let bookingCtx: BookingContext = {
        ...(hist?.bookingCtx ?? {}),
        professionalId: input.professionalId || hist?.bookingCtx?.professionalId,
        consultationTypeId: input.consultationTypeId || hist?.bookingCtx?.consultationTypeId,
        preferredDate: input.preferredDate || hist?.bookingCtx?.preferredDate,
      };

      const offeredSlots: ReceptionAvailabilitySlot[] = (hist?.offeredSlots as ReceptionAvailabilitySlot[]) ?? [];

      // ── 3. Classify intent ─────────────────────────────────────────────────
      let intent: AgentIntentType = "BOOK_APPOINTMENT";
      let selectionIndex: number | null = null;

      if (input.messageText?.trim()) {
        const classification = this.intentRouter.classify(input.messageText);
        intent = classification.intent;
        session.intentHistory.push(intent);

        if (intent === "SELECT_OPTION") {
          selectionIndex = extractSelectionIndex(input.messageText);
        }

        // Urgency check
        const urgency = this.escalationPolicy.detectUrgency(input.messageText);
        if (urgency === "HIGH") {
          this.logger.debug("AgendamentoAgent: high urgency — escalating");
          return this.escalate(session, input.threadId, null,
            "HIGH",
            input.messageText,
            "Urgência detectada na mensagem do paciente",
          );
        }
      }

      this.logger.debug(`AgendamentoAgent: intent=${intent} selectionIndex=${selectionIndex}`);

      // ── 4. Handle human escalation request ───────────────────────────────
      if (intent === "HUMAN_REQUEST" || intent === "OUT_OF_SCOPE") {
        return this.escalate(session, input.threadId, bookingCtx,
          "MEDIUM",
          input.messageText ?? "",
          "Paciente solicitou atendimento humano",
        );
      }

      // ── 5. Resolve SELECT_OPTION to a booking step ───────────────────────
      if (intent === "SELECT_OPTION" && selectionIndex !== null) {
        // 5a. Selecting from offered availability slots → complete booking
        if (offeredSlots.length > 0) {
          const slot = offeredSlots[selectionIndex];
          if (slot && input.patientId) {
            return this.completeBooking(session, input, slot, bookingCtx);
          }
        }

        // 5b. Selecting a professional from the step list
        if (bookingCtx.stepOfferedProfessionals?.length) {
          const chosen = bookingCtx.stepOfferedProfessionals[selectionIndex];
          if (chosen) {
            bookingCtx = {
              ...bookingCtx,
              professionalId: chosen.id,
              professionalName: chosen.displayName,
              stepOfferedProfessionals: undefined,
            };
            this.logger.debug(`AgendamentoAgent: professional selected → ${chosen.displayName}`);
          }
        }

        // 5c. Selecting a consultation type from the step list
        if (bookingCtx.stepOfferedTypes?.length) {
          const chosen = bookingCtx.stepOfferedTypes[selectionIndex];
          if (chosen) {
            bookingCtx = {
              ...bookingCtx,
              consultationTypeId: chosen.id,
              consultationTypeName: chosen.name,
              stepOfferedTypes: undefined,
            };
            this.logger.debug(`AgendamentoAgent: consultationType selected → ${chosen.name}`);
          }
        }
      }

      // ── 6. Need patientId ─────────────────────────────────────────────────
      const patientId = input.patientId ?? ctx.patientId ?? null;
      if (!patientId) {
        return this.waitingFor(session, input.threadId, bookingCtx,
          "Para agendar, preciso confirmar seus dados. Você é novo paciente? Me diga seu nome completo e telefone.",
        );
      }

      // ── 7. Need professional ──────────────────────────────────────────────
      if (!bookingCtx.professionalId) {
        const professionals = catalog.professionals.filter((p) => p.id);

        if (professionals.length === 0) {
          return this.escalate(session, input.threadId, bookingCtx,
            "MEDIUM",
            input.messageText ?? "",
            "Nenhum profissional ativo encontrado",
          );
        }

        if (professionals.length === 1) {
          // Auto-select single professional
          bookingCtx = {
            ...bookingCtx,
            professionalId: professionals[0].id,
            professionalName: professionals[0].displayName,
          };
        } else {
          const list = professionals
            .slice(0, 5)
            .map((p, i) => `${i + 1}. ${p.displayName}`)
            .join("\n");

          const text = `Com qual profissional você gostaria de agendar?\n\n${list}\n\nResponda com o número da opção.`;

          bookingCtx = { ...bookingCtx, stepOfferedProfessionals: professionals.slice(0, 5) };
          return this.waitingFor(session, input.threadId, bookingCtx, text);
        }
      }

      // ── 8. Need consultation type ─────────────────────────────────────────
      if (!bookingCtx.consultationTypeId) {
        const types = catalog.consultationTypes.filter((t) => t.id);

        if (types.length === 0) {
          return this.escalate(session, input.threadId, bookingCtx,
            "MEDIUM",
            input.messageText ?? "",
            "Nenhum tipo de consulta ativo encontrado",
          );
        }

        if (types.length === 1) {
          bookingCtx = {
            ...bookingCtx,
            consultationTypeId: types[0].id,
            consultationTypeName: types[0].name,
          };
        } else {
          const list = types
            .slice(0, 5)
            .map((t, i) => `${i + 1}. ${t.name} (${t.durationMinutes} min)`)
            .join("\n");

          const text = `Qual serviço ou procedimento você busca?\n\n${list}\n\nResponda com o número da opção.`;

          bookingCtx = { ...bookingCtx, stepOfferedTypes: types.slice(0, 5) };
          return this.waitingFor(session, input.threadId, bookingCtx, text);
        }
      }

      // ── 9. Need preferred date ────────────────────────────────────────────
      if (!bookingCtx.preferredDate) {
        // Try to extract date from current message
        const parsedDate =
          input.messageText?.trim()
            ? parsePreferredDate(input.messageText)
            : null;

        if (parsedDate) {
          bookingCtx = { ...bookingCtx, preferredDate: parsedDate };
        } else {
          const text = `Para ${bookingCtx.consultationTypeName ?? "o serviço"} com ${bookingCtx.professionalName ?? "o profissional"}, qual data você prefere? Pode dizer "amanhã", o dia da semana ou uma data no formato DD/MM.`;
          return this.waitingFor(session, input.threadId, bookingCtx, text);
        }
      }

      // ── 10. Search availability ───────────────────────────────────────────
      let slots: ReceptionAvailabilitySlot[] = [];
      try {
        const result = await session.executeSkill("search_availability", {
          professionalId: bookingCtx.professionalId!,
          consultationTypeId: bookingCtx.consultationTypeId!,
          date: bookingCtx.preferredDate!,
          unitId: input.unitId,
        });
        slots = Array.isArray(result) ? result : [];
      } catch (err) {
        this.logger.warn(`AgendamentoAgent: search_availability error: ${String(err)}`);
      }

      if (slots.length === 0) {
        // Try next 2 days automatically
        const altSlots = await this.searchNearbyDates(
          session,
          bookingCtx,
          input.unitId,
        );

        if (altSlots.length === 0) {
          const text = `Não encontrei horários disponíveis para ${formatDatePt(bookingCtx.preferredDate!)} com ${bookingCtx.professionalName ?? "o profissional selecionado"}. Gostaria de tentar outra data? Me diga quando prefere.`;

          // Clear the date so the next turn asks again
          bookingCtx = { ...bookingCtx, preferredDate: undefined };
          return this.waitingFor(session, input.threadId, bookingCtx, text);
        }

        slots = altSlots;
      }

      // ── 11. Offer up to 3 slots ───────────────────────────────────────────
      const offered = slots.slice(0, 3);
      const slotList = offered
        .map((s, i) => `${i + 1}. ${formatDatetimePt(s.startsAt)}`)
        .join("\n");

      const offerText = `Ótimo! Encontrei os seguintes horários disponíveis:\n\n${slotList}\n\nQual desses horários você prefere? Responda com o número.`;

      const thread = await session.executeSkill("send_message", {
        threadId: input.threadId,
        text: offerText,
        metadata: { offeredSlots: offered, source: "AGENT" },
      });

      return {
        status: "WAITING_FOR_INPUT",
        availability: offered,
        hold: null,
        appointment: null,
        handoff: null,
        thread,
        replyText: offerText,
        bookingCtx,
      };
    } catch (error) {
      this.logger.error(
        `AgendamentoAgent: unhandled error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return this.failWith(session, input.threadId, null,
        "Desculpe, encontramos um erro ao processar seu agendamento. Tente novamente ou fale com um atendente.",
      );
    }
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private async completeBooking(
    session: AgentRuntimeSession,
    input: AgendamentoAgentRequestPayload,
    slot: ReceptionAvailabilitySlot,
    bookingCtx: BookingContext,
  ): Promise<AgendamentoAgentExecutionResult> {
    const patientId = input.patientId ?? session.conversationContext.patientId ?? "";

    try {
      const consultationTypeId = bookingCtx.consultationTypeId ?? "";

      const hold = await session.executeSkill("hold_slot", {
        patientId,
        professionalId: slot.professionalId,
        consultationTypeId,
        startsAt: slot.startsAt,
        unitId: slot.unitId ?? input.unitId,
      });

      const appointment = await session.executeSkill("create_appointment", {
        patientId,
        professionalId: slot.professionalId,
        consultationTypeId,
        startsAt: slot.startsAt,
        unitId: slot.unitId ?? input.unitId,
        slotHoldId: hold.id,
        idempotencyKey: `agent-booking-${session.conversationContext.threadId}-${slot.startsAt}`,
      });

      const replyText = `Agendamento confirmado! ✅\n\n📅 ${formatDatetimePt(slot.startsAt)}\n👤 ${bookingCtx.professionalName ?? ""}\n💆 ${bookingCtx.consultationTypeName ?? ""}\n\nTe esperamos! Caso precise cancelar ou remarcar, entre em contato conosco.`;

      const thread = await session.executeSkill("send_message", {
        threadId: input.threadId,
        text: replyText,
      });

      return {
        status: "COMPLETED",
        availability: [],
        hold,
        appointment,
        handoff: null,
        thread,
        replyText,
        bookingCtx: null, // clear on completion
      };
    } catch (error) {
      this.logger.warn(
        `AgendamentoAgent: booking failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.escalate(
        session,
        input.threadId,
        bookingCtx,
        "MEDIUM",
        "Falha ao criar agendamento",
        "Erro ao reservar o horário selecionado",
      );
    }
  }

  private async searchNearbyDates(
    session: AgentRuntimeSession,
    bookingCtx: BookingContext,
    unitId?: string,
  ): Promise<ReceptionAvailabilitySlot[]> {
    const base = new Date(bookingCtx.preferredDate!);

    for (let offset = 1; offset <= 2; offset++) {
      const d = new Date(base);
      d.setDate(d.getDate() + offset);
      const dateStr = d.toISOString().slice(0, 10);

      try {
        const result = await session.executeSkill("search_availability", {
          professionalId: bookingCtx.professionalId!,
          consultationTypeId: bookingCtx.consultationTypeId!,
          date: dateStr,
          unitId,
        });
        const slots = Array.isArray(result) ? (result as ReceptionAvailabilitySlot[]) : [];
        if (slots.length > 0) return slots;
      } catch {
        // continue
      }
    }

    return [];
  }

  private async waitingFor(
    session: AgentRuntimeSession,
    threadId: string,
    bookingCtx: BookingContext,
    text: string,
  ): Promise<AgendamentoAgentExecutionResult> {
    // Store bookingCtx in message metadata so it survives to the next turn
    const thread = await session.executeSkill("send_message", {
      threadId,
      text,
      metadata: { source: "AGENT", bookingCtx },
    }).catch(() => null);

    return {
      status: "WAITING_FOR_INPUT",
      availability: [],
      hold: null,
      appointment: null,
      handoff: null,
      thread,
      replyText: text,
      bookingCtx,
    };
  }

  private async escalate(
    session: AgentRuntimeSession,
    threadId: string,
    bookingCtx: BookingContext | null,
    priority: "LOW" | "MEDIUM" | "HIGH",
    messageText: string,
    reason: string,
  ): Promise<AgendamentoAgentExecutionResult> {
    const replyText =
      "Vou conectar você com um de nossos especialistas que poderá ajudar melhor. Aguarde um momento!";

    let thread: MessagingThreadDetailPayload | null = null;
    let handoff: MessagingHandoffPayload | null = null;

    try {
      thread = await session.executeSkill("send_message", { threadId, text: replyText });
      handoff = await session.executeSkill("open_handoff", {
        threadId,
        reason: `Agendamento: ${reason}`,
        priority,
        note: `Mensagem: "${messageText.substring(0, 100)}"`,
      });
    } catch (err) {
      this.logger.warn(`AgendamentoAgent: escalation skill failed: ${String(err)}`);
    }

    return {
      status: "HANDOFF_OPENED",
      availability: [],
      hold: null,
      appointment: null,
      handoff,
      thread,
      replyText,
      bookingCtx,
    };
  }

  private async failWith(
    session: AgentRuntimeSession,
    threadId: string,
    bookingCtx: BookingContext | null,
    text: string,
  ): Promise<AgendamentoAgentExecutionResult> {
    let thread: MessagingThreadDetailPayload | null = null;
    try {
      thread = await session.executeSkill("send_message", { threadId, text });
    } catch {
      // swallow
    }
    return {
      status: "FAILED",
      availability: [],
      hold: null,
      appointment: null,
      handoff: null,
      thread,
      replyText: text,
      bookingCtx,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        reason: `Escalação automática: ${reason}`,
        priority,
        note: `"${messageText.substring(0, 100)}"`,
      },
    };
  }
}
