import { ConflictException } from "@nestjs/common";
import { ScheduleDayOfWeek, SlotHoldStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AvailabilityService } from "../../src/modules/scheduling/availability.service";
import { buildClinicActor } from "../helpers/actors";

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

function combineUtcDateAndTime(date: string, time: Date): Date {
  const hours = String(time.getUTCHours()).padStart(2, "0");
  const minutes = String(time.getUTCMinutes()).padStart(2, "0");
  const seconds = String(time.getUTCSeconds()).padStart(2, "0");

  return new Date(`${date}T${hours}:${minutes}:${seconds}.000Z`);
}

describe("AvailabilityService", () => {
  const prisma = {
    professionalSchedule: {
      findMany: vi.fn(),
    },
    scheduleBlock: {
      findMany: vi.fn(),
    },
    slotHold: {
      findMany: vi.fn(),
    },
    appointment: {
      findMany: vi.fn(),
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
    calculateAppointmentWindow: vi.fn(),
    assertNoSchedulingConflict: vi.fn(),
    buildOccupancyCandidateRange: vi.fn(),
  };
  const referencesService = {
    assertProfessionalBelongsToTenant: vi.fn(),
    assertUnitBelongsToTenant: vi.fn(),
    assertProfessionalAssignedToUnit: vi.fn(),
    assertPatientBelongsToTenant: vi.fn(),
    getActiveConsultationType: vi.fn(),
  };
  const timezoneService = {
    getCurrentInstant: vi.fn(),
    getDayContextByDateInput: vi.fn(),
    combineDateAndTime: vi.fn(),
    parseIsoInstant: vi.fn(),
  };
  const auditService = {
    record: vi.fn(),
  };

  beforeEach(() => {
    prisma.professionalSchedule.findMany.mockReset();
    prisma.scheduleBlock.findMany.mockReset();
    prisma.slotHold.findMany.mockReset();
    prisma.appointment.findMany.mockReset();
    accessService.resolveActiveTenantId.mockReset();
    concurrencyService.runExclusiveForProfessional.mockReset();
    policiesService.expireStaleHolds.mockReset();
    policiesService.calculateAppointmentWindow.mockReset();
    policiesService.assertNoSchedulingConflict.mockReset();
    policiesService.buildOccupancyCandidateRange.mockReset();
    referencesService.assertProfessionalBelongsToTenant.mockReset();
    referencesService.assertUnitBelongsToTenant.mockReset();
    referencesService.assertProfessionalAssignedToUnit.mockReset();
    referencesService.assertPatientBelongsToTenant.mockReset();
    referencesService.getActiveConsultationType.mockReset();
    timezoneService.getCurrentInstant.mockReset();
    timezoneService.getDayContextByDateInput.mockReset();
    timezoneService.combineDateAndTime.mockReset();
    timezoneService.parseIsoInstant.mockReset();
    auditService.record.mockReset();

    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");
    timezoneService.getCurrentInstant.mockResolvedValue(new Date("2025-01-01T00:00:00.000Z"));
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
      }),
    );
    timezoneService.combineDateAndTime.mockImplementation(
      (date: string, time: Date) => combineUtcDateAndTime(date, time),
    );
    timezoneService.parseIsoInstant.mockImplementation((value: string) => new Date(value));
  });

  it("searches availability from tenant-local day context instead of UTC midnight", async () => {
    const dayContext = {
      timezone: "America/Sao_Paulo",
      date: "2030-03-12",
      dateValue: new Date("2030-03-12T00:00:00.000Z"),
      weekday: ScheduleDayOfWeek.TUESDAY,
      dayStartUtc: new Date("2030-03-12T03:00:00.000Z"),
      dayEndUtcInclusive: new Date("2030-03-13T02:59:59.999Z"),
      dayEndUtcExclusive: new Date("2030-03-13T03:00:00.000Z"),
    };

    timezoneService.getDayContextByDateInput.mockResolvedValue(dayContext);
    policiesService.buildOccupancyCandidateRange.mockReturnValue({
      rangeStart: new Date("2030-03-11T23:00:00.000Z"),
      rangeEnd: new Date("2030-03-13T07:00:00.000Z"),
    });
    referencesService.getActiveConsultationType.mockResolvedValue({
      id: "consultation-1",
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    });
    prisma.professionalSchedule.findMany.mockResolvedValue([
      {
        id: "schedule-1",
        tenantId: "tenant-1",
        professionalId: "professional-1",
        unitId: "unit-1",
        dayOfWeek: ScheduleDayOfWeek.TUESDAY,
        startTime: new Date("1970-01-01T12:00:00.000Z"),
        endTime: new Date("1970-01-01T13:00:00.000Z"),
        slotIntervalMinutes: 30,
        isActive: true,
        validFrom: null,
        validTo: null,
      },
    ]);
    prisma.scheduleBlock.findMany.mockResolvedValue([]);
    prisma.slotHold.findMany.mockResolvedValue([]);
    prisma.appointment.findMany.mockResolvedValue([]);

    const service = new AvailabilityService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      policiesService as never,
      referencesService as never,
      timezoneService as never,
      auditService as never,
    );

    const result = await service.searchAvailability(buildClinicActor(), {
      professionalId: "professional-1",
      consultationTypeId: "consultation-1",
      date: "2030-03-12",
      unitId: "unit-1",
    });

    expect(timezoneService.getDayContextByDateInput).toHaveBeenCalledWith(
      "tenant-1",
      "2030-03-12",
    );
    expect(prisma.slotHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startsAt: { lt: new Date("2030-03-13T07:00:00.000Z") },
          endsAt: { gt: new Date("2030-03-11T23:00:00.000Z") },
        }),
      }),
    );
    expect(result).toHaveLength(2);
    expect(result[0].startsAt.toISOString()).toBe("2030-03-12T12:00:00.000Z");
    expect(result[1].startsAt.toISOString()).toBe("2030-03-12T12:30:00.000Z");
  });

  it("removes slots blocked by active hold occupancy buffers", async () => {
    timezoneService.getDayContextByDateInput.mockResolvedValue({
      timezone: "America/Sao_Paulo",
      date: "2030-03-12",
      dateValue: new Date("2030-03-12T00:00:00.000Z"),
      weekday: ScheduleDayOfWeek.TUESDAY,
      dayStartUtc: new Date("2030-03-12T03:00:00.000Z"),
      dayEndUtcInclusive: new Date("2030-03-13T02:59:59.999Z"),
      dayEndUtcExclusive: new Date("2030-03-13T03:00:00.000Z"),
    });
    policiesService.buildOccupancyCandidateRange.mockReturnValue({
      rangeStart: new Date("2030-03-11T23:00:00.000Z"),
      rangeEnd: new Date("2030-03-13T07:00:00.000Z"),
    });
    referencesService.getActiveConsultationType.mockResolvedValue({
      id: "consultation-1",
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    });
    prisma.professionalSchedule.findMany.mockResolvedValue([
      {
        id: "schedule-1",
        tenantId: "tenant-1",
        professionalId: "professional-1",
        unitId: "unit-1",
        dayOfWeek: ScheduleDayOfWeek.TUESDAY,
        startTime: new Date("1970-01-01T12:00:00.000Z"),
        endTime: new Date("1970-01-01T13:00:00.000Z"),
        slotIntervalMinutes: 30,
        isActive: true,
        validFrom: null,
        validTo: null,
      },
    ]);
    prisma.scheduleBlock.findMany.mockResolvedValue([]);
    prisma.slotHold.findMany.mockResolvedValue([
      {
        startsAt: new Date("2030-03-12T12:30:00.000Z"),
        endsAt: new Date("2030-03-12T13:00:00.000Z"),
        bufferBeforeMinutes: 30,
        bufferAfterMinutes: 0,
      },
    ]);
    prisma.appointment.findMany.mockResolvedValue([]);

    const service = new AvailabilityService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      policiesService as never,
      referencesService as never,
      timezoneService as never,
      auditService as never,
    );

    const result = await service.searchAvailability(buildClinicActor(), {
      professionalId: "professional-1",
      consultationTypeId: "consultation-1",
      date: "2030-03-12",
      unitId: "unit-1",
    });

    expect(result).toHaveLength(0);
  });

  it("creates slot hold with a booking snapshot for duration and buffers", async () => {
    const startsAt = new Date("2030-04-10T13:00:00.000Z");
    const createdHold = {
      id: "hold-1",
      tenantId: "tenant-1",
      patientId: "patient-1",
      professionalId: "professional-1",
      consultationTypeId: "consultation-1",
      unitId: "unit-1",
      room: "101",
      startsAt,
      endsAt: addMinutes(startsAt, 45),
      durationMinutes: 45,
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 5,
      expiresAt: new Date("2030-04-10T13:05:00.000Z"),
      status: SlotHoldStatus.ACTIVE,
      createdByUserId: "user-clinic-1",
      createdAt: new Date("2030-04-01T00:00:00.000Z"),
      updatedAt: new Date("2030-04-01T00:00:00.000Z"),
    };
    const tx = {
      slotHold: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdHold),
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
      durationMinutes: 45,
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 5,
    });

    const service = new AvailabilityService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      policiesService as never,
      referencesService as never,
      timezoneService as never,
      auditService as never,
    );

    await service.createSlotHold(buildClinicActor(), {
      patientId: "patient-1",
      professionalId: "professional-1",
      consultationTypeId: "consultation-1",
      unitId: "unit-1",
      room: "101",
      startsAt: startsAt.toISOString(),
      ttlMinutes: 5,
    });

    expect(tx.slotHold.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          durationMinutes: 45,
          bufferBeforeMinutes: 10,
          bufferAfterMinutes: 5,
        }),
      }),
    );
  });

  it("maps structural occupancy conflicts from slot hold creation to a domain conflict", async () => {
    concurrencyService.runExclusiveForProfessional.mockRejectedValue(
      new Error(
        'conflicting key value violates exclusion constraint "ex_slot_holds_professional_occupancy"',
      ),
    );
    timezoneService.parseIsoInstant.mockReturnValue(
      new Date("2030-04-10T13:00:00.000Z"),
    );

    const service = new AvailabilityService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      policiesService as never,
      referencesService as never,
      timezoneService as never,
      auditService as never,
    );

    await expect(
      service.createSlotHold(buildClinicActor(), {
        professionalId: "professional-1",
        consultationTypeId: "consultation-1",
        startsAt: "2030-04-10T13:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
