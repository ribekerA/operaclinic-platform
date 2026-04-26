import { ConflictException } from "@nestjs/common";
import { AppointmentStatus, RoleCode, SlotHoldStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentsService } from "../../src/modules/scheduling/appointments.service";
import { buildClinicActor } from "../helpers/actors";

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

function buildAppointmentRecord(overrides: Record<string, unknown> = {}) {
  const startsAt = new Date("2030-04-10T13:00:00.000Z");
  const endsAt = addMinutes(startsAt, 30);

  return {
    id: "appointment-1",
    tenantId: "tenant-1",
    patientId: "patient-1",
    professionalId: "professional-1",
    consultationTypeId: "consultation-1",
    unitId: "unit-1",
    slotHoldId: "hold-1",
    room: "101",
    startsAt,
    endsAt,
    durationMinutes: 30,
    bufferBeforeMinutes: 5,
    bufferAfterMinutes: 10,
    status: AppointmentStatus.BOOKED,
    confirmedAt: null,
    checkedInAt: null,
    noShowAt: null,
    idempotencyKey: "idem-1",
    cancellationReason: null,
    notes: "Observation",
    createdByUserId: "user-clinic-1",
    updatedByUserId: "user-clinic-1",
    createdAt: new Date("2030-04-01T00:00:00.000Z"),
    updatedAt: new Date("2030-04-01T00:00:00.000Z"),
    patient: {
      id: "patient-1",
      fullName: "Patient One",
    },
    professional: {
      id: "professional-1",
      fullName: "Professional One",
      displayName: "Dr. One",
    },
    consultationType: {
      id: "consultation-1",
      name: "Consulta",
      durationMinutes: 30,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
    },
    unit: {
      id: "unit-1",
      name: "Main Unit",
    },
    ...overrides,
  };
}

describe("AppointmentsService", () => {
  const prisma = {
    appointment: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  };
  const accessService = {
    resolveActiveTenantId: vi.fn(),
  };
  const concurrencyService = {
    runExclusiveForProfessional: vi.fn(),
  };
  const policiesService = {
    expireStaleHolds: vi.fn(),
    assertNoSchedulingConflict: vi.fn(),
    calculateAppointmentWindow: vi.fn(),
    assertCanReschedule: vi.fn(),
    assertCanCancel: vi.fn(),
    assertCanConfirm: vi.fn(),
    assertCanCheckIn: vi.fn(),
    assertCanMarkNoShow: vi.fn(),
  };
  const referencesService = {
    assertPatientBelongsToTenant: vi.fn(),
    assertProfessionalBelongsToTenant: vi.fn(),
    assertUnitBelongsToTenant: vi.fn(),
    assertProfessionalAssignedToUnit: vi.fn(),
    getActiveConsultationType: vi.fn(),
  };
  const timezoneService = {
    getTenantTimezone: vi.fn(),
    getCurrentInstant: vi.fn(),
    parseIsoInstant: vi.fn(),
  };
  const auditService = {
    record: vi.fn(),
  };

  beforeEach(() => {
    prisma.appointment.findFirst.mockReset();
    prisma.appointment.findUnique.mockReset();
    accessService.resolveActiveTenantId.mockReset();
    concurrencyService.runExclusiveForProfessional.mockReset();
    policiesService.expireStaleHolds.mockReset();
    policiesService.assertNoSchedulingConflict.mockReset();
    policiesService.calculateAppointmentWindow.mockReset();
    policiesService.assertCanReschedule.mockReset();
    policiesService.assertCanCancel.mockReset();
    policiesService.assertCanConfirm.mockReset();
    policiesService.assertCanCheckIn.mockReset();
    policiesService.assertCanMarkNoShow.mockReset();
    referencesService.assertPatientBelongsToTenant.mockReset();
    referencesService.assertProfessionalBelongsToTenant.mockReset();
    referencesService.assertUnitBelongsToTenant.mockReset();
    referencesService.assertProfessionalAssignedToUnit.mockReset();
    referencesService.getActiveConsultationType.mockReset();
    timezoneService.getTenantTimezone.mockReset();
    timezoneService.getCurrentInstant.mockReset();
    timezoneService.parseIsoInstant.mockReset();
    auditService.record.mockReset();

    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");
    timezoneService.getCurrentInstant.mockResolvedValue(new Date("2030-04-10T12:00:00.000Z"));
    timezoneService.parseIsoInstant.mockImplementation((value: string) => new Date(value));
    policiesService.calculateAppointmentWindow.mockImplementation(
      ({
        startsAt,
        durationMinutes,
        bufferBeforeMinutes,
        bufferAfterMinutes,
      }: {
        startsAt: Date;
        durationMinutes: number;
        bufferBeforeMinutes: number;
        bufferAfterMinutes: number;
      }) => ({
        startsAt,
        endsAt: addMinutes(startsAt, durationMinutes),
        occupancyStartsAt: addMinutes(startsAt, -bufferBeforeMinutes),
        occupancyEndsAt: addMinutes(addMinutes(startsAt, durationMinutes), bufferAfterMinutes),
        durationMinutes,
        bufferBeforeMinutes,
        bufferAfterMinutes,
      }),
    );
  });

  it("creates an appointment using the hold booking snapshot and consumes the hold", async () => {
    const startsAt = new Date("2030-04-10T13:00:00.000Z");
    const finalAppointment = buildAppointmentRecord({
      startsAt,
      endsAt: addMinutes(startsAt, 30),
    });
    const tx = {
      appointment: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "appointment-1",
          startsAt,
          endsAt: addMinutes(startsAt, 30),
        }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(finalAppointment),
      },
      slotHold: {
        findFirst: vi.fn().mockResolvedValue({
          id: "hold-1",
          status: SlotHoldStatus.ACTIVE,
          startsAt,
          endsAt: addMinutes(startsAt, 30),
          expiresAt: new Date("2030-04-10T13:10:00.000Z"),
          professionalId: "professional-1",
          consultationTypeId: "consultation-1",
          patientId: "patient-1",
          unitId: "unit-1",
          durationMinutes: 30,
          bufferBeforeMinutes: 5,
          bufferAfterMinutes: 10,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      appointmentStatusHistory: {
        create: vi.fn().mockResolvedValue(null),
      },
    };

    concurrencyService.runExclusiveForProfessional.mockImplementation(
      async (
        tenantId: string,
        professionalId: string,
        operation: (client: typeof tx) => Promise<unknown>,
      ) => {
        expect(tenantId).toBe("tenant-1");
        expect(professionalId).toBe("professional-1");
        return operation(tx);
      },
    );
    referencesService.getActiveConsultationType.mockResolvedValue({
      id: "consultation-1",
      durationMinutes: 60,
      bufferBeforeMinutes: 20,
      bufferAfterMinutes: 15,
    });

    const service = new AppointmentsService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      policiesService as never,
      referencesService as never,
      timezoneService as never,
      auditService as never,
    );

    const result = await service.createAppointment(buildClinicActor(), {
      patientId: "patient-1",
      professionalId: "professional-1",
      consultationTypeId: "consultation-1",
      unitId: "unit-1",
      slotHoldId: "hold-1",
      room: "101",
      notes: "Observation",
      startsAt: startsAt.toISOString(),
      idempotencyKey: "  idem-1  ",
    });

    expect(tx.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: "idem-1",
          slotHoldId: "hold-1",
          durationMinutes: 30,
          bufferBeforeMinutes: 5,
          bufferAfterMinutes: 10,
          status: AppointmentStatus.BOOKED,
        }),
      }),
    );
    expect(tx.slotHold.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "hold-1",
          status: SlotHoldStatus.ACTIVE,
        }),
        data: { status: SlotHoldStatus.CONSUMED },
      }),
    );
    expect(tx.appointmentStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toStatus: AppointmentStatus.BOOKED,
        }),
      }),
    );
    expect(result.id).toBe("appointment-1");
    expect(result.idempotencyKey).toBe("idem-1");
  });

  it("rejects appointment creation when scheduling policies detect a conflict", async () => {
    const startsAt = new Date("2030-04-10T13:00:00.000Z");
    const tx = {
      appointment: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
      slotHold: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
      appointmentStatusHistory: {
        create: vi.fn(),
      },
    };

    concurrencyService.runExclusiveForProfessional.mockImplementation(
      async (
        _tenantId: string,
        _professionalId: string,
        operation: (client: typeof tx) => Promise<unknown>,
      ) => operation(tx),
    );
    referencesService.getActiveConsultationType.mockResolvedValue({
      id: "consultation-1",
      durationMinutes: 30,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
    });
    policiesService.assertNoSchedulingConflict.mockRejectedValue(
      new ConflictException("Requested slot conflicts with another appointment."),
    );

    const service = new AppointmentsService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      policiesService as never,
      referencesService as never,
      timezoneService as never,
      auditService as never,
    );

    await expect(
      service.createAppointment(buildClinicActor(), {
        patientId: "patient-1",
        professionalId: "professional-1",
        consultationTypeId: "consultation-1",
        unitId: "unit-1",
        startsAt: startsAt.toISOString(),
        idempotencyKey: "idem-conflict",
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.appointment.create).not.toHaveBeenCalled();
    expect(tx.appointmentStatusHistory.create).not.toHaveBeenCalled();
  });

  it("rejects idempotency key reuse when the request payload differs", async () => {
    const existingAppointment = buildAppointmentRecord({
      idempotencyKey: "idem-1",
      startsAt: new Date("2030-04-10T13:00:00.000Z"),
    });
    const tx = {
      appointment: {
        findUnique: vi.fn().mockResolvedValue(existingAppointment),
      },
    };

    concurrencyService.runExclusiveForProfessional.mockImplementation(
      async (
        _tenantId: string,
        _professionalId: string,
        operation: (client: typeof tx) => Promise<unknown>,
      ) => operation(tx),
    );

    const service = new AppointmentsService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      policiesService as never,
      referencesService as never,
      timezoneService as never,
      auditService as never,
    );

    await expect(
      service.createAppointment(buildClinicActor(), {
        patientId: "patient-1",
        professionalId: "professional-1",
        consultationTypeId: "consultation-1",
        unitId: "unit-1",
        slotHoldId: "hold-1",
        room: "101",
        notes: "Observation",
        startsAt: "2030-04-10T14:00:00.000Z",
        idempotencyKey: "idem-1",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("maps structural occupancy conflicts on create to a scheduling conflict", async () => {
    concurrencyService.runExclusiveForProfessional.mockRejectedValue(
      new Error(
        'conflicting key value violates exclusion constraint "ex_appointments_professional_occupancy"',
      ),
    );

    const service = new AppointmentsService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      policiesService as never,
      referencesService as never,
      timezoneService as never,
      auditService as never,
    );

    await expect(
      service.createAppointment(buildClinicActor(), {
        patientId: "patient-1",
        professionalId: "professional-1",
        consultationTypeId: "consultation-1",
        unitId: "unit-1",
        startsAt: "2030-04-10T13:00:00.000Z",
        idempotencyKey: "idem-conflict-db",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("reschedules an appointment clearing stale hold linkage and resetting reception flags", async () => {
    const currentAppointment = buildAppointmentRecord({
      status: AppointmentStatus.CONFIRMED,
      confirmedAt: new Date("2030-04-01T10:00:00.000Z"),
      checkedInAt: new Date("2030-04-10T12:50:00.000Z"),
      noShowAt: new Date("2030-04-10T14:00:00.000Z"),
    });
    const newStartsAt = new Date("2030-04-11T15:00:00.000Z");
    const updatedAppointment = buildAppointmentRecord({
      startsAt: newStartsAt,
      endsAt: addMinutes(newStartsAt, 30),
      status: AppointmentStatus.RESCHEDULED,
      slotHoldId: null,
      confirmedAt: null,
      checkedInAt: null,
      noShowAt: null,
    });
    const tx = {
      appointment: {
        findFirst: vi.fn().mockResolvedValue(currentAppointment),
        update: vi.fn().mockResolvedValue(updatedAppointment),
      },
      appointmentStatusHistory: {
        create: vi.fn().mockResolvedValue(null),
      },
    };

    prisma.appointment.findFirst.mockResolvedValue({
      professionalId: "professional-1",
    });
    concurrencyService.runExclusiveForProfessional.mockImplementation(
      async (
        _tenantId: string,
        _professionalId: string,
        operation: (client: typeof tx) => Promise<unknown>,
      ) => operation(tx),
    );

    const service = new AppointmentsService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      policiesService as never,
      referencesService as never,
      timezoneService as never,
      auditService as never,
    );

    const result = await service.rescheduleAppointment(
      buildClinicActor({
        roles: [RoleCode.TENANT_ADMIN],
      }),
      "appointment-1",
      {
        startsAt: newStartsAt.toISOString(),
        unitId: "unit-1",
        room: "201",
        reason: "Patient request",
      },
    );

    expect(tx.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slotHoldId: null,
          status: AppointmentStatus.RESCHEDULED,
          confirmedAt: null,
          checkedInAt: null,
          noShowAt: null,
        }),
      }),
    );
    expect(tx.appointmentStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: AppointmentStatus.CONFIRMED,
          toStatus: AppointmentStatus.RESCHEDULED,
        }),
      }),
    );
    expect(result.status).toBe(AppointmentStatus.RESCHEDULED);
    expect(result.slotHoldId).toBeNull();
  });

  it("maps structural occupancy conflicts on reschedule to a scheduling conflict", async () => {
    prisma.appointment.findFirst.mockResolvedValue({
      professionalId: "professional-1",
    });
    concurrencyService.runExclusiveForProfessional.mockRejectedValue(
      new Error(
        'conflicting key value violates exclusion constraint "ex_appointments_professional_occupancy"',
      ),
    );

    const service = new AppointmentsService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      policiesService as never,
      referencesService as never,
      timezoneService as never,
      auditService as never,
    );

    await expect(
      service.rescheduleAppointment(buildClinicActor(), "appointment-1", {
        startsAt: "2030-04-11T15:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("cancels an appointment preserving history and cancel reason", async () => {
    const currentAppointment = buildAppointmentRecord({
      status: AppointmentStatus.BOOKED,
    });
    const canceledAppointment = buildAppointmentRecord({
      status: AppointmentStatus.CANCELED,
      cancellationReason: "Paciente desistiu",
      checkedInAt: null,
      noShowAt: null,
    });
    const tx = {
      appointment: {
        findFirst: vi.fn().mockResolvedValue(currentAppointment),
        update: vi.fn().mockResolvedValue(canceledAppointment),
      },
      appointmentStatusHistory: {
        create: vi.fn().mockResolvedValue(null),
      },
    };
    prisma.appointment.findFirst.mockResolvedValue({
      professionalId: "professional-1",
    });
    concurrencyService.runExclusiveForProfessional.mockImplementation(
      async (
        _tenantId: string,
        _professionalId: string,
        operation: (client: typeof tx) => Promise<unknown>,
      ) => operation(tx),
    );

    const service = new AppointmentsService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      policiesService as never,
      referencesService as never,
      timezoneService as never,
      auditService as never,
    );

    const result = await service.cancelAppointment(buildClinicActor(), "appointment-1", {
      reason: "Paciente desistiu",
    });

    expect(tx.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AppointmentStatus.CANCELED,
          cancellationReason: "Paciente desistiu",
        }),
      }),
    );
    expect(tx.appointmentStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: AppointmentStatus.BOOKED,
          toStatus: AppointmentStatus.CANCELED,
          reason: "Paciente desistiu",
        }),
      }),
    );
    expect(result.status).toBe(AppointmentStatus.CANCELED);
    expect(result.cancellationReason).toBe("Paciente desistiu");
  });

  it("checks in an appointment using tenant timezone and appends status history", async () => {
    const currentAppointment = buildAppointmentRecord({
      status: AppointmentStatus.CONFIRMED,
      confirmedAt: new Date("2030-04-10T12:30:00.000Z"),
    });
    const checkedInAppointment = buildAppointmentRecord({
      status: AppointmentStatus.CHECKED_IN,
      confirmedAt: currentAppointment.confirmedAt,
      checkedInAt: new Date("2030-04-10T12:55:00.000Z"),
    });
    const tx = {
      appointment: {
        findFirst: vi.fn().mockResolvedValue(currentAppointment),
        update: vi.fn().mockResolvedValue(checkedInAppointment),
      },
      appointmentStatusHistory: {
        create: vi.fn().mockResolvedValue(null),
      },
    };

    prisma.appointment.findFirst.mockResolvedValue({
      professionalId: "professional-1",
    });
    concurrencyService.runExclusiveForProfessional.mockImplementation(
      async (
        _tenantId: string,
        _professionalId: string,
        operation: (client: typeof tx) => Promise<unknown>,
      ) => operation(tx),
    );
    timezoneService.getTenantTimezone.mockResolvedValue("America/Sao_Paulo");

    const service = new AppointmentsService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      policiesService as never,
      referencesService as never,
      timezoneService as never,
      auditService as never,
    );

    const result = await service.checkInAppointment(
      buildClinicActor(),
      "appointment-1",
      "Paciente na recepcao",
    );

    expect(timezoneService.getTenantTimezone).toHaveBeenCalledWith("tenant-1", tx);
    expect(policiesService.assertCanCheckIn).toHaveBeenCalledWith(
      {
        status: AppointmentStatus.CONFIRMED,
        startsAt: currentAppointment.startsAt,
      },
      "America/Sao_Paulo",
      new Date("2030-04-10T12:00:00.000Z"),
    );
    expect(tx.appointmentStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: AppointmentStatus.CONFIRMED,
          toStatus: AppointmentStatus.CHECKED_IN,
          reason: "Paciente na recepcao",
        }),
      }),
    );
    expect(result.status).toBe(AppointmentStatus.CHECKED_IN);
  });

  it("confirms an appointment appending status history for the operational transition", async () => {
    const currentAppointment = buildAppointmentRecord({
      status: AppointmentStatus.BOOKED,
      confirmedAt: null,
    });
    const confirmedAppointment = buildAppointmentRecord({
      status: AppointmentStatus.CONFIRMED,
      confirmedAt: new Date("2030-04-10T12:30:00.000Z"),
    });
    const tx = {
      appointment: {
        findFirst: vi.fn().mockResolvedValue(currentAppointment),
        update: vi.fn().mockResolvedValue(confirmedAppointment),
      },
      appointmentStatusHistory: {
        create: vi.fn().mockResolvedValue(null),
      },
    };

    prisma.appointment.findFirst.mockResolvedValue({
      professionalId: "professional-1",
    });
    concurrencyService.runExclusiveForProfessional.mockImplementation(
      async (
        _tenantId: string,
        _professionalId: string,
        operation: (client: typeof tx) => Promise<unknown>,
      ) => operation(tx),
    );

    const service = new AppointmentsService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      policiesService as never,
      referencesService as never,
      timezoneService as never,
      auditService as never,
    );

    const result = await service.confirmAppointment(
      buildClinicActor(),
      "appointment-1",
      "Ligacao realizada pela recepcao",
    );

    expect(tx.appointmentStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: AppointmentStatus.BOOKED,
          toStatus: AppointmentStatus.CONFIRMED,
          reason: "Ligacao realizada pela recepcao",
        }),
      }),
    );
    expect(result.status).toBe(AppointmentStatus.CONFIRMED);
  });

  it("marks an appointment as no-show appending status history for the operational transition", async () => {
    const currentAppointment = buildAppointmentRecord({
      status: AppointmentStatus.CONFIRMED,
      confirmedAt: new Date("2030-04-10T12:30:00.000Z"),
    });
    const noShowAppointment = buildAppointmentRecord({
      status: AppointmentStatus.NO_SHOW,
      noShowAt: new Date("2030-04-10T14:00:00.000Z"),
    });
    const tx = {
      appointment: {
        findFirst: vi.fn().mockResolvedValue(currentAppointment),
        update: vi.fn().mockResolvedValue(noShowAppointment),
      },
      appointmentStatusHistory: {
        create: vi.fn().mockResolvedValue(null),
      },
    };

    prisma.appointment.findFirst.mockResolvedValue({
      professionalId: "professional-1",
    });
    concurrencyService.runExclusiveForProfessional.mockImplementation(
      async (
        _tenantId: string,
        _professionalId: string,
        operation: (client: typeof tx) => Promise<unknown>,
      ) => operation(tx),
    );

    const service = new AppointmentsService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      policiesService as never,
      referencesService as never,
      timezoneService as never,
      auditService as never,
    );

    const result = await service.markAppointmentAsNoShow(
      buildClinicActor(),
      "appointment-1",
      "Paciente nao compareceu",
    );

    expect(tx.appointmentStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: AppointmentStatus.CONFIRMED,
          toStatus: AppointmentStatus.NO_SHOW,
          reason: "Paciente nao compareceu",
        }),
      }),
    );
    expect(result.status).toBe(AppointmentStatus.NO_SHOW);
  });
});
