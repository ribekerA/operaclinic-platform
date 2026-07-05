import Anthropic from "@anthropic-ai/sdk";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import type { ClinicSkillContext } from "@operaclinic/shared";
import { PrismaService } from "../../database/prisma.service";
import { AgentApiService } from "../agent-api/agent-api.service";
import { SkillExecutorService } from "./services/skill-executor.service";

const MAX_TOOL_ITERATIONS = 10;
const HISTORY_LIMIT = 20;

type LlmStatus = "COMPLETED" | "WAITING_FOR_INPUT" | "FAILED";

export interface AnthropicAgentResult {
  replyText: string | null;
  status: LlmStatus;
}

@Injectable()
export class AnthropicSchedulingAgentService {
  private readonly logger = new Logger(AnthropicSchedulingAgentService.name);
  // Null when ANTHROPIC_API_KEY is not configured. The Anthropic SDK constructor
  // throws for an empty apiKey, so we skip instantiation and return FAILED from
  // handle() instead — this lets the app start on Render even without the key.
  private readonly anthropic: Anthropic | null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly agentApi: AgentApiService,
    private readonly skillExecutor: SkillExecutorService,
  ) {
    const apiKey = this.config.get<string>("ANTHROPIC_API_KEY", "");
    this.anthropic = apiKey ? new Anthropic({ apiKey }) : null;
  }

  async handle(input: {
    tenantId: string;
    threadId: string;
    patientId: string | null;
    patientPhone: string;
    patientName: string | null;
    messageText: string;
    correlationId: string;
  }): Promise<AnthropicAgentResult> {
    const apiKey = this.config.get<string>("ANTHROPIC_API_KEY", "");

    if (!apiKey) {
      this.logger.warn("AnthropicAgent: ANTHROPIC_API_KEY not configured");
      return { replyText: null, status: "FAILED" };
    }

    try {
      const [history, professionals, consultationTypes, clinic] = await Promise.all([
        this.loadHistory(input.threadId),
        this.prisma.professional.findMany({
          where: { tenantId: input.tenantId, isActive: true },
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        }),
        this.prisma.consultationType.findMany({
          where: { tenantId: input.tenantId, isActive: true },
          select: { id: true, name: true, durationMinutes: true },
          orderBy: { name: "asc" },
        }),
        this.prisma.clinic.findUnique({
          where: { tenantId: input.tenantId },
          select: { displayName: true },
        }),
      ]);

      const systemPrompt = this.buildSystemPrompt({
        clinicName: clinic?.displayName ?? "Clínica",
        patientPhone: input.patientPhone,
        patientName: input.patientName,
        professionals,
        consultationTypes,
      });

      const ctx: ClinicSkillContext = {
        tenantId: input.tenantId,
        actorUserId: `system:llm-agent:${input.tenantId}`,
        source: "AGENT",
        threadId: input.threadId,
        correlationId: input.correlationId,
      };

      const { replyText, status } = await this.runLoop({
        tenantId: input.tenantId,
        patientPhone: input.patientPhone,
        patientName: input.patientName,
        threadId: input.threadId,
        messages: history,
        systemPrompt,
      });

      if (replyText) {
        const sendResult = await this.skillExecutor.execute({
          skillName: "send_message",
          payload: {
            threadId: input.threadId,
            text: replyText,
            metadata: { source: "AGENT", llm: true, correlationId: input.correlationId },
          },
          context: ctx,
        });

        if (!sendResult.success) {
          this.logger.warn(
            `AnthropicAgent: send_message failed for thread=${input.threadId}: ${sendResult.error}`,
          );
        } else {
          this.logger.log(
            `AnthropicAgent: reply sent for thread=${input.threadId} status=${status}`,
          );
        }
      }

      return { replyText, status };
    } catch (error) {
      this.logger.warn(
        `AnthropicAgent: failed for thread=${input.threadId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { replyText: null, status: "FAILED" };
    }
  }

  private async runLoop(params: {
    tenantId: string;
    patientPhone: string;
    patientName: string | null;
    threadId: string;
    messages: Anthropic.MessageParam[];
    systemPrompt: string;
  }): Promise<AnthropicAgentResult> {
    if (!this.anthropic) {
      return { replyText: null, status: "FAILED" };
    }

    const { tenantId, patientPhone, patientName, threadId, systemPrompt } = params;
    const messages = [...params.messages];
    let iterations = 0;

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      const response = await this.anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        tools: this.buildTools(),
      });

      this.logger.debug(
        `AnthropicAgent: iter=${iterations} stop=${response.stop_reason} blocks=${response.content.length} thread=${threadId}`,
      );

      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
        const text = textBlocks.map((b) => b.text).join("").trim() || null;
        return { replyText: text, status: text ? "COMPLETED" : "WAITING_FOR_INPUT" };
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        const result = await this.executeTool(
          block.name,
          block.input as Record<string, unknown>,
          { tenantId, patientPhone, patientName, threadId },
        );

        this.logger.log(
          `AnthropicAgent: tool=${block.name} ok=${result.success} thread=${threadId}`,
        );

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.success
            ? JSON.stringify(result.data, null, 0)
            : `Erro: ${result.error}`,
          is_error: !result.success,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    this.logger.warn(
      `AnthropicAgent: max iterations (${MAX_TOOL_ITERATIONS}) reached for thread=${threadId}`,
    );

    return {
      replyText:
        "Desculpe, não consegui processar sua solicitação neste momento. Um atendente entrará em contato em breve.",
      status: "FAILED",
    };
  }

  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    ctx: { tenantId: string; patientPhone: string; patientName: string | null; threadId: string },
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      switch (name) {
        case "search_availability": {
          const data = await this.agentApi.getAvailability(ctx.tenantId, {
            service_id: String(input.service_id ?? ""),
            date_from: String(input.date_from ?? ""),
            date_to: String(input.date_to ?? input.date_from ?? ""),
            professional_id: input.professional_id
              ? String(input.professional_id)
              : undefined,
          });
          return { success: true, data };
        }

        case "create_appointment": {
          const data = await this.agentApi.createAppointment(ctx.tenantId, {
            professional_id: String(input.professional_id ?? ""),
            service_id: String(input.service_id ?? ""),
            starts_at: String(input.starts_at ?? ""),
            patient_name: ctx.patientName ?? "Paciente",
            patient_phone: ctx.patientPhone,
            unit_id: input.unit_id ? String(input.unit_id) : undefined,
            notes: input.notes ? String(input.notes) : undefined,
          });
          return { success: true, data };
        }

        case "lookup_appointments": {
          const data = await this.agentApi.lookupAppointments(
            ctx.tenantId,
            ctx.patientPhone,
          );
          return { success: true, data };
        }

        case "reschedule_appointment": {
          const data = await this.agentApi.rescheduleAppointment(
            ctx.tenantId,
            String(input.appointment_id ?? ""),
            {
              starts_at: String(input.starts_at ?? ""),
              reason: input.reason ? String(input.reason) : undefined,
            },
          );
          return { success: true, data };
        }

        case "cancel_appointment": {
          const data = await this.agentApi.cancelAppointment(
            ctx.tenantId,
            String(input.appointment_id ?? ""),
            { reason: input.reason ? String(input.reason) : undefined },
          );
          return { success: true, data };
        }

        default:
          return { success: false, error: `Ferramenta desconhecida: ${name}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildTools(): Anthropic.Tool[] {
    return [
      {
        name: "search_availability",
        description:
          "Busca horários disponíveis para agendamento. Retorna lista de slots com profissional, serviço e data/hora. Use date_from e date_to com no máximo 7 dias de diferença.",
        input_schema: {
          type: "object" as const,
          properties: {
            service_id: {
              type: "string",
              description: "UUID do serviço/consulta (obrigatório)",
            },
            date_from: {
              type: "string",
              description: "Data inicial no formato YYYY-MM-DD",
            },
            date_to: {
              type: "string",
              description: "Data final no formato YYYY-MM-DD",
            },
            professional_id: {
              type: "string",
              description: "UUID do profissional (opcional — omita para buscar em todos)",
            },
          },
          required: ["service_id", "date_from", "date_to"],
        },
      },
      {
        name: "create_appointment",
        description:
          "Cria um agendamento para o paciente. Use apenas após o paciente confirmar explicitamente o horário desejado.",
        input_schema: {
          type: "object" as const,
          properties: {
            professional_id: {
              type: "string",
              description: "UUID do profissional",
            },
            service_id: {
              type: "string",
              description: "UUID do serviço",
            },
            starts_at: {
              type: "string",
              description: "Data/hora de início em ISO 8601 com fuso (ex: 2026-07-10T14:00:00-03:00)",
            },
            notes: {
              type: "string",
              description: "Observações opcionais do paciente",
            },
          },
          required: ["professional_id", "service_id", "starts_at"],
        },
      },
      {
        name: "lookup_appointments",
        description:
          "Consulta os agendamentos futuros ativos do paciente atual (baseado no telefone).",
        input_schema: {
          type: "object" as const,
          properties: {},
          required: [],
        },
      },
      {
        name: "reschedule_appointment",
        description: "Remarca um agendamento existente para um novo horário.",
        input_schema: {
          type: "object" as const,
          properties: {
            appointment_id: {
              type: "string",
              description: "UUID do agendamento a remarcar",
            },
            starts_at: {
              type: "string",
              description: "Novo horário em ISO 8601",
            },
            reason: {
              type: "string",
              description: "Motivo da remarcação (opcional)",
            },
          },
          required: ["appointment_id", "starts_at"],
        },
      },
      {
        name: "cancel_appointment",
        description: "Cancela um agendamento existente do paciente.",
        input_schema: {
          type: "object" as const,
          properties: {
            appointment_id: {
              type: "string",
              description: "UUID do agendamento a cancelar",
            },
            reason: {
              type: "string",
              description: "Motivo do cancelamento (opcional)",
            },
          },
          required: ["appointment_id"],
        },
      },
    ];
  }

  private buildSystemPrompt(params: {
    clinicName: string;
    patientPhone: string;
    patientName: string | null;
    professionals: Array<{ id: string; displayName: string }>;
    consultationTypes: Array<{ id: string; name: string; durationMinutes: number }>;
  }): string {
    const today = new Date().toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/Sao_Paulo",
    });

    const profList = params.professionals.length
      ? params.professionals
          .map((p) => `  "${p.id}": ${p.displayName}`)
          .join("\n")
      : "  (nenhum profissional ativo no momento)";

    const serviceList = params.consultationTypes.length
      ? params.consultationTypes
          .map((t) => `  "${t.id}": ${t.name} (${t.durationMinutes} min)`)
          .join("\n")
      : "  (nenhum serviço ativo no momento)";

    const patientIdentifier = params.patientName
      ? `${params.patientPhone} (${params.patientName})`
      : params.patientPhone;

    return `Você é a assistente virtual de agendamento da ${params.clinicName}. Responda sempre em português brasileiro, com tom cordial e profissional.

Data de hoje: ${today}
Paciente atual: ${patientIdentifier}

Profissionais disponíveis (use os IDs exatos ao chamar as ferramentas):
${profList}

Serviços disponíveis (use os IDs exatos ao chamar as ferramentas):
${serviceList}

Regras obrigatórias:
1. Nunca forneça orientações médicas, diagnósticos ou prescrições.
2. Antes de criar ou cancelar um agendamento, peça confirmação explícita do paciente.
3. Ao criar um agendamento com sucesso, informe o código de confirmação retornado.
4. Para busca de disponibilidade, use no máximo 7 dias por consulta.
5. Se não houver horários disponíveis, sugira datas alternativas próximas.
6. Se o paciente pedir para falar com um atendente humano, informe que vai transferir e encerre sua resposta com: "Estou transferindo seu atendimento para um especialista. Aguarde um momento!"
7. Seja conciso — mensagens curtas funcionam melhor no WhatsApp.`;
  }

  private async loadHistory(threadId: string): Promise<Anthropic.MessageParam[]> {
    const events = await this.prisma.messageEvent.findMany({
      where: {
        threadId,
        eventType: { in: ["MESSAGE_RECEIVED", "MESSAGE_SENT"] },
        contentText: { not: null },
      },
      orderBy: { occurredAt: "desc" },
      take: HISTORY_LIMIT,
      select: { direction: true, contentText: true },
    });

    const chronological = events.reverse();
    const params: Anthropic.MessageParam[] = [];

    for (const event of chronological) {
      const text = event.contentText?.trim();
      if (!text) continue;

      const role: "user" | "assistant" =
        event.direction === "INBOUND" ? "user" : "assistant";

      const last = params[params.length - 1];
      if (last && last.role === role) {
        last.content = `${last.content as string}\n${text}`;
      } else {
        params.push({ role, content: text });
      }
    }

    return params;
  }
}
