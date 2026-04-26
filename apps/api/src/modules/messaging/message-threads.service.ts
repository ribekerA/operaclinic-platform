import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type {
  MessagingEventPayload,
  MessagingHandoffPayload,
  MessagingThreadDetailPayload,
  MessagingThreadSummaryPayload,
} from "@operaclinic/shared";
import {
  HandoffStatus,
  MessageEventDirection,
  MessageEventType,
  MessageThreadResolutionActorType,
  MessageThreadStatus,
  Prisma,
} from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { MessagingProviderFactory } from "./adapters/messaging-provider.factory";
import { LinkThreadPatientDto } from "./dto/link-thread-patient.dto";
import { ListMessageThreadsQueryDto } from "./dto/list-message-threads-query.dto";
import { ResolveThreadDto } from "./dto/resolve-thread.dto";
import { SendThreadMessageDto } from "./dto/send-thread-message.dto";
import { MessagingGateway } from "./gateways/messaging.gateway";
import { MessagingAccessService } from "./messaging-access.service";

const userReferenceSelect = {
  id: true,
  fullName: true,
  email: true,
} satisfies Prisma.UserSelect;

const threadSummaryInclude = {
  handoffRequests: {
    where: {
      status: {
        in: [HandoffStatus.OPEN, HandoffStatus.ASSIGNED],
      },
    },
    orderBy: {
      openedAt: "desc",
    },
    include: {
      openedByUser: {
        select: userReferenceSelect,
      },
      assignedToUser: {
        select: userReferenceSelect,
      },
      closedByUser: {
        select: userReferenceSelect,
      },
    },
  },
} satisfies Prisma.MessageThreadInclude;

const threadDetailInclude = {
  integrationConnection: true,
  patient: {
    select: {
      id: true,
      fullName: true,
      birthDate: true,
      documentNumber: true,
      notes: true,
      contacts: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          type: true,
          value: true,
          isPrimary: true,
        },
      },
    },
  },
  handoffRequests: {
    orderBy: {
      openedAt: "desc",
    },
    include: {
      openedByUser: {
        select: userReferenceSelect,
      },
      assignedToUser: {
        select: userReferenceSelect,
      },
      closedByUser: {
        select: userReferenceSelect,
      },
    },
  },
  messageEvents: {
    orderBy: {
      occurredAt: "asc",
    },
    include: {
      actorUser: {
        select: userReferenceSelect,
      },
    },
  },
} satisfies Prisma.MessageThreadInclude;

type ThreadSummaryRecord = Prisma.MessageThreadGetPayload<{
  include: typeof threadSummaryInclude;
}>;

type ThreadDetailRecord = Prisma.MessageThreadGetPayload<{
  include: typeof threadDetailInclude;
}>;

interface SendMessageOptions {
  source?: "HUMAN" | "AGENT" | "AUTOMATION";
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

interface DispatchMessageResult {
  thread: MessagingThreadDetailPayload;
  messageEventId: string;
}

@Injectable()
export class MessageThreadsService {
  private readonly logger = new Logger(MessageThreadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: MessagingAccessService,
    private readonly providerFactory: MessagingProviderFactory,
    private readonly auditService: AuditService,
    private readonly messagingGateway: MessagingGateway,
  ) {}

  async listThreads(
    actor: AuthenticatedUser,
    query: ListMessageThreadsQueryDto,
  ): Promise<MessagingThreadSummaryPayload[]> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const where: Prisma.MessageThreadWhereInput = {
      tenantId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.patientId) {
      where.patientId = query.patientId;
    }

    if (query.integrationConnectionId) {
      where.integrationConnectionId = query.integrationConnectionId;
    }

    if (query.search) {
      where.OR = [
        {
          patientDisplayName: {
            contains: query.search,
            mode: "insensitive",
          },
        },
        {
          contactDisplayValue: {
            contains: query.search,
            mode: "insensitive",
          },
        },
        {
          lastMessagePreview: {
            contains: query.search,
            mode: "insensitive",
          },
        },
      ];
    }

    const threads = await this.prisma.messageThread.findMany({
      where,
      include: threadSummaryInclude,
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    });

    return threads.map((thread) => this.mapThreadSummary(thread));
  }

  async getThreadById(
    actor: AuthenticatedUser,
    threadId: string,
  ): Promise<MessagingThreadDetailPayload> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const thread = await this.findThreadDetailOrThrow(tenantId, threadId);

    return this.mapThreadDetail(thread);
  }

  async linkThreadPatient(
    actor: AuthenticatedUser,
    threadId: string,
    input: LinkThreadPatientDto,
  ): Promise<MessagingThreadDetailPayload> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const thread = await this.findThreadDetailOrThrow(tenantId, threadId);
    const nextPatientId = input.patientId ?? null;

    if (thread.patientId === nextPatientId) {
      return this.mapThreadDetail(thread);
    }

    const patient = nextPatientId
      ? await this.prisma.patient.findFirst({
          where: {
            id: nextPatientId,
            tenantId,
            mergedIntoPatientId: null,
          },
          select: {
            id: true,
            fullName: true,
          },
        })
      : null;

    if (nextPatientId && !patient) {
      throw new NotFoundException("Patient not found for this clinic.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.messageThread.update({
        where: {
          id: thread.id,
        },
        data: {
          patientId: nextPatientId,
          patientDisplayName: patient?.fullName ?? thread.patientDisplayName,
        },
      });

      await tx.messageEvent.create({
        data: {
          tenantId,
          threadId: thread.id,
          patientId: nextPatientId,
          integrationConnectionId: thread.integrationConnectionId,
          actorUserId: actor.id,
          direction: MessageEventDirection.SYSTEM,
          eventType: MessageEventType.THREAD_PATIENT_LINKED,
          metadata: {
            previousPatientId: thread.patientId,
            patientId: nextPatientId,
          },
          occurredAt: new Date(),
        },
      });

      await this.auditService.record(
        {
          action: AUDIT_ACTIONS.MESSAGING_THREAD_PATIENT_LINKED,
          actor,
          tenantId,
          targetType: "message_thread",
          targetId: thread.id,
          metadata: {
            previousPatientId: thread.patientId,
            patientId: nextPatientId,
          },
        },
        tx,
      );
    });

    const updatedThread = await this.getThreadById(actor, threadId);

    this.messagingGateway.emitThreadActivity(tenantId, {
      threadId,
      direction: "SYSTEM",
      eventType: "THREAD_PATIENT_LINKED",
      occurredAt: new Date().toISOString(),
    });
    this.messagingGateway.emitThreadUpdated(tenantId, {
      threadId,
      status: updatedThread.status,
      lastMessagePreview: updatedThread.lastMessagePreview,
      lastMessageAt: updatedThread.lastMessageAt,
    });

    return updatedThread;
  }

  async resolveThread(
    actor: AuthenticatedUser,
    threadId: string,
    input: ResolveThreadDto,
  ): Promise<MessagingThreadDetailPayload> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const thread = await this.findThreadDetailOrThrow(tenantId, threadId);

    if (thread.status === MessageThreadStatus.CLOSED) {
      return this.mapThreadDetail(thread);
    }

    const activeHandoff = thread.handoffRequests.find(
      (handoff) =>
        handoff.status === HandoffStatus.OPEN ||
        handoff.status === HandoffStatus.ASSIGNED,
    );

    if (activeHandoff) {
      throw new ConflictException(
        "Close the open handoff before marking this thread as resolved.",
      );
    }

    const resolvedAt = new Date();
    const note = input.note?.trim() || null;

    await this.prisma.$transaction(async (tx) => {
      await tx.messageThread.update({
        where: {
          id: thread.id,
        },
        data: {
          status: MessageThreadStatus.CLOSED,
          closedAt: resolvedAt,
        },
      });

      const resolutionEvent = await tx.messageEvent.create({
        data: {
          tenantId,
          threadId: thread.id,
          patientId: thread.patientId,
          integrationConnectionId: thread.integrationConnectionId,
          actorUserId: actor.id,
          direction: MessageEventDirection.SYSTEM,
          eventType: MessageEventType.THREAD_RESOLVED,
          contentText: note,
          metadata: {
            resolvedByUserId: actor.id,
            resolvedByActorType: "HUMAN",
          },
          occurredAt: resolvedAt,
        },
        select: {
          id: true,
        },
      });

      await tx.messageThreadResolution.create({
        data: {
          tenantId,
          threadId: thread.id,
          patientId: thread.patientId,
          handoffRequestId: null,
          messageEventId: resolutionEvent.id,
          agentExecutionId: null,
          resolvedByUserId: actor.id,
          actorType: MessageThreadResolutionActorType.HUMAN,
          correlationId: null,
          note,
          metadata: {
            source: "THREAD_RESOLVE",
          },
          occurredAt: resolvedAt,
        },
      });

      await this.auditService.record(
        {
          action: AUDIT_ACTIONS.MESSAGING_THREAD_RESOLVED,
          actor,
          tenantId,
          targetType: "message_thread",
          targetId: thread.id,
          metadata: {
            note,
          },
        },
        tx,
      );
    });

    const updatedThread = await this.getThreadById(actor, threadId);

    this.messagingGateway.emitThreadActivity(tenantId, {
      threadId,
      direction: "SYSTEM",
      eventType: "THREAD_RESOLVED",
      occurredAt: resolvedAt.toISOString(),
    });
    this.messagingGateway.emitThreadUpdated(tenantId, {
      threadId,
      status: updatedThread.status,
      lastMessagePreview: updatedThread.lastMessagePreview,
      lastMessageAt: updatedThread.lastMessageAt,
    });

    return updatedThread;
  }

  async sendMessage(
    actor: AuthenticatedUser,
    threadId: string,
    input: SendThreadMessageDto,
    options?: SendMessageOptions,
  ): Promise<MessagingThreadDetailPayload> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const thread = await this.findThreadDetailOrThrow(tenantId, threadId);

    const result = await this.dispatchMessage(tenantId, thread, input.text, {
      source: options?.source ?? "HUMAN",
      correlationId: options?.correlationId,
      metadata: options?.metadata,
      actorUserId: actor.id,
    });

    return result.thread;
  }

  async sendAutomatedMessageForTenant(
    tenantId: string,
    threadId: string,
    input: SendThreadMessageDto,
    options?: Omit<SendMessageOptions, "source">,
  ): Promise<DispatchMessageResult> {
    const thread = await this.findThreadDetailOrThrow(tenantId, threadId);

    return this.dispatchMessage(tenantId, thread, input.text, {
      source: "AUTOMATION",
      correlationId: options?.correlationId,
      metadata: options?.metadata,
      actorUserId: null,
    });
  }

  private async dispatchMessage(
    tenantId: string,
    thread: ThreadDetailRecord,
    rawText: string,
    options: SendMessageOptions & {
      actorUserId: string | null;
    },
  ): Promise<DispatchMessageResult> {
    const text = rawText.trim();
    const messageSource = options.source ?? "HUMAN";
    const canReopenClosedThread = messageSource !== "HUMAN";

    if (!text) {
      throw new BadRequestException("Message text cannot be empty.");
    }

    if (thread.status === MessageThreadStatus.CLOSED && !canReopenClosedThread) {
      throw new ConflictException("Resolved threads cannot receive outbound messages.");
    }

    if (thread.integrationConnection.status !== "ACTIVE") {
      throw new BadRequestException("Messaging integration is inactive.");
    }

    const activeHandoff = thread.handoffRequests.find(
      (handoff) =>
        handoff.status === HandoffStatus.OPEN ||
        handoff.status === HandoffStatus.ASSIGNED,
    );

    if (messageSource === "HUMAN" && !activeHandoff) {
      throw new ConflictException(
        "Open a handoff before sending a human reply from this thread.",
      );
    }

    if (messageSource === "AGENT" && activeHandoff) {
      throw new ConflictException(
        "Threads in handoff must be handled by reception, not by automation.",
      );
    }

    if (messageSource === "AUTOMATION" && activeHandoff) {
      throw new ConflictException(
        "Threads in handoff must be handled by reception, not by automation.",
      );
    }

    const dispatchInstant = new Date();
    let messageEventId = "";

    try {
      const adapter = this.providerFactory.getAdapter(thread.integrationConnection.provider);
      const dispatch = await adapter.sendTextMessage({
        connection: {
          provider: thread.integrationConnection.provider,
          connectionId: thread.integrationConnectionId,
          displayName: thread.integrationConnection.displayName,
          externalAccountId: thread.integrationConnection.externalAccountId,
          config: this.mapJsonRecord(thread.integrationConnection.config),
        },
        connectionId: thread.integrationConnectionId,
        externalAccountId: thread.integrationConnection.externalAccountId,
          recipientPhoneNumber: thread.normalizedContactValue,
          text,
          context: {
            ...(activeHandoff ? { handoffId: activeHandoff.id } : {}),
            source: messageSource,
            ...(options?.correlationId
              ? { correlationId: options.correlationId }
              : {}),
          },
        });

      await this.prisma.$transaction(async (tx) => {
        const messageEvent = await tx.messageEvent.create({
          data: {
            tenantId,
            threadId: thread.id,
            patientId: thread.patientId,
            integrationConnectionId: thread.integrationConnectionId,
            handoffRequestId: activeHandoff?.id ?? null,
            actorUserId: options.actorUserId,
            direction: MessageEventDirection.OUTBOUND,
            eventType: MessageEventType.MESSAGE_SENT,
            providerMessageId: dispatch.providerMessageId,
            contentText: text,
            metadata: {
              source: messageSource,
              correlationId: options?.correlationId ?? null,
              ...(options?.metadata ?? {}),
              ...(dispatch.metadata ?? {}),
            },
            occurredAt: dispatchInstant,
          },
        });
        messageEventId = messageEvent.id;

        await tx.messageThread.update({
          where: {
            id: thread.id,
          },
          data: {
            externalThreadId:
              dispatch.externalThreadId ?? thread.externalThreadId,
            lastMessagePreview: this.truncatePreview(text),
            lastMessageAt: dispatchInstant,
            lastOutboundAt: dispatchInstant,
            status:
              thread.status === MessageThreadStatus.CLOSED && canReopenClosedThread
                ? MessageThreadStatus.OPEN
                : thread.status,
            closedAt: null,
          },
        });
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send outbound message for thread ${thread.id}: ${error instanceof Error ? error.message : "unknown error"}`,
      );

      await this.prisma.messageEvent.create({
        data: {
          tenantId,
          threadId: thread.id,
          patientId: thread.patientId,
          integrationConnectionId: thread.integrationConnectionId,
          handoffRequestId: activeHandoff?.id ?? null,
          actorUserId: options.actorUserId,
          direction: MessageEventDirection.OUTBOUND,
          eventType: MessageEventType.MESSAGE_SEND_FAILED,
            contentText: text,
            metadata: {
              source: messageSource,
              correlationId: options?.correlationId ?? null,
              error: error instanceof Error ? error.message : "Unknown outbound error",
            },
            occurredAt: dispatchInstant,
        },
      });

      throw new InternalServerErrorException(
        "Nao foi possivel enviar a mensagem desta thread.",
      );
    }

    const updatedThread = await this.getThreadDetailByTenantId(tenantId, thread.id);

    this.messagingGateway.emitThreadActivity(tenantId, {
      threadId: thread.id,
      direction: "OUTBOUND",
      eventType: "MESSAGE_SENT",
      occurredAt: dispatchInstant.toISOString(),
    });
    this.messagingGateway.emitThreadUpdated(tenantId, {
      threadId: thread.id,
      status: updatedThread.status,
      lastMessagePreview: updatedThread.lastMessagePreview,
      lastMessageAt: updatedThread.lastMessageAt,
    });

    return {
      thread: updatedThread,
      messageEventId,
    };
  }

  async findThreadDetailOrThrow(
    tenantId: string,
    threadId: string,
  ): Promise<ThreadDetailRecord> {
    const thread = await this.prisma.messageThread.findFirst({
      where: {
        id: threadId,
        tenantId,
      },
      include: threadDetailInclude,
    });

    if (!thread) {
      throw new NotFoundException("Messaging thread not found.");
    }

    return thread;
  }

  private async getThreadDetailByTenantId(
    tenantId: string,
    threadId: string,
  ): Promise<MessagingThreadDetailPayload> {
    const thread = await this.findThreadDetailOrThrow(tenantId, threadId);

    return this.mapThreadDetail(thread);
  }

  private mapThreadSummary(
    thread: ThreadSummaryRecord,
  ): MessagingThreadSummaryPayload {
    const openHandoff = thread.handoffRequests[0]
      ? this.mapHandoff(thread.handoffRequests[0])
      : null;

    return {
      id: thread.id,
      tenantId: thread.tenantId,
      patientId: thread.patientId,
      integrationConnectionId: thread.integrationConnectionId,
      channel: thread.channel,
      status: thread.status,
      patientDisplayName: thread.patientDisplayName,
      contactDisplayValue: thread.contactDisplayValue,
      normalizedContactValue: thread.normalizedContactValue,
      lastMessagePreview: thread.lastMessagePreview,
      lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
      lastInboundAt: thread.lastInboundAt?.toISOString() ?? null,
      lastOutboundAt: thread.lastOutboundAt?.toISOString() ?? null,
      handoffOpen: Boolean(openHandoff),
      openHandoff,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
    };
  }

  private mapThreadDetail(
    thread: ThreadDetailRecord,
  ): MessagingThreadDetailPayload {
    return {
      ...this.mapThreadSummary(thread),
      integration: {
        id: thread.integrationConnection.id,
        displayName: thread.integrationConnection.displayName,
        provider: thread.integrationConnection.provider,
        phoneNumber: thread.integrationConnection.phoneNumber,
        externalAccountId: thread.integrationConnection.externalAccountId,
        status: thread.integrationConnection.status,
      },
      patient: thread.patient
        ? {
            id: thread.patient.id,
            fullName: thread.patient.fullName,
            birthDate: thread.patient.birthDate
              ? thread.patient.birthDate.toISOString().slice(0, 10)
              : null,
            documentNumber: thread.patient.documentNumber,
            notes: thread.patient.notes,
            contacts: thread.patient.contacts.map((contact) => ({
              type: contact.type,
              value: contact.value,
              isPrimary: contact.isPrimary,
            })),
          }
        : null,
      events: thread.messageEvents.map((event) => this.mapEvent(event)),
      handoffs: thread.handoffRequests.map((handoff) => this.mapHandoff(handoff)),
    };
  }

  private mapEvent(
    event: ThreadDetailRecord["messageEvents"][number],
  ): MessagingEventPayload {
    return {
      id: event.id,
      threadId: event.threadId,
      patientId: event.patientId,
      integrationConnectionId: event.integrationConnectionId,
      templateId: event.templateId,
      webhookEventId: event.webhookEventId,
      handoffRequestId: event.handoffRequestId,
      actorUserId: event.actorUserId,
      direction: event.direction,
      eventType: event.eventType,
      providerMessageId: event.providerMessageId,
      contentText: event.contentText,
      metadata: this.mapJsonRecord(event.metadata),
      actorUser: event.actorUser
        ? {
            id: event.actorUser.id,
            fullName: event.actorUser.fullName,
            email: event.actorUser.email,
          }
        : null,
      occurredAt: event.occurredAt.toISOString(),
      createdAt: event.createdAt.toISOString(),
    };
  }

  private mapHandoff(
    handoff: ThreadSummaryRecord["handoffRequests"][number] | ThreadDetailRecord["handoffRequests"][number],
  ): MessagingHandoffPayload {
    return {
      id: handoff.id,
      tenantId: handoff.tenantId,
      threadId: handoff.threadId,
      status: handoff.status,
      source: handoff.source,
      priority: handoff.priority as any,
      reason: handoff.reason,
      note: handoff.note,
      closedNote: handoff.closedNote,
      openedByUserId: handoff.openedByUserId,
      assignedToUserId: handoff.assignedToUserId,
      closedByUserId: handoff.closedByUserId,
      openedByUser: handoff.openedByUser
        ? {
            id: handoff.openedByUser.id,
            fullName: handoff.openedByUser.fullName,
            email: handoff.openedByUser.email,
          }
        : null,
      assignedToUser: handoff.assignedToUser
        ? {
            id: handoff.assignedToUser.id,
            fullName: handoff.assignedToUser.fullName,
            email: handoff.assignedToUser.email,
          }
        : null,
      closedByUser: handoff.closedByUser
        ? {
            id: handoff.closedByUser.id,
            fullName: handoff.closedByUser.fullName,
            email: handoff.closedByUser.email,
          }
        : null,
      assignedAt: handoff.assignedAt?.toISOString() ?? null,
      openedAt: handoff.openedAt.toISOString(),
      closedAt: handoff.closedAt?.toISOString() ?? null,
      createdAt: handoff.createdAt.toISOString(),
      updatedAt: handoff.updatedAt.toISOString(),
    };
  }

  private truncatePreview(text: string): string | null {
    const normalized = text.trim();

    if (!normalized) {
      return null;
    }

    return normalized.length <= 255
      ? normalized
      : `${normalized.slice(0, 252)}...`;
  }

  private mapJsonRecord(
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> | null {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      return null;
    }

    return value as Record<string, unknown>;
  }
}
