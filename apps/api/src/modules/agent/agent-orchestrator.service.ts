import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../database/prisma.service";
import type {
  AgendamentoAgentRequestPayload,
  AgendamentoAgentResponsePayload,
  AgentExecutionMetaPayload,
  AgentKind,
  CaptacaoAgentRequestPayload,
  CaptacaoAgentResponsePayload,
  ClinicSkillContext,
} from "@operaclinic/shared";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { CaptacaoAgentService } from "./agents/captacao-agent.service";
import { AgendamentoAgentService } from "./agents/agendamento-agent.service";
import { AgentRuntimeService } from "./agent-runtime.service";
import type { AgentIntentType, ConversationContext } from "./types/agent-runtime.types";
import {
  AgentExecutionStatus as PrismaAgentExecutionStatus,
  AgentKind as PrismaAgentKind,
  MessageThreadResolutionActorType,
  MessageThreadStatus,
  Prisma,
} from "@prisma/client";

@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: AgentRuntimeService,
    private readonly captacaoAgent: CaptacaoAgentService,
    private readonly agendamentoAgent: AgendamentoAgentService,
  ) {}

  async executeCaptacao(
    actor: AuthenticatedUser,
    input: CaptacaoAgentRequestPayload & { correlationId?: string },
  ): Promise<CaptacaoAgentResponsePayload> {
    const baseContext = this.buildContext(actor, input.threadId, input.correlationId);
    const conversationContext = await this.buildConversationContextWithMemory(baseContext);
    const session = this.runtime.createSessionFromContext(conversationContext);

    this.logger.debug(
      `Executing CAPTACAO agent for tenant ${baseContext.tenantId} (correlation: ${baseContext.correlationId})`,
    );

    try {
      const result = await this.captacaoAgent.execute(session, input);
      const patientId = result.patient?.id ?? conversationContext.patientId ?? null;
      const response = {
        meta: this.buildMeta("CAPTACAO", baseContext, result.status, session.getSteps()),
        patient: result.patient,
        handoff: result.handoff,
        thread: result.thread,
        replyText: result.replyText,
      };

      const executionId = await this.recordExecutionSafely({
        agent: PrismaAgentKind.CAPTACAO,
        context: baseContext,
        session,
        status: result.status as PrismaAgentExecutionStatus,
        patientId,
        handoffRequestId: result.handoff?.id ?? null,
        appointmentId: null,
        threadStatus: result.thread?.status ?? null,
        replyText: result.replyText,
        errorMessage: null,
      });

      if (
        this.shouldRecordAutomatedResolution({
          status: result.status as PrismaAgentExecutionStatus,
          handoffRequestId: result.handoff?.id ?? null,
          threadStatus: result.thread?.status ?? null,
          replyText: result.replyText,
        })
      ) {
        await this.recordThreadResolutionSafely({
          context: baseContext,
          patientId,
          handoffRequestId: null,
          agentExecutionId: executionId,
          note: "Agent completed the conversation without human handoff.",
          metadata: {
            agent: PrismaAgentKind.CAPTACAO,
            replyTextSent: true,
            threadStatus: result.thread?.status ?? null,
          },
        });
      }

      return response;
    } catch (error) {
      await this.recordExecutionSafely({
        agent: PrismaAgentKind.CAPTACAO,
        context: baseContext,
        session,
        status: PrismaAgentExecutionStatus.FAILED,
        patientId: conversationContext.patientId ?? null,
        handoffRequestId: null,
        appointmentId: null,
        threadStatus: null,
        replyText: null,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  async executeAgendamento(
    actor: AuthenticatedUser,
    input: AgendamentoAgentRequestPayload & { correlationId?: string },
  ): Promise<AgendamentoAgentResponsePayload> {
    const baseContext = this.buildContext(actor, input.threadId, input.correlationId);
    const conversationContext = await this.buildConversationContextWithMemory(baseContext);
    const session = this.runtime.createSessionFromContext(conversationContext);

    this.logger.debug(
      `Executing AGENDAMENTO agent for tenant ${baseContext.tenantId} (correlation: ${baseContext.correlationId})`,
    );

    try {
      const result = await this.agendamentoAgent.execute(session, input);
      const patientId = result.appointment?.patient.id ?? input.patientId ?? null;
      const response = {
        meta: this.buildMeta("AGENDAMENTO", baseContext, result.status, session.getSteps()),
        availability: result.availability,
        hold: result.hold,
        appointment: result.appointment,
        handoff: result.handoff,
        thread: result.thread,
        replyText: result.replyText,
      };

      const executionId = await this.recordExecutionSafely({
        agent: PrismaAgentKind.AGENDAMENTO,
        context: baseContext,
        session,
        status: result.status as PrismaAgentExecutionStatus,
        patientId,
        handoffRequestId: result.handoff?.id ?? null,
        appointmentId: result.appointment?.id ?? null,
        threadStatus: result.thread?.status ?? null,
        replyText: result.replyText,
        errorMessage: null,
      });

      if (
        this.shouldRecordAutomatedResolution({
          status: result.status as PrismaAgentExecutionStatus,
          handoffRequestId: result.handoff?.id ?? null,
          threadStatus: result.thread?.status ?? null,
          replyText: result.replyText,
        })
      ) {
        await this.recordThreadResolutionSafely({
          context: baseContext,
          patientId,
          handoffRequestId: null,
          agentExecutionId: executionId,
          note: "Agent completed the scheduling flow without human handoff.",
          metadata: {
            agent: PrismaAgentKind.AGENDAMENTO,
            appointmentId: result.appointment?.id ?? null,
            replyTextSent: true,
            threadStatus: result.thread?.status ?? null,
          },
        });
      }

      return response;
    } catch (error) {
      await this.recordExecutionSafely({
        agent: PrismaAgentKind.AGENDAMENTO,
        context: baseContext,
        session,
        status: PrismaAgentExecutionStatus.FAILED,
        patientId: input.patientId ?? null,
        handoffRequestId: null,
        appointmentId: null,
        threadStatus: null,
        replyText: null,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  private buildContext(
    actor: AuthenticatedUser,
    threadId: string,
    correlationId?: string,
  ): ClinicSkillContext {
    if (actor.profile !== "clinic") {
      throw new ForbiddenException("Only clinic users can execute clinic agents.");
    }

    const tenantId = actor.activeTenantId?.trim();

    if (!tenantId) {
      throw new BadRequestException("Active clinic context is required.");
    }

    return {
      tenantId,
      actorUserId: actor.id,
      source: "AGENT",
      threadId: threadId.trim(),
      correlationId: correlationId?.trim() || randomUUID(),
    };
  }

  private async buildConversationContextWithMemory(
    base: ClinicSkillContext,
  ): Promise<ConversationContext> {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: base.threadId },
      include: { patient: true },
    });

    let lastIntents: AgentIntentType[] = [];

    if (thread) {
      if (thread.patient?.intentHistory && Array.isArray(thread.patient.intentHistory)) {
        lastIntents = thread.patient.intentHistory as AgentIntentType[];
      } else if (thread.lastIntent) {
        lastIntents = [thread.lastIntent as AgentIntentType];
      }
    }

    return {
      tenantId: base.tenantId,
      threadId: base.threadId ?? "",
      patientId: thread?.patientId ?? undefined,
      channel: "WHATSAPP", // Assuming WHATSAPP for now
      correlationId: base.correlationId || randomUUID(),
      actorUserId: base.actorUserId,
      actorRole: "AGENT",
      source: "AGENT",
      timestamp: new Date(),
      historicalContext: {
        lastIntents,
        // Fetch metadata of last agent message for slot memory
        offeredSlots: thread 
          ? await this.prisma.messageEvent.findFirst({
              where: {
                threadId: thread.id,
                direction: "OUTBOUND",
                eventType: "MESSAGE_SENT",
                metadata: { path: ["source"], equals: "AGENT" },
              },
              orderBy: { occurredAt: "desc" },
              select: { metadata: true }
            }).then(e => (e?.metadata as any)?.offeredSlots || [])
          : [],
      },
    };
  }

  private buildMeta(
    agent: AgentKind,
    context: ClinicSkillContext,
    status: PrismaAgentExecutionStatus,
    steps: AgentExecutionMetaPayload["steps"],
  ): AgentExecutionMetaPayload {
    return {
      agent,
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      threadId: context.threadId ?? null,
      correlationId: context.correlationId ?? randomUUID(),
      status,
      steps,
    };
  }

  private async recordExecutionSafely(input: {
    agent: PrismaAgentKind;
    context: ClinicSkillContext;
    session: ReturnType<AgentRuntimeService["createSessionFromContext"]>;
    status: PrismaAgentExecutionStatus;
    patientId: string | null;
    handoffRequestId: string | null;
    appointmentId: string | null;
    threadStatus: string | null;
    replyText: string | null;
    errorMessage: string | null;
  }): Promise<string | null> {
    try {
      const summary = input.session.getSummary();
      const finishedAt = new Date();

      const execution = await this.prisma.agentExecution.create({
        data: {
          tenantId: input.context.tenantId,
          threadId: input.context.threadId ?? "",
          patientId: input.patientId,
          handoffRequestId: input.handoffRequestId,
          appointmentId: input.appointmentId,
          correlationId: input.context.correlationId ?? randomUUID(),
          agent: input.agent,
          status: input.status,
          durationMs: summary.duration,
          skillCalls: summary.skillCalls,
          failedSkillCalls: input.session.skillCalls.filter(
            (call) => !call.success,
          ).length,
          startedAt: input.session.startedAt,
          finishedAt,
          errorMessage: input.errorMessage,
          metadata: {
            intents: summary.intents,
            steps: input.session.getSteps().map((step) => ({
              skillName: step.skillName,
              status: step.status,
              startedAt: step.startedAt,
              finishedAt: step.finishedAt,
              error: step.error,
            })) as Prisma.InputJsonValue,
            escalations: summary.escalations,
            isEscalated: summary.isEscalated,
            replyTextSent: Boolean(input.replyText),
            threadStatus: input.threadStatus,
          },
        },
      });

      return execution.id;
    } catch (error) {
      this.logger.warn(
        `Failed to persist agent execution for thread ${input.context.threadId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return null;
    }
  }

  private shouldRecordAutomatedResolution(input: {
    status: PrismaAgentExecutionStatus;
    handoffRequestId: string | null;
    threadStatus: string | null;
    replyText: string | null;
  }): boolean {
    return (
      input.status === PrismaAgentExecutionStatus.COMPLETED &&
      input.handoffRequestId === null &&
      input.threadStatus !== MessageThreadStatus.IN_HANDOFF &&
      Boolean(input.replyText?.trim())
    );
  }

  private async recordThreadResolutionSafely(input: {
    context: ClinicSkillContext;
    patientId: string | null;
    handoffRequestId: string | null;
    agentExecutionId: string | null;
    note: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    try {
      if (input.context.correlationId) {
        const existingResolution = await this.prisma.messageThreadResolution.findFirst({
          where: {
            tenantId: input.context.tenantId,
            correlationId: input.context.correlationId,
            actorType: MessageThreadResolutionActorType.AUTOMATION,
          },
          select: {
            id: true,
          },
        });

        if (existingResolution) {
          return;
        }
      }

      await this.prisma.messageThreadResolution.create({
        data: {
          tenantId: input.context.tenantId,
          threadId: input.context.threadId ?? "",
          patientId: input.patientId,
          handoffRequestId: input.handoffRequestId,
          messageEventId: null,
          agentExecutionId: input.agentExecutionId,
          resolvedByUserId: null,
          actorType: MessageThreadResolutionActorType.AUTOMATION,
          correlationId: input.context.correlationId ?? null,
          note: input.note,
          metadata: input.metadata as Prisma.InputJsonValue,
          occurredAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist automated thread resolution for thread ${input.context.threadId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
