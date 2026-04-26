import { AppointmentStatus, IntegrationConnectionStatus, PatientContactType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppointmentFollowUpsService,
} from "../../src/modules/follow-ups/appointment-follow-ups.service";
import { buildClinicActor } from "../helpers/actors";

function buildAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: "appointment-1",
    tenantId: "tenant-1",
    patientId: "patient-1",
    professionalId: "professional-1",
    consultationTypeId: "consultation-type-1",
    unitId: "unit-1",
    slotHoldId: null,
    room: null,
    startsAt: new Date("2026-04-05T10:00:00.000Z"),
    endsAt: new Date("2026-04-05T10:30:00.000Z"),
    durationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    status: AppointmentStatus.BOOKED,
    confirmedAt: null,
    checkedInAt: null,
    calledAt: null,
    startedAt: null,
    closureReadyAt: null,
    awaitingPaymentAt: null,
    completedAt: null,
    noShowAt: null,
    idempotencyKey: "idem-1",
    cancellationReason: null,
    notes: null,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: new Date("2026-04-04T09:00:00.000Z"),
    updatedAt: new Date("2026-04-04T09:00:00.000Z"),
    patient: {
      id: "patient-1",
      fullName: "Paciente Aurora",
      contacts: [
        {
          id: "contact-1",
          type: PatientContactType.WHATSAPP,
          value: "+55 11 99999-0000",
          normalizedValue: "5511999990000",
          isPrimary: true,
          allowAutomatedMessaging: true,
          automatedMessagingOptedOutAt: null,
        },
      ],
    },
    professional: {
      fullName: "Dra. Julia Costa",
      displayName: "Dra. Julia",
    },
    unit: {
      name: "Unidade Jardins",
    },
    ...overrides,
  };
}

describe("AppointmentFollowUpsService", () => {
  const prisma = {
    messageTemplate: {
      findFirst: vi.fn(),
    },
    integrationConnection: {
      findMany: vi.fn(),
    },
    appointment: {
      findMany: vi.fn(),
    },
    appointmentFollowUpDispatch: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    messageThread: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    messageEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const accessService = {
    resolveActiveTenantId: vi.fn(),
  };
  const timezoneService = {
    getCurrentInstant: vi.fn(),
    getTenantTimezone: vi.fn(),
  };
  const messageThreadsService = {
    sendAutomatedMessageForTenant: vi.fn(),
  };
  const auditService = {
    record: vi.fn(),
  };
  const observability = {
    recordFlow: vi.fn(),
  };

  beforeEach(() => {
    prisma.messageTemplate.findFirst.mockReset();
    prisma.integrationConnection.findMany.mockReset();
    prisma.appointment.findMany.mockReset();
    prisma.appointmentFollowUpDispatch.findMany.mockReset();
    prisma.appointmentFollowUpDispatch.create.mockReset();
    prisma.appointmentFollowUpDispatch.update.mockReset();
    prisma.messageThread.findMany.mockReset();
    prisma.messageThread.findUnique.mockReset();
    prisma.messageThread.create.mockReset();
    prisma.messageThread.update.mockReset();
    prisma.messageEvent.create.mockReset();
    prisma.$transaction.mockReset();
    accessService.resolveActiveTenantId.mockReset();
    timezoneService.getCurrentInstant.mockReset();
    timezoneService.getTenantTimezone.mockReset();
    messageThreadsService.sendAutomatedMessageForTenant.mockReset();
    auditService.record.mockReset();
    observability.recordFlow.mockReset();

    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");
    timezoneService.getCurrentInstant.mockResolvedValue(
      new Date("2026-04-04T10:00:00.000Z"),
    );
    timezoneService.getTenantTimezone.mockResolvedValue("America/Sao_Paulo");
    prisma.messageTemplate.findFirst.mockResolvedValue({
      id: "template-1",
      bodyText:
        "Oi {{patientName}}, seu atendimento esta marcado para {{appointmentDate}} as {{appointmentTime}} com {{professionalName}}.",
    });
    prisma.integrationConnection.findMany.mockResolvedValue([
      {
        id: "connection-1",
        provider: "WHATSAPP_META",
        displayName: "WhatsApp Principal",
        externalAccountId: "meta-1",
        config: null,
        status: IntegrationConnectionStatus.ACTIVE,
      },
    ]);
    prisma.messageThread.findMany.mockResolvedValue([]);
  });

  it("supports dry-run with eligible, opted-out and already-dispatched appointments", async () => {
    prisma.appointment.findMany.mockResolvedValue([
      buildAppointment(),
      buildAppointment({
        id: "appointment-2",
        patientId: "patient-2",
        startsAt: new Date("2026-04-05T10:10:00.000Z"),
        patient: {
          id: "patient-2",
          fullName: "Paciente Opt-out",
          contacts: [
            {
              id: "contact-2",
              type: PatientContactType.WHATSAPP,
              value: "+55 11 98888-0000",
              normalizedValue: "5511988880000",
              isPrimary: true,
              allowAutomatedMessaging: false,
              automatedMessagingOptedOutAt: new Date("2026-04-04T08:00:00.000Z"),
            },
          ],
        },
      }),
      buildAppointment({
        id: "appointment-3",
        patientId: "patient-3",
        startsAt: new Date("2026-04-05T10:20:00.000Z"),
      }),
    ]);
    prisma.appointmentFollowUpDispatch.findMany.mockResolvedValue([
      {
        dispatchKey:
          "APPOINTMENT_REMINDER_24H:appointment-3:2026-04-05T10:20:00.000Z",
      },
    ]);

    const service = new AppointmentFollowUpsService(
      prisma as never,
      accessService as never,
      timezoneService as never,
      messageThreadsService as never,
      auditService as never,
      observability as never,
    );

    const result = await service.runAppointmentReminder24h(buildClinicActor(), {
      templateId: "template-1",
      dryRun: true,
      runAt: "2026-04-04T10:00:00.000Z",
      windowMinutes: 30,
      limit: 10,
    });

    expect(result.summary).toEqual({
      scannedAppointments: 3,
      eligibleAppointments: 1,
      alreadyDispatched: 1,
      skippedAppointments: 1,
      sentAppointments: 0,
      failedAppointments: 0,
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        appointmentId: "appointment-1",
        status: "ELIGIBLE",
      }),
      expect.objectContaining({
        appointmentId: "appointment-2",
        status: "SKIPPED",
        reason: "automated_messaging_opted_out",
      }),
      expect.objectContaining({
        appointmentId: "appointment-3",
        status: "ALREADY_DISPATCHED",
      }),
    ]);
    expect(prisma.appointmentFollowUpDispatch.create).not.toHaveBeenCalled();
    expect(messageThreadsService.sendAutomatedMessageForTenant).not.toHaveBeenCalled();
  });

  it("creates a dispatch ledger row, provisions a thread and sends the reminder", async () => {
    prisma.appointment.findMany.mockResolvedValue([buildAppointment()]);
    prisma.appointmentFollowUpDispatch.findMany.mockResolvedValue([]);
    prisma.appointmentFollowUpDispatch.create.mockResolvedValue({
      id: "dispatch-1",
      correlationId: "corr-1",
    });
    prisma.appointmentFollowUpDispatch.update.mockResolvedValue({ id: "dispatch-1" });
    prisma.messageThread.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (operation: (client: any) => Promise<unknown>) =>
      operation({
        messageThread: {
          create: vi.fn().mockResolvedValue({
            id: "thread-1",
            integrationConnectionId: "connection-1",
          }),
        },
        messageEvent: {
          create: vi.fn().mockResolvedValue({ id: "event-thread-created" }),
        },
      }),
    );
    messageThreadsService.sendAutomatedMessageForTenant.mockResolvedValue({
      thread: {
        id: "thread-1",
      },
      messageEventId: "event-1",
    });

    const service = new AppointmentFollowUpsService(
      prisma as never,
      accessService as never,
      timezoneService as never,
      messageThreadsService as never,
      auditService as never,
      observability as never,
    );

    const result = await service.runAppointmentReminder24h(buildClinicActor(), {
      templateId: "template-1",
      dryRun: false,
      runAt: "2026-04-04T10:00:00.000Z",
      windowMinutes: 30,
      limit: 10,
    });

    expect(prisma.appointmentFollowUpDispatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          appointmentId: "appointment-1",
          patientContactId: "contact-1",
          kind: "APPOINTMENT_REMINDER_24H",
        }),
      }),
    );
    expect(messageThreadsService.sendAutomatedMessageForTenant).toHaveBeenCalledWith(
      "tenant-1",
      "thread-1",
      expect.objectContaining({
        text: expect.stringContaining("Paciente Aurora"),
      }),
      expect.objectContaining({
        correlationId: "corr-1",
        metadata: expect.objectContaining({
          origin: "APPOINTMENT_FOLLOW_UP",
          appointmentId: "appointment-1",
          dispatchId: "dispatch-1",
        }),
      }),
    );
    expect(prisma.appointmentFollowUpDispatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "dispatch-1",
        },
        data: expect.objectContaining({
          status: "SENT",
          threadId: "thread-1",
          messageEventId: "event-1",
        }),
      }),
    );
    expect(result.summary.sentAppointments).toBe(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        appointmentId: "appointment-1",
        threadId: "thread-1",
        dispatchId: "dispatch-1",
        messageEventId: "event-1",
        status: "SENT",
      }),
    );
  });
});
