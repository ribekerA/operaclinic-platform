import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  AppointmentFollowUpDispatchStatus,
  AppointmentFollowUpKind,
  AppointmentStatus,
  HandoffStatus,
  IntegrationConnectionStatus,
  MessageEventDirection,
  MessageEventType,
  MessageThreadStatus,
  MessagingChannel,
  PatientContactType,
  Prisma,
} from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { OperationalObservabilityService } from "../../common/observability/operational-observability.service";
import { PrismaService } from "../../database/prisma.service";
import { MessageThreadsService } from "../messaging/message-threads.service";
import { SchedulingAccessService } from "../scheduling/scheduling-access.service";
import { SchedulingTimezoneService } from "../scheduling/scheduling-timezone.service";
import { RunAppointmentFollowUpDto } from "./dto/run-appointment-follow-up.dto";

const APPOINTMENT_REMINDER_KIND = AppointmentFollowUpKind.APPOINTMENT_REMINDER_24H;
const APPOINTMENT_REMINDER_LEAD_HOURS = 24;
const DEFAULT_WINDOW_MINUTES = 30;
const DEFAULT_LIMIT = 50;

type AppointmentCandidate = Prisma.AppointmentGetPayload<{
  include: {
    patient: {
      select: {
        id: true;
        fullName: true;
        contacts: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }];
          select: {
            id: true;
            type: true;
            value: true;
            normalizedValue: true;
            isPrimary: true;
            allowAutomatedMessaging: true;
            automatedMessagingOptedOutAt: true;
          };
        };
      };
    };
    professional: {
      select: {
        fullName: true;
        displayName: true;
      };
    };
    unit: {
      select: {
        name: true;
      };
    };
  };
}>;

type ThreadRecord = Prisma.MessageThreadGetPayload<{
  include: {
    integrationConnection: true;
    handoffRequests: {
      where: {
        status: {
          in: ["OPEN", "ASSIGNED"];
        };
      };
    };
  };
}>;

interface CandidateEvaluation {
  appointment: AppointmentCandidate;
  dispatchKey: string;
  scheduledFor: Date;
  contact: AppointmentCandidate["patient"]["contacts"][number] | null;
  thread: ThreadRecord | null;
  integrationConnection: {
    id: string;
    provider: string;
    displayName: string;
    externalAccountId: string | null;
    config: Prisma.JsonValue | null;
    status: IntegrationConnectionStatus;
  } | null;
  renderedText: string | null;
  eligible: boolean;
  reason:
    | "eligible"
    | "already_dispatched"
    | "no_contact"
    | "automated_messaging_opted_out"
    | "no_active_integration_connection"
    | "ambiguous_integration_connection"
    | "ambiguous_existing_threads"
    | "active_handoff"
    | "thread_in_handoff_status"
    | "empty_rendered_message";
}

export interface AppointmentFollowUpRunResult {
  tenantId: string;
  kind: AppointmentFollowUpKind;
  dryRun: boolean;
  runAt: string;
  windowMinutes: number;
  limit: number;
  templateId: string;
  summary: {
    scannedAppointments: number;
    eligibleAppointments: number;
    alreadyDispatched: number;
    skippedAppointments: number;
    sentAppointments: number;
    failedAppointments: number;
  };
  items: Array<{
    appointmentId: string;
    patientId: string;
    patientContactId: string | null;
    threadId: string | null;
    dispatchId: string | null;
    messageEventId: string | null;
    status:
      | "ELIGIBLE"
      | "ALREADY_DISPATCHED"
      | "SKIPPED"
      | "SENT"
      | "FAILED";
    reason: string;
    scheduledFor: string;
  }>;
}

@Injectable()
export class AppointmentFollowUpsService {
  private readonly logger = new Logger(AppointmentFollowUpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: SchedulingAccessService,
    private readonly timezoneService: SchedulingTimezoneService,
    private readonly messageThreadsService: MessageThreadsService,
    private readonly auditService: AuditService,
    private readonly observability: OperationalObservabilityService,
  ) {}

  async runAppointmentReminder24h(
    actor: AuthenticatedUser,
    input: RunAppointmentFollowUpDto,
  ): Promise<AppointmentFollowUpRunResult> {
    const flowStartedAt = Date.now();
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const dryRun = input.dryRun ?? false;
    const windowMinutes = input.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
    const limit = input.limit ?? DEFAULT_LIMIT;
    const runAt = input.runAt
      ? this.parseDateTime(input.runAt, "runAt")
      : await this.timezoneService.getCurrentInstant();

    try {
      const template = await this.prisma.messageTemplate.findFirst({
        where: {
          id: input.templateId,
          tenantId,
          channel: MessagingChannel.WHATSAPP,
          isActive: true,
        },
        select: {
          id: true,
          bodyText: true,
        },
      });

      if (!template) {
        throw new NotFoundException("Messaging template not found for this clinic.");
      }

      const activeConnections = await this.prisma.integrationConnection.findMany({
        where: {
          tenantId,
          channel: MessagingChannel.WHATSAPP,
          status: IntegrationConnectionStatus.ACTIVE,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      const dueWindowStart = new Date(runAt.getTime() - windowMinutes * 60_000);
      const appointmentWindowStart = new Date(
        dueWindowStart.getTime() + APPOINTMENT_REMINDER_LEAD_HOURS * 60 * 60_000,
      );
      const appointmentWindowEnd = new Date(
        runAt.getTime() + APPOINTMENT_REMINDER_LEAD_HOURS * 60 * 60_000,
      );
      const tenantTimezone = await this.timezoneService.getTenantTimezone(tenantId);

      const appointments = await this.prisma.appointment.findMany({
        where: {
          tenantId,
          status: {
            in: [AppointmentStatus.BOOKED, AppointmentStatus.RESCHEDULED],
          },
          startsAt: {
            gt: appointmentWindowStart,
            lte: appointmentWindowEnd,
          },
        },
        include: {
          patient: {
            select: {
              id: true,
              fullName: true,
              contacts: {
                orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                select: {
                  id: true,
                  type: true,
                  value: true,
                  normalizedValue: true,
                  isPrimary: true,
                  allowAutomatedMessaging: true,
                  automatedMessagingOptedOutAt: true,
                },
              },
            },
          },
          professional: {
            select: {
              fullName: true,
              displayName: true,
            },
          },
          unit: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          startsAt: "asc",
        },
        take: limit,
      });

      const existingDispatches = await this.prisma.appointmentFollowUpDispatch.findMany({
        where: {
          tenantId,
          kind: APPOINTMENT_REMINDER_KIND,
          dispatchKey: {
            in: appointments.map((appointment) =>
              this.buildDispatchKey(appointment.id, appointment.startsAt),
            ),
          },
        },
        select: {
          dispatchKey: true,
        },
      });
      const existingDispatchKeys = new Set(
        existingDispatches.map((dispatch) => dispatch.dispatchKey),
      );

      const items: AppointmentFollowUpRunResult["items"] = [];
      let eligibleAppointments = 0;
      let alreadyDispatched = 0;
      let skippedAppointments = 0;
      let sentAppointments = 0;
      let failedAppointments = 0;

      for (const appointment of appointments) {
        const evaluation = await this.evaluateCandidate({
          tenantId,
          appointment,
          templateBodyText: template.bodyText,
          activeConnections,
          existingDispatchKeys,
          tenantTimezone,
        });

        if (!evaluation.eligible) {
          const status =
            evaluation.reason === "already_dispatched"
              ? "ALREADY_DISPATCHED"
              : "SKIPPED";
          if (status === "ALREADY_DISPATCHED") {
            alreadyDispatched += 1;
          } else {
            skippedAppointments += 1;
          }
          items.push({
            appointmentId: appointment.id,
            patientId: appointment.patientId,
            patientContactId: evaluation.contact?.id ?? null,
            threadId: evaluation.thread?.id ?? null,
            dispatchId: null,
            messageEventId: null,
            status,
            reason: evaluation.reason,
            scheduledFor: evaluation.scheduledFor.toISOString(),
          });
          continue;
        }

        eligibleAppointments += 1;

        if (dryRun) {
          items.push({
            appointmentId: appointment.id,
            patientId: appointment.patientId,
            patientContactId: evaluation.contact?.id ?? null,
            threadId: evaluation.thread?.id ?? null,
            dispatchId: null,
            messageEventId: null,
            status: "ELIGIBLE",
            reason: evaluation.reason,
            scheduledFor: evaluation.scheduledFor.toISOString(),
          });
          continue;
        }

        const dispatchResult = await this.dispatchCandidate({
          actor,
          tenantId,
          appointment,
          templateId: template.id,
          evaluation,
        });

        if (dispatchResult.status === "SENT") {
          sentAppointments += 1;
        } else if (dispatchResult.status === "ALREADY_DISPATCHED") {
          alreadyDispatched += 1;
        } else {
          failedAppointments += 1;
        }

        items.push(dispatchResult);
      }

      const result: AppointmentFollowUpRunResult = {
        tenantId,
        kind: APPOINTMENT_REMINDER_KIND,
        dryRun,
        runAt: runAt.toISOString(),
        windowMinutes,
        limit,
        templateId: template.id,
        summary: {
          scannedAppointments: appointments.length,
          eligibleAppointments,
          alreadyDispatched,
          skippedAppointments,
          sentAppointments,
          failedAppointments,
        },
        items,
      };

      await this.auditService.record({
        action: AUDIT_ACTIONS.APPOINTMENT_FOLLOW_UP_RUN,
        actor,
        tenantId,
        targetType: "appointment_follow_up_run",
        targetId: null,
        metadata: {
          kind: APPOINTMENT_REMINDER_KIND,
          dryRun,
          runAt: runAt.toISOString(),
          windowMinutes,
          templateId: template.id,
          summary: result.summary,
        },
      });

      this.observability.recordFlow({
        channel: "http",
        flow: "appointment_follow_up_dispatch",
        outcome: failedAppointments > 0 ? "failure" : "success",
        durationMs: Date.now() - flowStartedAt,
        timestamp: Date.now(),
        tenantId,
      });

      return result;
    } catch (error) {
      this.observability.recordFlow({
        channel: "http",
        flow: "appointment_follow_up_dispatch",
        outcome: "failure",
        durationMs: Date.now() - flowStartedAt,
        timestamp: Date.now(),
        tenantId,
      });
      throw error;
    }
  }

  private async evaluateCandidate(input: {
    tenantId: string;
    appointment: AppointmentCandidate;
    templateBodyText: string;
    activeConnections: Array<{
      id: string;
      provider: string;
      displayName: string;
      externalAccountId: string | null;
      config: Prisma.JsonValue | null;
      status: IntegrationConnectionStatus;
    }>;
    existingDispatchKeys: Set<string>;
    tenantTimezone: string;
  }): Promise<CandidateEvaluation> {
    const dispatchKey = this.buildDispatchKey(
      input.appointment.id,
      input.appointment.startsAt,
    );
    const scheduledFor = new Date(
      input.appointment.startsAt.getTime() -
        APPOINTMENT_REMINDER_LEAD_HOURS * 60 * 60_000,
    );

    if (input.existingDispatchKeys.has(dispatchKey)) {
      return {
        appointment: input.appointment,
        dispatchKey,
        scheduledFor,
        contact: null,
        thread: null,
        integrationConnection: null,
        renderedText: null,
        eligible: false,
        reason: "already_dispatched",
      };
    }

    const contactSelection = this.selectContact(input.appointment.patient.contacts);
    if (contactSelection.reason !== "eligible") {
      return {
        appointment: input.appointment,
        dispatchKey,
        scheduledFor,
        contact: contactSelection.contact,
        thread: null,
        integrationConnection: null,
        renderedText: null,
        eligible: false,
        reason: contactSelection.reason,
      };
    }

    const selectedContact = contactSelection.contact;
    if (!selectedContact) {
      return {
        appointment: input.appointment,
        dispatchKey,
        scheduledFor,
        contact: null,
        thread: null,
        integrationConnection: null,
        renderedText: null,
        eligible: false,
        reason: "no_contact",
      };
    }

    const threadResolution = await this.resolveThreadForContact(
      input.tenantId,
      selectedContact.normalizedValue,
    );
    if (
      threadResolution.reason === "ambiguous_existing_threads" ||
      threadResolution.reason === "active_handoff" ||
      threadResolution.reason === "thread_in_handoff_status"
    ) {
      return {
        appointment: input.appointment,
        dispatchKey,
        scheduledFor,
        contact: selectedContact,
        thread: threadResolution.thread,
        integrationConnection: threadResolution.integrationConnection,
        renderedText: null,
        eligible: false,
        reason: threadResolution.reason,
      };
    }

    const integrationSelection = threadResolution.integrationConnection
      ? {
          integrationConnection: threadResolution.integrationConnection,
          reason: "eligible" as const,
        }
      : this.selectIntegrationConnection(input.activeConnections);

    if (
      integrationSelection.reason === "no_active_integration_connection" ||
      integrationSelection.reason === "ambiguous_integration_connection"
    ) {
      return {
        appointment: input.appointment,
        dispatchKey,
        scheduledFor,
        contact: selectedContact,
        thread: threadResolution.thread,
        integrationConnection: null,
        renderedText: null,
        eligible: false,
        reason: integrationSelection.reason,
      };
    }

    const renderedText = this.renderTemplate(input.templateBodyText, {
      patientName: input.appointment.patient.fullName ?? "",
      appointmentDate: this.formatDate(input.appointment.startsAt, input.tenantTimezone),
      appointmentTime: this.formatTime(input.appointment.startsAt, input.tenantTimezone),
      professionalName:
        input.appointment.professional.displayName ||
        input.appointment.professional.fullName,
      unitName: input.appointment.unit?.name ?? "",
    });

    if (!renderedText) {
      return {
        appointment: input.appointment,
        dispatchKey,
        scheduledFor,
        contact: selectedContact,
        thread: threadResolution.thread,
        integrationConnection: integrationSelection.integrationConnection,
        renderedText: null,
        eligible: false,
        reason: "empty_rendered_message",
      };
    }

    return {
      appointment: input.appointment,
      dispatchKey,
      scheduledFor,
      contact: selectedContact,
      thread: threadResolution.thread,
      integrationConnection: integrationSelection.integrationConnection,
      renderedText,
      eligible: true,
      reason: "eligible",
    };
  }

  private async dispatchCandidate(input: {
    actor: AuthenticatedUser;
    tenantId: string;
    appointment: AppointmentCandidate;
    templateId: string;
    evaluation: CandidateEvaluation;
  }): Promise<AppointmentFollowUpRunResult["items"][number]> {
    let dispatch: {
      id: string;
      correlationId: string;
    };

    try {
      dispatch = await this.prisma.appointmentFollowUpDispatch.create({
        data: {
          tenantId: input.tenantId,
          appointmentId: input.appointment.id,
          patientId: input.appointment.patientId,
          patientContactId: input.evaluation.contact?.id ?? "",
          threadId: input.evaluation.thread?.id ?? null,
          integrationConnectionId: input.evaluation.integrationConnection?.id ?? null,
          templateId: input.templateId,
          initiatedByUserId: input.actor.id,
          kind: APPOINTMENT_REMINDER_KIND,
          status: AppointmentFollowUpDispatchStatus.PROCESSING,
          dispatchKey: input.evaluation.dispatchKey,
          correlationId: randomUUID(),
          scheduledFor: input.evaluation.scheduledFor,
          startedAt: new Date(),
          metadata: {
            origin: "APPOINTMENT_FOLLOW_UP",
            appointmentStartsAt: input.appointment.startsAt.toISOString(),
          },
        },
        select: {
          id: true,
          correlationId: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return {
          appointmentId: input.appointment.id,
          patientId: input.appointment.patientId,
          patientContactId: input.evaluation.contact?.id ?? null,
          threadId: input.evaluation.thread?.id ?? null,
          dispatchId: null,
          messageEventId: null,
          status: "ALREADY_DISPATCHED",
          reason: "already_dispatched",
          scheduledFor: input.evaluation.scheduledFor.toISOString(),
        };
      }

      throw error;
    }

    try {
      const thread = await this.ensureThread({
        actor: input.actor,
        tenantId: input.tenantId,
        appointment: input.appointment,
        contact: input.evaluation.contact!,
        integrationConnection: input.evaluation.integrationConnection!,
        existingThread: input.evaluation.thread,
        dispatchId: dispatch.id,
      });

      const outbound = await this.messageThreadsService.sendAutomatedMessageForTenant(
        input.tenantId,
        thread.id,
        {
          text: input.evaluation.renderedText!,
        },
        {
          correlationId: dispatch.correlationId,
          metadata: {
            origin: "APPOINTMENT_FOLLOW_UP",
            followUpKind: APPOINTMENT_REMINDER_KIND,
            appointmentId: input.appointment.id,
            dispatchId: dispatch.id,
            templateId: input.templateId,
          },
        },
      );

      await this.prisma.appointmentFollowUpDispatch.update({
        where: {
          id: dispatch.id,
        },
        data: {
          status: AppointmentFollowUpDispatchStatus.SENT,
          threadId: thread.id,
          integrationConnectionId: thread.integrationConnectionId,
          messageEventId: outbound.messageEventId,
          dispatchedAt: new Date(),
          errorMessage: null,
        },
      });

      return {
        appointmentId: input.appointment.id,
        patientId: input.appointment.patientId,
        patientContactId: input.evaluation.contact?.id ?? null,
        threadId: thread.id,
        dispatchId: dispatch.id,
        messageEventId: outbound.messageEventId,
        status: "SENT",
        reason: "sent",
        scheduledFor: input.evaluation.scheduledFor.toISOString(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message.slice(0, 255) : "Unknown follow-up error";
      await this.prisma.appointmentFollowUpDispatch.update({
        where: {
          id: dispatch.id,
        },
        data: {
          status: AppointmentFollowUpDispatchStatus.FAILED,
          failedAt: new Date(),
          errorMessage,
        },
      });

      this.logger.warn(
        `Appointment follow-up failed tenant=${input.tenantId} appointment=${input.appointment.id}: ${errorMessage}`,
      );

      return {
        appointmentId: input.appointment.id,
        patientId: input.appointment.patientId,
        patientContactId: input.evaluation.contact?.id ?? null,
        threadId: input.evaluation.thread?.id ?? null,
        dispatchId: dispatch.id,
        messageEventId: null,
        status: "FAILED",
        reason: errorMessage,
        scheduledFor: input.evaluation.scheduledFor.toISOString(),
      };
    }
  }

  private async ensureThread(input: {
    actor: AuthenticatedUser;
    tenantId: string;
    appointment: AppointmentCandidate;
    contact: AppointmentCandidate["patient"]["contacts"][number];
    integrationConnection: {
      id: string;
      provider: string;
      displayName: string;
      externalAccountId: string | null;
      config: Prisma.JsonValue | null;
      status: IntegrationConnectionStatus;
    };
    existingThread: ThreadRecord | null;
    dispatchId: string;
  }): Promise<{
    id: string;
    integrationConnectionId: string;
  }> {
    if (input.existingThread) {
      if (
        input.existingThread.patientId !== input.appointment.patientId ||
        input.existingThread.patientDisplayName !== input.appointment.patient.fullName ||
        input.existingThread.contactDisplayValue !== input.contact.value
      ) {
        await this.prisma.messageThread.update({
          where: {
            id: input.existingThread.id,
          },
          data: {
            patientId: input.appointment.patientId,
            patientDisplayName: input.appointment.patient.fullName,
            contactDisplayValue: input.contact.value,
          },
        });
      }

      return {
        id: input.existingThread.id,
        integrationConnectionId: input.existingThread.integrationConnectionId,
      };
    }

    const existingByUniqueKey = await this.prisma.messageThread.findUnique({
      where: {
        tenantId_integrationConnectionId_channel_normalizedContactValue: {
          tenantId: input.tenantId,
          integrationConnectionId: input.integrationConnection.id,
          channel: MessagingChannel.WHATSAPP,
          normalizedContactValue: input.contact.normalizedValue,
        },
      },
      select: {
        id: true,
        integrationConnectionId: true,
      },
    });

    if (existingByUniqueKey) {
      return existingByUniqueKey;
    }

    const now = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const thread = await tx.messageThread.create({
          data: {
            tenantId: input.tenantId,
            patientId: input.appointment.patientId,
            integrationConnectionId: input.integrationConnection.id,
            channel: MessagingChannel.WHATSAPP,
            status: MessageThreadStatus.OPEN,
            contactDisplayValue: input.contact.value,
            normalizedContactValue: input.contact.normalizedValue,
            patientDisplayName: input.appointment.patient.fullName,
          },
          select: {
            id: true,
            integrationConnectionId: true,
          },
        });

        await tx.messageEvent.create({
          data: {
            tenantId: input.tenantId,
            threadId: thread.id,
            patientId: input.appointment.patientId,
            integrationConnectionId: input.integrationConnection.id,
            direction: MessageEventDirection.SYSTEM,
            eventType: MessageEventType.THREAD_CREATED,
            metadata: {
              source: input.integrationConnection.provider,
              origin: "APPOINTMENT_FOLLOW_UP",
              dispatchId: input.dispatchId,
            },
            occurredAt: now,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.MESSAGING_THREAD_CREATED,
            actor: input.actor,
            tenantId: input.tenantId,
            targetType: "message_thread",
            targetId: thread.id,
            metadata: {
              origin: "APPOINTMENT_FOLLOW_UP",
              dispatchId: input.dispatchId,
            },
          },
          tx,
        );

        return thread;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const concurrentThread = await this.prisma.messageThread.findUnique({
          where: {
            tenantId_integrationConnectionId_channel_normalizedContactValue: {
              tenantId: input.tenantId,
              integrationConnectionId: input.integrationConnection.id,
              channel: MessagingChannel.WHATSAPP,
              normalizedContactValue: input.contact.normalizedValue,
            },
          },
          select: {
            id: true,
            integrationConnectionId: true,
          },
        });

        if (concurrentThread) {
          return concurrentThread;
        }
      }

      throw error;
    }
  }

  private selectContact(
    contacts: AppointmentCandidate["patient"]["contacts"],
  ): {
    contact: AppointmentCandidate["patient"]["contacts"][number] | null;
    reason: CandidateEvaluation["reason"];
  } {
    const messagingContacts = contacts.filter((contact) =>
      [PatientContactType.WHATSAPP, PatientContactType.PHONE].includes(contact.type),
    );

    if (!messagingContacts.length) {
      return {
        contact: null,
        reason: "no_contact",
      };
    }

    const enabledContacts = messagingContacts.filter(
      (contact) => contact.allowAutomatedMessaging,
    );

    if (!enabledContacts.length) {
      return {
        contact: messagingContacts[0] ?? null,
        reason: "automated_messaging_opted_out",
      };
    }

    const preferred =
      enabledContacts.find(
        (contact) =>
          contact.type === PatientContactType.WHATSAPP && contact.isPrimary,
      ) ??
      enabledContacts.find((contact) => contact.type === PatientContactType.WHATSAPP) ??
      enabledContacts[0] ??
      null;

    return {
      contact: preferred,
      reason: preferred ? "eligible" : "no_contact",
    };
  }

  private async resolveThreadForContact(
    tenantId: string,
    normalizedContactValue: string,
  ): Promise<{
    thread: ThreadRecord | null;
    integrationConnection: {
      id: string;
      provider: string;
      displayName: string;
      externalAccountId: string | null;
      config: Prisma.JsonValue | null;
      status: IntegrationConnectionStatus;
    } | null;
    reason: CandidateEvaluation["reason"];
  }> {
    const threads = await this.prisma.messageThread.findMany({
      where: {
        tenantId,
        channel: MessagingChannel.WHATSAPP,
        normalizedContactValue,
      },
      include: {
        integrationConnection: true,
        handoffRequests: {
          where: {
            status: {
              in: [HandoffStatus.OPEN, HandoffStatus.ASSIGNED],
            },
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 5,
    });

    const activeThreads = threads.filter(
      (thread) =>
        thread.integrationConnection.status === IntegrationConnectionStatus.ACTIVE,
    );

    if (activeThreads.length > 1) {
      return {
        thread: null,
        integrationConnection: null,
        reason: "ambiguous_existing_threads",
      };
    }

    const thread = activeThreads[0] ?? null;

    if (!thread) {
      return {
        thread: null,
        integrationConnection: null,
        reason: "eligible",
      };
    }

    if (thread.handoffRequests.length > 0) {
      return {
        thread,
        integrationConnection: thread.integrationConnection,
        reason: "active_handoff",
      };
    }

    if (thread.status === MessageThreadStatus.IN_HANDOFF) {
      return {
        thread,
        integrationConnection: thread.integrationConnection,
        reason: "thread_in_handoff_status",
      };
    }

    return {
      thread,
      integrationConnection: thread.integrationConnection,
      reason: "eligible",
    };
  }

  private selectIntegrationConnection(
    activeConnections: Array<{
      id: string;
      provider: string;
      displayName: string;
      externalAccountId: string | null;
      config: Prisma.JsonValue | null;
      status: IntegrationConnectionStatus;
    }>,
  ): {
    integrationConnection: {
      id: string;
      provider: string;
      displayName: string;
      externalAccountId: string | null;
      config: Prisma.JsonValue | null;
      status: IntegrationConnectionStatus;
    } | null;
    reason: CandidateEvaluation["reason"];
  } {
    if (!activeConnections.length) {
      return {
        integrationConnection: null,
        reason: "no_active_integration_connection",
      };
    }

    if (activeConnections.length > 1) {
      return {
        integrationConnection: null,
        reason: "ambiguous_integration_connection",
      };
    }

    return {
      integrationConnection: activeConnections[0] ?? null,
      reason: "eligible",
    };
  }

  private renderTemplate(
    templateBodyText: string,
    variables: Record<string, string>,
  ): string {
    return templateBodyText
      .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
        return variables[key] ?? "";
      })
      .trim();
  }

  private formatDate(value: Date, timezone: string): string {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(value);
  }

  private formatTime(value: Date, timezone: string): string {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(value);
  }

  private buildDispatchKey(appointmentId: string, startsAt: Date): string {
    return `${APPOINTMENT_REMINDER_KIND}:${appointmentId}:${startsAt.toISOString()}`;
  }

  private parseDateTime(value: string, fieldName: string): Date {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid datetime.`);
    }

    return parsed;
  }
}
