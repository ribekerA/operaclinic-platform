import { BadRequestException } from "@nestjs/common";
import { AppointmentStatus, PatientContactType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReceptionService } from "../../src/modules/reception/reception.service";
import { buildClinicActor } from "../helpers/actors";

describe("ReceptionService", () => {
  const prisma = {
    appointment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  const accessService = {
    resolveActiveTenantId: vi.fn(),
  };
  const timezoneService = {
    getTenantTimezone: vi.fn(),
    getCurrentInstant: vi.fn(),
    getTenantDateKey: vi.fn(),
    buildDayContext: vi.fn(),
  };
  const availabilityService = {
    searchAvailability: vi.fn(),
  };
  const appointmentsService = {
    createAppointment: vi.fn(),
    rescheduleAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
    confirmAppointment: vi.fn(),
    checkInAppointment: vi.fn(),
    markAppointmentAsNoShow: vi.fn(),
    finalizeAppointment: vi.fn(),
  };
  const patientsService = {
    listPatients: vi.fn(),
  };

  beforeEach(() => {
    prisma.appointment.findMany.mockReset();
    prisma.appointment.findFirst.mockReset();
    accessService.resolveActiveTenantId.mockReset();
    timezoneService.getTenantTimezone.mockReset();
    timezoneService.getCurrentInstant.mockReset();
    timezoneService.getTenantDateKey.mockReset();
    timezoneService.buildDayContext.mockReset();
    availabilityService.searchAvailability.mockReset();
    appointmentsService.createAppointment.mockReset();
    appointmentsService.rescheduleAppointment.mockReset();
    appointmentsService.cancelAppointment.mockReset();
    appointmentsService.confirmAppointment.mockReset();
    appointmentsService.checkInAppointment.mockReset();
    appointmentsService.markAppointmentAsNoShow.mockReset();
    appointmentsService.finalizeAppointment.mockReset();
    patientsService.listPatients.mockReset();

    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");
    timezoneService.getTenantTimezone.mockResolvedValue("America/Sao_Paulo");
    timezoneService.getTenantDateKey.mockReturnValue("2030-04-10");
    timezoneService.buildDayContext.mockReturnValue({
      timezone: "America/Sao_Paulo",
      date: "2030-04-10",
      dateValue: new Date("2030-04-10T00:00:00.000Z"),
      weekday: "WEDNESDAY",
      dayStartUtc: new Date("2030-04-10T03:00:00.000Z"),
      dayEndUtcInclusive: new Date("2030-04-11T02:59:59.999Z"),
      dayEndUtcExclusive: new Date("2030-04-11T03:00:00.000Z"),
    });
  });

  it("builds the operational dashboard for the tenant-local day", async () => {
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: "appointment-booked",
        tenantId: "tenant-1",
        patientId: "patient-1",
        professionalId: "professional-1",
        consultationTypeId: "consultation-1",
        unitId: "unit-1",
        room: "101",
        startsAt: new Date("2030-04-10T13:00:00.000Z"),
        endsAt: new Date("2030-04-10T13:30:00.000Z"),
        status: AppointmentStatus.BOOKED,
        confirmedAt: null,
        checkedInAt: null,
        cancellationReason: null,
        patient: {
          fullName: "Patient One",
          contacts: [
            {
              value: "+55 11 99999-9999",
            },
          ],
        },
        professional: {
          fullName: "Professional One",
          displayName: "Dr. One",
        },
        consultationType: {
          name: "Consulta",
        },
        unit: {
          name: "Unidade Centro",
        },
        statusHistory: [],
      },
      {
        id: "appointment-checked-in",
        tenantId: "tenant-1",
        patientId: "patient-2",
        professionalId: "professional-1",
        consultationTypeId: "consultation-1",
        unitId: "unit-1",
        room: "102",
        startsAt: new Date("2030-04-10T14:00:00.000Z"),
        endsAt: new Date("2030-04-10T14:30:00.000Z"),
        status: AppointmentStatus.CHECKED_IN,
        confirmedAt: new Date("2030-04-10T13:45:00.000Z"),
        checkedInAt: new Date("2030-04-10T13:55:00.000Z"),
        cancellationReason: null,
        patient: {
          fullName: "Patient Two",
          contacts: [],
        },
        professional: {
          fullName: "Professional One",
          displayName: "Dr. One",
        },
        consultationType: {
          name: "Consulta",
        },
        unit: {
          name: "Unidade Centro",
        },
        statusHistory: [],
      },
      {
        id: "appointment-no-show",
        tenantId: "tenant-1",
        patientId: "patient-3",
        professionalId: "professional-1",
        consultationTypeId: "consultation-1",
        unitId: "unit-1",
        room: "103",
        startsAt: new Date("2030-04-10T15:00:00.000Z"),
        endsAt: new Date("2030-04-10T15:30:00.000Z"),
        status: AppointmentStatus.NO_SHOW,
        confirmedAt: null,
        checkedInAt: null,
        cancellationReason: null,
        patient: {
          fullName: "Patient Three",
          contacts: [],
        },
        professional: {
          fullName: "Professional One",
          displayName: "Dr. One",
        },
        consultationType: {
          name: "Consulta",
        },
        unit: {
          name: "Unidade Centro",
        },
        statusHistory: [],
      },
    ]);

    const service = new ReceptionService(
      prisma as never,
      accessService as never,
      timezoneService as never,
      availabilityService as never,
      appointmentsService as never,
      patientsService as never,
    );

    const result = await service.getDashboard(buildClinicActor(), {});

    expect(timezoneService.getTenantTimezone).toHaveBeenCalledWith("tenant-1");
    expect(timezoneService.getTenantDateKey).toHaveBeenCalled();
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
          startsAt: {
            gte: new Date("2030-04-10T03:00:00.000Z"),
            lt: new Date("2030-04-11T03:00:00.000Z"),
          },
        }),
      }),
    );
    expect(result.timezone).toBe("America/Sao_Paulo");
    expect(result.date).toBe("2030-04-10");
    expect(result.totals.totalAppointments).toBe(3);
    expect(result.totals.pendingConfirmation).toBe(1);
    expect(result.totals.checkedIn).toBe(1);
    expect(result.totals.noShow).toBe(1);
    expect(result.queue).toHaveLength(1);
  });

  it("applies agenda filters and returns appointment rows", async () => {
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: "appointment-1",
        tenantId: "tenant-1",
        patientId: "patient-1",
        professionalId: "professional-7",
        consultationTypeId: "consultation-2",
        unitId: "unit-9",
        room: null,
        startsAt: new Date("2030-04-10T13:00:00.000Z"),
        endsAt: new Date("2030-04-10T13:30:00.000Z"),
        status: AppointmentStatus.CONFIRMED,
        confirmedAt: new Date("2030-04-10T12:00:00.000Z"),
        checkedInAt: null,
        cancellationReason: null,
        patient: {
          fullName: "Patient One",
          contacts: [],
        },
        professional: {
          fullName: "Professional Seven",
          displayName: "Dr. Seven",
        },
        consultationType: {
          name: "Retorno",
        },
        unit: {
          name: "Unidade Norte",
        },
        statusHistory: [],
      },
    ]);

    const service = new ReceptionService(
      prisma as never,
      accessService as never,
      timezoneService as never,
      availabilityService as never,
      appointmentsService as never,
      patientsService as never,
    );

    const result = await service.getDayAgenda(buildClinicActor(), {
      date: "2030-04-10",
      professionalId: "professional-7",
      unitId: "unit-9",
    });

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          professionalId: "professional-7",
          unitId: "unit-9",
        }),
      }),
    );
    expect(result.appointments).toHaveLength(1);
    expect(result.appointments[0].professionalName).toBe("Dr. Seven");
  });

  it("searches patients through the real patients module with active filter enforced", async () => {
    patientsService.listPatients.mockResolvedValue([
      {
        id: "patient-1",
        fullName: "Patient One",
        birthDate: new Date("1990-01-01T00:00:00.000Z"),
        documentNumber: "12345678900",
        notes: null,
        isActive: true,
        contacts: [
          {
            id: "contact-1",
            type: PatientContactType.WHATSAPP,
            value: "+55 11 99999-9999",
            normalizedValue: "5511999999999",
            isPrimary: true,
          },
        ],
      },
    ]);

    const service = new ReceptionService(
      prisma as never,
      accessService as never,
      timezoneService as never,
      availabilityService as never,
      appointmentsService as never,
      patientsService as never,
    );

    const result = await service.searchPatients(buildClinicActor(), {
      search: "Patient",
      contactValue: "99999",
      limit: "10",
    });

    expect(patientsService.listPatients).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        search: "Patient",
        contactValue: "99999",
        limit: "10",
        isActive: "true",
      }),
    );
    expect(result[0].contacts[0].type).toBe("WHATSAPP");
  });

  it("delegates operational status updates to the scheduling-backed actions", async () => {
    const detailedAppointment = {
      id: "appointment-1",
      tenantId: "tenant-1",
      patientId: "patient-1",
      professionalId: "professional-1",
      consultationTypeId: "consultation-1",
      unitId: "unit-1",
      slotHoldId: null,
      room: null,
      startsAt: new Date("2030-04-10T13:00:00.000Z"),
      endsAt: new Date("2030-04-10T13:30:00.000Z"),
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      status: AppointmentStatus.CHECKED_IN,
      confirmedAt: new Date("2030-04-10T12:00:00.000Z"),
      checkedInAt: new Date("2030-04-10T12:55:00.000Z"),
      cancellationReason: null,
      idempotencyKey: "idem-1",
      notes: null,
      createdAt: new Date("2030-04-01T00:00:00.000Z"),
      updatedAt: new Date("2030-04-10T12:55:00.000Z"),
      patient: {
        id: "patient-1",
        fullName: "Patient One",
        birthDate: null,
        documentNumber: null,
        notes: null,
        isActive: true,
        contacts: [],
      },
      professional: {
        fullName: "Professional One",
        displayName: "Dr. One",
      },
      consultationType: {
        name: "Consulta",
        id: "consultation-1",
        durationMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
      },
      unit: {
        id: "unit-1",
        name: "Unidade Centro",
      },
      statusHistory: [],
    };

    appointmentsService.checkInAppointment.mockResolvedValue({
      id: "appointment-1",
    });
    prisma.appointment.findFirst.mockResolvedValue(detailedAppointment);

    const service = new ReceptionService(
      prisma as never,
      accessService as never,
      timezoneService as never,
      availabilityService as never,
      appointmentsService as never,
      patientsService as never,
    );

    const result = await service.updateAppointmentStatus(buildClinicActor(), "appointment-1", {
      status: "checked_in",
      reason: "Paciente chegou",
    });

    expect(appointmentsService.checkInAppointment).toHaveBeenCalledWith(
      expect.anything(),
      "appointment-1",
      "Paciente chegou",
    );
    expect(result.status).toBe("CHECKED_IN");
  });

  it("delegates completion updates to the scheduling finalize action", async () => {
    appointmentsService.finalizeAppointment.mockResolvedValue({
      id: "appointment-1",
    });
    prisma.appointment.findFirst.mockResolvedValue({
      id: "appointment-1",
      tenantId: "tenant-1",
      patientId: "patient-1",
      professionalId: "professional-1",
      consultationTypeId: "consultation-1",
      unitId: "unit-1",
      slotHoldId: null,
      room: null,
      startsAt: new Date("2030-04-10T13:00:00.000Z"),
      endsAt: new Date("2030-04-10T13:30:00.000Z"),
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      status: AppointmentStatus.COMPLETED,
      confirmedAt: new Date("2030-04-10T12:00:00.000Z"),
      checkedInAt: new Date("2030-04-10T12:55:00.000Z"),
      cancellationReason: null,
      idempotencyKey: "idem-1",
      notes: null,
      createdAt: new Date("2030-04-01T00:00:00.000Z"),
      updatedAt: new Date("2030-04-10T12:55:00.000Z"),
      patient: {
        id: "patient-1",
        fullName: "Patient One",
        birthDate: null,
        documentNumber: null,
        notes: null,
        isActive: true,
        contacts: [],
      },
      professional: {
        fullName: "Professional One",
        displayName: "Dr. One",
      },
      consultationType: {
        name: "Consulta",
        id: "consultation-1",
        durationMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
      },
      unit: {
        id: "unit-1",
        name: "Unidade Centro",
      },
      statusHistory: [],
    });

    const service = new ReceptionService(
      prisma as never,
      accessService as never,
      timezoneService as never,
      availabilityService as never,
      appointmentsService as never,
      patientsService as never,
    );

    const result = await service.updateAppointmentStatus(
      buildClinicActor(),
      "appointment-1",
      {
        status: "COMPLETED",
        reason: "Pagamento confirmado",
      },
    );

    expect(appointmentsService.finalizeAppointment).toHaveBeenCalledWith(
      expect.anything(),
      "appointment-1",
      "Pagamento confirmado",
    );
    expect(result.status).toBe("COMPLETED");
  });
});

describe("ReceptionService — CRITICAL: isolamento de tenant", () => {
  const prisma = {
    appointment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  const accessService = {
    resolveActiveTenantId: vi.fn(),
  };
  const timezoneService = {
    getTenantTimezone: vi.fn(),
    getCurrentInstant: vi.fn(),
    getTenantDateKey: vi.fn(),
    buildDayContext: vi.fn(),
  };
  const availabilityService = { searchAvailability: vi.fn() };
  const appointmentsService = {
    createAppointment: vi.fn(),
    rescheduleAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
    confirmAppointment: vi.fn(),
    checkInAppointment: vi.fn(),
    markAppointmentAsNoShow: vi.fn(),
    finalizeAppointment: vi.fn(),
  };
  const patientsService = { listPatients: vi.fn() };

  function buildService() {
    return new ReceptionService(
      prisma as never,
      accessService as never,
      timezoneService as never,
      availabilityService as never,
      appointmentsService as never,
      patientsService as never,
    );
  }

  beforeEach(() => {
    prisma.appointment.findMany.mockReset();
    prisma.appointment.findFirst.mockReset();
    accessService.resolveActiveTenantId.mockReset();
    timezoneService.getTenantTimezone.mockReset();
    timezoneService.getCurrentInstant.mockReset();
    timezoneService.getTenantDateKey.mockReset();
    timezoneService.buildDayContext.mockReset();
  });

  it("CRITICAL: getAppointmentDetail oculta agendamento de outro tenant — retorna NotFoundException", async () => {
    const { NotFoundException } = await import("@nestjs/common");
    // tenant-2 é o atacante tentando ver agendamento do tenant-1
    accessService.resolveActiveTenantId.mockReturnValue("tenant-2");
    // findFirst retorna null: a query já filtra por tenantId="tenant-2",
    // agendamento pertence a tenant-1, portanto não é encontrado
    prisma.appointment.findFirst.mockResolvedValue(null);

    const service = buildService();

    await expect(
      service.getAppointmentDetail(buildClinicActor(), "appointment-tenant1-secret"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("CRITICAL: getAppointmentDetail sempre envia tenantId do actor na query — nunca permite override externo", async () => {
    const { NotFoundException } = await import("@nestjs/common");
    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");
    prisma.appointment.findFirst.mockResolvedValue(null);

    const service = buildService();

    // Mesmo que o caller envie um appointmentId de outro tenant, o where sempre usa o tenantId do actor
    await expect(
      service.getAppointmentDetail(buildClinicActor(), "appointment-from-tenant-2"),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "appointment-from-tenant-2",
          tenantId: "tenant-1",
        }),
      }),
    );
  });

  it("CRITICAL: getDashboard findMany sempre escopa por tenantId do actor", async () => {
    accessService.resolveActiveTenantId.mockReturnValue("tenant-X");
    timezoneService.getTenantTimezone.mockResolvedValue("America/Sao_Paulo");
      timezoneService.getCurrentInstant.mockResolvedValue(new Date("2030-04-10T12:00:00.000Z"));
    timezoneService.getTenantDateKey.mockReturnValue("2030-04-10");
    timezoneService.buildDayContext.mockReturnValue({
      timezone: "America/Sao_Paulo",
      date: "2030-04-10",
      dateValue: new Date("2030-04-10T00:00:00.000Z"),
      weekday: "WEDNESDAY",
      dayStartUtc: new Date("2030-04-10T03:00:00.000Z"),
      dayEndUtcInclusive: new Date("2030-04-11T02:59:59.999Z"),
      dayEndUtcExclusive: new Date("2030-04-11T03:00:00.000Z"),
    });
    prisma.appointment.findMany.mockResolvedValue([]);

    const service = buildService();
    await service.getDashboard(buildClinicActor(), {});

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-X",
        }),
      }),
    );
  });

  it("CRITICAL: getDayAgenda findMany sempre escopa por tenantId do actor", async () => {
    accessService.resolveActiveTenantId.mockReturnValue("tenant-Y");
    timezoneService.getTenantTimezone.mockResolvedValue("America/Sao_Paulo");
    timezoneService.getTenantDateKey.mockReturnValue("2030-04-10");
    timezoneService.buildDayContext.mockReturnValue({
      timezone: "America/Sao_Paulo",
      date: "2030-04-10",
      dateValue: new Date("2030-04-10T00:00:00.000Z"),
      weekday: "WEDNESDAY",
      dayStartUtc: new Date("2030-04-10T03:00:00.000Z"),
      dayEndUtcInclusive: new Date("2030-04-11T02:59:59.999Z"),
      dayEndUtcExclusive: new Date("2030-04-11T03:00:00.000Z"),
    });
    prisma.appointment.findMany.mockResolvedValue([]);

    const service = buildService();
    await service.getDayAgenda(buildClinicActor(), { date: "2030-04-10" });

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-Y",
        }),
      }),
    );
  });

  it("CRITICAL: dois tenants distintos nao compartilham dados — findMany recebe tenantIds separados por chamada", async () => {
    const service = buildService();
    const dayCtx = {
      timezone: "America/Sao_Paulo",
      date: "2030-04-10",
      dateValue: new Date("2030-04-10T00:00:00.000Z"),
      weekday: "WEDNESDAY",
      dayStartUtc: new Date("2030-04-10T03:00:00.000Z"),
      dayEndUtcInclusive: new Date("2030-04-11T02:59:59.999Z"),
      dayEndUtcExclusive: new Date("2030-04-11T03:00:00.000Z"),
    };

    // Chamada do tenant A
    accessService.resolveActiveTenantId.mockReturnValue("tenant-A");
    timezoneService.getTenantTimezone.mockResolvedValue("America/Sao_Paulo");
    timezoneService.getTenantDateKey.mockReturnValue("2030-04-10");
    timezoneService.buildDayContext.mockReturnValue(dayCtx);
    prisma.appointment.findMany.mockResolvedValue([]);
    await service.getDashboard(buildClinicActor(), {});

    const callA = prisma.appointment.findMany.mock.calls[0][0];
    expect(callA.where.tenantId).toBe("tenant-A");

    // Chamada do tenant B
    prisma.appointment.findMany.mockClear();
    accessService.resolveActiveTenantId.mockReturnValue("tenant-B");
    timezoneService.getTenantTimezone.mockResolvedValue("America/Sao_Paulo");
    timezoneService.getTenantDateKey.mockReturnValue("2030-04-10");
    timezoneService.buildDayContext.mockReturnValue(dayCtx);
    prisma.appointment.findMany.mockResolvedValue([]);
    await service.getDashboard(buildClinicActor(), {});

    const callB = prisma.appointment.findMany.mock.calls[0][0];
    expect(callB.where.tenantId).toBe("tenant-B");

    // Garantia: diferentes
    expect(callA.where.tenantId).not.toBe(callB.where.tenantId);
  });
});
