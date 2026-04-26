import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type {
  MessagingHandoffListItemPayload,
  MessagingHandoffPayload,
} from "@operaclinic/shared";
import {
  HandoffPriority,
  HandoffSource,
  HandoffStatus,
  MessageEventDirection,
  MessageEventType,
  MessageThreadResolutionActorType,
  MessageThreadStatus,
  MessagingChannel,
  Prisma,
  RoleCode,
  UserStatus,
} from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { MessagingProviderFactory } from "./adapters/messaging-provider.factory";
import { AssignHandoffDto } from "./dto/assign-handoff.dto";
import { CloseHandoffDto } from "./dto/close-handoff.dto";
import { CreateHandoffDto } from "./dto/create-handoff.dto";
import { ListHandoffsQueryDto } from "./dto/list-handoffs-query.dto";
import { MessagingAccessService } from "./messaging-access.service";
import { MessagingGateway } from "./gateways/messaging.gateway";

const userReferenceSelect = {
  id: true,
  fullName: true,
  email: true,
} satisfies Prisma.UserSelect;

const threadForHandoffInclude = {
  integrationConnection: true,
} satisfies Prisma.MessageThreadInclude;

const handoffInclude = {
  openedByUser: {
    select: userReferenceSelect,
  },
  assignedToUser: {
    select: userReferenceSelect,
  },
  closedByUser: {
    select: userReferenceSelect,
  },
  thread: {
    select: {
      id: true,
      status: true,
      patientId: true,
      patientDisplayName: true,
      contactDisplayValue: true,
      lastMessagePreview: true,
      lastMessageAt: true,
    },
  },
} satisfies Prisma.HandoffRequestInclude;

type ThreadForHandoff = Prisma.MessageThreadGetPayload<{
  include: typeof threadForHandoffInclude;
}>;

type HandoffRecord = Prisma.HandoffRequestGetPayload<{
  include: typeof handoffInclude;
}>;

interface CreateHandoffRecordInput {
  tenantId: string;
  thread: ThreadForHandoff;
  reason: string;
  note?: string | null;
  priority?: HandoffPriority;
  source: HandoffSource;
  openedByUserId?: string | null;
  assignedToUserId?: string | null;
}

@Injectable()
export class HandoffRequestsService {
  private readonly logger = new Logger(HandoffRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: MessagingAccessService,
    private readonly providerFactory: MessagingProviderFactory,
    private readonly auditService: AuditService,
    private readonly messagingGateway: MessagingGateway,
  ) {}

  async listHandoffs(
    actor: AuthenticatedUser,
    query: ListHandoffsQueryDto,
  ): Promise<MessagingHandoffListItemPayload[]> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const where: Prisma.HandoffRequestWhereInput = {
      tenantId,
      status: query.status ?? {
        in: [HandoffStatus.OPEN, HandoffStatus.ASSIGNED],
      },
    };

    if (query.threadId) {
      where.threadId = query.threadId;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.assignedToUserId) {
      where.assignedToUserId = query.assignedToUserId;
    }

    if (query.search) {
      where.OR = [
        {
          reason: {
            contains: query.search,
            mode: "insensitive",
          },
        },
        {
          note: {
            contains: query.search,
            mode: "insensitive",
          },
        },
        {
          thread: {
            patientDisplayName: {
              contains: query.search,
              mode: "insensitive",
            },
          },
        },
        {
          thread: {
            contactDisplayValue: {
              contains: query.search,
              mode: "insensitive",
            },
          },
        },
        {
          thread: {
            lastMessagePreview: {
              contains: query.search,
              mode: "insensitive",
            },
          },
        },
      ];
    }

    const handoffs = await this.prisma.handoffRequest.findMany({
      where,
      include: handoffInclude,
      orderBy: [{ openedAt: "desc" }, { updatedAt: "desc" }],
    });

    return handoffs.map((handoff) => this.mapHandoffListItem(handoff));
  }

  async openHandoff(
    actor: AuthenticatedUser,
    input: CreateHandoffDto,
  ): Promise<MessagingHandoffPayload> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const thread = await this.findThreadForHandoffOrThrow(tenantId, input.threadId);

    if (thread.status === MessageThreadStatus.CLOSED) {
      throw new NotFoundException("Messaging thread is closed.");
    }

    const existingActiveHandoff = await this.findActiveHandoffByThread(
      tenantId,
      thread.id,
    );

    if (existingActiveHandoff) {
      throw new ConflictException(
        "This messaging thread already has an active handoff.",
      );
    }

    const template = input.templateId
      ? await this.prisma.messageTemplate.findFirst({
          where: {
            id: input.templateId,
            tenantId,
            channel: MessagingChannel.WHATSAPP,
            isActive: true,
          },
        })
      : null;

    if (input.templateId && !template) {
      throw new NotFoundException("Messaging template not found.");
    }

    const assignedToUserId = await this.resolveManualAssigneeUserId(
      actor,
      tenantId,
      input.assignedToUserId,
    );

    const handoff = await this.createHandoffRecord(
      {
        tenantId,
        thread,
        reason: input.reason.trim(),
        note: input.note?.trim() || null,
        priority: input.priority,
        source: HandoffSource.MANUAL,
        openedByUserId: actor.id,
        assignedToUserId,
      },
      actor,
      template?.id ?? null,
    );
    
    this.messagingGateway.emitNewHandoff(tenantId, this.mapHandoffListItem(handoff));

    if (template) {
      await this.dispatchTemplateForHandoff({
        actor,
        tenantId,
        thread,
        handoffId: handoff.id,
        templateId: template.id,
        bodyText: template.bodyText,
      });
    }

    return this.mapHandoff(handoff);
  }

  async ensureAutomaticHandoffForThread(input: {
    tenantId: string;
    threadId: string;
    reason: string;
    priority?: HandoffPriority;
    note?: string | null;
  }): Promise<MessagingHandoffPayload> {
    const thread = await this.findThreadForHandoffOrThrow(input.tenantId, input.threadId);
    const existingActiveHandoff = await this.findActiveHandoffByThread(
      input.tenantId,
      thread.id,
    );

    if (existingActiveHandoff) {
      return this.mapHandoff(existingActiveHandoff);
    }

    const assignedToUserId = await this.resolveAutomaticAssigneeUserId(input.tenantId);
    const handoff = await this.createHandoffRecord({
      tenantId: input.tenantId,
      thread,
      reason: input.reason.trim(),
      note: input.note?.trim() || null,
      priority: input.priority,
      source: HandoffSource.AUTOMATIC,
      openedByUserId: null,
      assignedToUserId,
    });

    this.messagingGateway.emitNewHandoff(input.tenantId, this.mapHandoffListItem(handoff));

    return this.mapHandoff(handoff);
  }

  async assignHandoff(
    actor: AuthenticatedUser,
    handoffId: string,
    input: AssignHandoffDto,
  ): Promise<MessagingHandoffPayload> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const handoff = await this.findHandoffOrThrow(tenantId, handoffId);

    if (handoff.status === HandoffStatus.CLOSED) {
      throw new ConflictException("Closed handoffs cannot be assigned.");
    }

    const nextAssignedToUserId =
      input.assignedToUserId === undefined || input.assignedToUserId === null
        ? null
        : await this.resolveReceptionAssigneeUserId(tenantId, input.assignedToUserId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.handoffRequest.update({
        where: {
          id: handoff.id,
        },
        data: {
          assignedToUserId: nextAssignedToUserId,
          assignedAt: nextAssignedToUserId ? new Date() : null,
          status: nextAssignedToUserId
            ? HandoffStatus.ASSIGNED
            : HandoffStatus.OPEN,
        },
        include: handoffInclude,
      });

      await tx.messageEvent.create({
        data: {
          tenantId,
          threadId: handoff.threadId,
          patientId: handoff.thread.patientId,
          integrationConnectionId: await this.resolveThreadConnectionId(
            tx,
            handoff.threadId,
          ),
          handoffRequestId: handoff.id,
          actorUserId: actor.id,
          direction: MessageEventDirection.SYSTEM,
          eventType: MessageEventType.HANDOFF_ASSIGNED,
          metadata: {
            assignedToUserId: nextAssignedToUserId,
          },
          occurredAt: new Date(),
        },
      });

      await this.auditService.record(
        {
          action: AUDIT_ACTIONS.MESSAGING_HANDOFF_ASSIGNED,
          actor,
          tenantId,
          targetType: "handoff_request",
          targetId: handoff.id,
          metadata: {
            threadId: handoff.threadId,
            assignedToUserId: nextAssignedToUserId,
          },
        },
        tx,
      );

      return next;
    });

    this.messagingGateway.emitHandoffUpdate(tenantId, this.mapHandoffListItem(updated));

    return this.mapHandoff(updated);
  }

  async closeHandoff(
    actor: AuthenticatedUser,
    handoffId: string,
    input: CloseHandoffDto,
  ): Promise<MessagingHandoffPayload> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const handoff = await this.findHandoffOrThrow(tenantId, handoffId);

    if (handoff.status === HandoffStatus.CLOSED) {
      return this.mapHandoff(handoff);
    }

    const thread = await this.findThreadForHandoffOrThrow(tenantId, handoff.threadId);
    const shouldResolveThread = Boolean(input.resolveThread);
    const note = input.note?.trim() || null;
    const closedAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.handoffRequest.update({
        where: {
          id: handoff.id,
        },
        data: {
          status: HandoffStatus.CLOSED,
          closedNote: note,
          closedByUserId: actor.id,
          closedAt,
        },
        include: handoffInclude,
      });

      await tx.messageThread.update({
        where: {
          id: handoff.threadId,
        },
        data: {
          status: shouldResolveThread
            ? MessageThreadStatus.CLOSED
            : MessageThreadStatus.OPEN,
          closedAt: shouldResolveThread ? closedAt : null,
        },
      });

      await tx.messageEvent.create({
        data: {
          tenantId,
          threadId: handoff.threadId,
          handoffRequestId: handoff.id,
          actorUserId: actor.id,
          direction: MessageEventDirection.SYSTEM,
          eventType: MessageEventType.HANDOFF_CLOSED,
          contentText: note,
          metadata: {
            closedByUserId: actor.id,
            closedByActorType: "HUMAN",
            resolveThread: shouldResolveThread,
          },
          patientId: thread.patientId,
          integrationConnectionId: thread.integrationConnectionId,
          occurredAt: closedAt,
        },
      });

      if (shouldResolveThread) {
        const resolutionEvent = await tx.messageEvent.create({
          data: {
            tenantId,
            threadId: handoff.threadId,
            handoffRequestId: handoff.id,
            actorUserId: actor.id,
            direction: MessageEventDirection.SYSTEM,
            eventType: MessageEventType.THREAD_RESOLVED,
            contentText: note,
            metadata: {
              resolvedByUserId: actor.id,
              resolvedByActorType: "HUMAN",
            },
            patientId: thread.patientId,
            integrationConnectionId: thread.integrationConnectionId,
            occurredAt: closedAt,
          },
          select: {
            id: true,
          },
        });

        await tx.messageThreadResolution.create({
          data: {
            tenantId,
            threadId: handoff.threadId,
            patientId: thread.patientId,
            handoffRequestId: handoff.id,
            messageEventId: resolutionEvent.id,
            agentExecutionId: null,
            resolvedByUserId: actor.id,
            actorType: MessageThreadResolutionActorType.HUMAN,
            correlationId: null,
            note,
            metadata: {
              source: "HANDOFF_CLOSE",
            },
            occurredAt: closedAt,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.MESSAGING_THREAD_RESOLVED,
            actor,
            tenantId,
            targetType: "message_thread",
            targetId: handoff.threadId,
            metadata: {
              source: "handoff_close",
            },
          },
          tx,
        );
      }

      await this.auditService.record(
        {
          action: AUDIT_ACTIONS.MESSAGING_HANDOFF_CLOSED,
          actor,
          tenantId,
          targetType: "handoff_request",
          targetId: handoff.id,
          metadata: {
            threadId: handoff.threadId,
          },
        },
        tx,
      );

      return next;
    });

    this.messagingGateway.emitHandoffUpdate(tenantId, this.mapHandoffListItem(updated));

    return this.mapHandoff(updated);
  }

  private async createHandoffRecord(
    input: CreateHandoffRecordInput,
    actor?: AuthenticatedUser,
    templateId?: string | null,
  ): Promise<HandoffRecord> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.handoffRequest.create({
        data: {
          tenantId: input.tenantId,
          threadId: input.thread.id,
          source: input.source,
          status: input.assignedToUserId ? HandoffStatus.ASSIGNED : HandoffStatus.OPEN,
          priority: input.priority ?? HandoffPriority.MEDIUM,
          reason: input.reason,
          note: input.note ?? null,
          openedByUserId: input.openedByUserId ?? null,
          assignedToUserId: input.assignedToUserId ?? null,
          assignedAt: input.assignedToUserId ? new Date() : null,
        },
      });

      await tx.messageThread.update({
        where: {
          id: input.thread.id,
        },
        data: {
          status: MessageThreadStatus.IN_HANDOFF,
          closedAt: null,
        },
      });

      await tx.messageEvent.create({
        data: {
          tenantId: input.tenantId,
          threadId: input.thread.id,
          patientId: input.thread.patientId,
          integrationConnectionId: input.thread.integrationConnectionId,
          handoffRequestId: created.id,
          actorUserId: input.openedByUserId ?? null,
          direction: MessageEventDirection.SYSTEM,
          eventType: MessageEventType.HANDOFF_OPENED,
          contentText: input.note ?? null,
          metadata: {
            reason: input.reason,
            priority: input.priority ?? HandoffPriority.MEDIUM,
            source: input.source,
          },
          occurredAt: new Date(),
        },
      });

      if (input.assignedToUserId) {
        await tx.messageEvent.create({
          data: {
            tenantId: input.tenantId,
            threadId: input.thread.id,
            patientId: input.thread.patientId,
            integrationConnectionId: input.thread.integrationConnectionId,
            handoffRequestId: created.id,
            actorUserId: input.openedByUserId ?? null,
            direction: MessageEventDirection.SYSTEM,
            eventType: MessageEventType.HANDOFF_ASSIGNED,
            metadata: {
              assignedToUserId: input.assignedToUserId,
            },
            occurredAt: new Date(),
          },
        });
      }

      if (actor) {
        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.MESSAGING_HANDOFF_OPENED,
            actor,
            tenantId: input.tenantId,
            targetType: "handoff_request",
            targetId: created.id,
            metadata: {
              threadId: input.thread.id,
              reason: input.reason,
              templateId: templateId ?? null,
              assignedToUserId: input.assignedToUserId ?? null,
            },
          },
          tx,
        );

        if (input.assignedToUserId) {
          await this.auditService.record(
            {
              action: AUDIT_ACTIONS.MESSAGING_HANDOFF_ASSIGNED,
              actor,
              tenantId: input.tenantId,
              targetType: "handoff_request",
              targetId: created.id,
              metadata: {
                threadId: input.thread.id,
                assignedToUserId: input.assignedToUserId,
                source: "handoff_open",
              },
            },
            tx,
          );
        }
      }

      return tx.handoffRequest.findUniqueOrThrow({
        where: {
          id: created.id,
        },
        include: handoffInclude,
      });
    });
  }

  private async dispatchTemplateForHandoff(input: {
    actor: AuthenticatedUser;
    tenantId: string;
    thread: ThreadForHandoff;
    handoffId: string;
    templateId: string;
    bodyText: string;
  }): Promise<void> {
    try {
      const adapter = this.providerFactory.getAdapter(
        input.thread.integrationConnection.provider,
      );
      const dispatch = await adapter.sendTextMessage({
        connection: {
          provider: input.thread.integrationConnection.provider,
          connectionId: input.thread.integrationConnectionId,
          displayName: input.thread.integrationConnection.displayName,
          externalAccountId: input.thread.integrationConnection.externalAccountId,
          config: this.mapJsonRecord(input.thread.integrationConnection.config),
        },
        connectionId: input.thread.integrationConnectionId,
        externalAccountId: input.thread.integrationConnection.externalAccountId,
        recipientPhoneNumber: input.thread.normalizedContactValue,
        text: input.bodyText,
        context: {
          handoffId: input.handoffId,
        },
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.messageEvent.create({
          data: {
            tenantId: input.tenantId,
            threadId: input.thread.id,
            patientId: input.thread.patientId,
            integrationConnectionId: input.thread.integrationConnectionId,
            templateId: input.templateId,
            handoffRequestId: input.handoffId,
            actorUserId: input.actor.id,
            direction: MessageEventDirection.OUTBOUND,
            eventType: MessageEventType.MESSAGE_SENT,
            providerMessageId: dispatch.providerMessageId,
            contentText: input.bodyText,
            metadata: {
              source: "HUMAN",
              origin: "HANDOFF_TEMPLATE",
              ...(dispatch.metadata && typeof dispatch.metadata === "object"
                ? dispatch.metadata
                : {}),
            },
            occurredAt: new Date(),
          },
        });

        await tx.messageThread.update({
          where: {
            id: input.thread.id,
          },
          data: {
            externalThreadId:
              dispatch.externalThreadId ?? input.thread.externalThreadId,
            lastMessagePreview: this.truncatePreview(input.bodyText),
            lastMessageAt: new Date(),
            lastOutboundAt: new Date(),
          },
        });
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send outbound handoff template for thread ${input.thread.id}: ${error instanceof Error ? error.message : "unknown error"}`,
      );

      await this.prisma.messageEvent.create({
        data: {
          tenantId: input.tenantId,
          threadId: input.thread.id,
          patientId: input.thread.patientId,
          integrationConnectionId: input.thread.integrationConnectionId,
          templateId: input.templateId,
          handoffRequestId: input.handoffId,
          actorUserId: input.actor.id,
          direction: MessageEventDirection.OUTBOUND,
          eventType: MessageEventType.MESSAGE_SEND_FAILED,
          contentText: input.bodyText,
          metadata: {
            source: "HUMAN",
            origin: "HANDOFF_TEMPLATE",
            error:
              error instanceof Error ? error.message : "Unknown outbound error",
          },
          occurredAt: new Date(),
        },
      });
    }
  }

  private async resolveManualAssigneeUserId(
    actor: AuthenticatedUser,
    tenantId: string,
    assignedToUserId?: string,
  ): Promise<string | null> {
    if (assignedToUserId) {
      return this.resolveReceptionAssigneeUserId(tenantId, assignedToUserId);
    }

    if (actor.roles.includes(RoleCode.RECEPTION)) {
      return actor.id;
    }

    return null;
  }

  private async resolveAutomaticAssigneeUserId(
    tenantId: string,
  ): Promise<string | null> {
    const receptionUsers = await this.prisma.userRole.findMany({
      where: {
        tenantId,
        role: {
          code: RoleCode.RECEPTION,
        },
        user: {
          status: UserStatus.ACTIVE,
        },
      },
      distinct: ["userId"],
      select: {
        userId: true,
      },
    });

    return receptionUsers.length === 1 ? receptionUsers[0]?.userId ?? null : null;
  }

  private async resolveReceptionAssigneeUserId(
    tenantId: string,
    assignedToUserId: string,
  ): Promise<string> {
    const assignment = await this.prisma.userRole.findFirst({
      where: {
        tenantId,
        userId: assignedToUserId,
        role: {
          code: RoleCode.RECEPTION,
        },
        user: {
          status: UserStatus.ACTIVE,
        },
      },
      select: {
        userId: true,
      },
    });

    if (!assignment) {
      throw new BadRequestException(
        "The selected handoff assignee must be an active reception user from this clinic.",
      );
    }

    return assignment.userId;
  }

  private async resolveThreadConnectionId(
    tx: Prisma.TransactionClient,
    threadId: string,
  ): Promise<string> {
    const thread = await tx.messageThread.findUnique({
      where: {
        id: threadId,
      },
      select: {
        integrationConnectionId: true,
      },
    });

    if (!thread) {
      throw new NotFoundException("Messaging thread not found.");
    }

    return thread.integrationConnectionId;
  }

  private async findThreadForHandoffOrThrow(
    tenantId: string,
    threadId: string,
  ): Promise<ThreadForHandoff> {
    const thread = await this.prisma.messageThread.findFirst({
      where: {
        id: threadId,
        tenantId,
      },
      include: threadForHandoffInclude,
    });

    if (!thread) {
      throw new NotFoundException("Messaging thread not found.");
    }

    return thread;
  }

  private async findActiveHandoffByThread(
    tenantId: string,
    threadId: string,
  ): Promise<HandoffRecord | null> {
    return this.prisma.handoffRequest.findFirst({
      where: {
        tenantId,
        threadId,
        status: {
          in: [HandoffStatus.OPEN, HandoffStatus.ASSIGNED],
        },
      },
      include: handoffInclude,
      orderBy: {
        openedAt: "desc",
      },
    });
  }

  private async findHandoffOrThrow(
    tenantId: string,
    handoffId: string,
  ): Promise<HandoffRecord> {
    const handoff = await this.prisma.handoffRequest.findFirst({
      where: {
        id: handoffId,
        tenantId,
      },
      include: handoffInclude,
    });

    if (!handoff) {
      throw new NotFoundException("Handoff request not found.");
    }

    return handoff;
  }

  private truncatePreview(text: string): string {
    return text.length <= 255 ? text : `${text.slice(0, 252)}...`;
  }

  private mapJsonRecord(
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> | null {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private mapHandoffListItem(
    handoff: HandoffRecord,
  ): MessagingHandoffListItemPayload {
    return {
      ...this.mapHandoff(handoff),
      thread: {
        id: handoff.thread.id,
        status: handoff.thread.status,
        patientId: handoff.thread.patientId,
        patientDisplayName: handoff.thread.patientDisplayName,
        contactDisplayValue: handoff.thread.contactDisplayValue,
        lastMessagePreview: handoff.thread.lastMessagePreview,
        lastMessageAt: handoff.thread.lastMessageAt?.toISOString() ?? null,
      },
    };
  }

  private mapHandoff(handoff: HandoffRecord): MessagingHandoffPayload {
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
}
