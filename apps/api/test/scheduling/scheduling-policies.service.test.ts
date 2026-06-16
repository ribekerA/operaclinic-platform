import { BadRequestException, ConflictException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchedulingPoliciesService } from "../../src/modules/scheduling/scheduling-policies.service";

describe("SchedulingPoliciesService", () => {
  const prisma = {
    appointment: {
      findMany: vi.fn(),
    },
    slotHold: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    scheduleBlock: {
      findFirst: vi.fn(),
    },
    professionalSchedule: {
      findMany: vi.fn(),
    },
  };
  const timezoneService = {
    getCurrentInstant: vi.fn(),
    getTenantDateKey: vi.fn(),
    getDayContextByInstant: vi.fn(),
    combineDateAndTime: vi.fn(),
  };

  beforeEach(() => {
    prisma.appointment.findMany.mockReset();
    prisma.slotHold.updateMany.mockReset();
    prisma.slotHold.findMany.mockReset();
    prisma.scheduleBlock.findFirst.mockReset();
    prisma.professionalSchedule.findMany.mockReset();
    timezoneService.getTenantDateKey.mockReset();
    timezoneService.getDayContextByInstant.mockReset();
    timezoneService.combineDateAndTime.mockReset();
  });

  it("rejects buffered overlap with an existing appointment", async () => {
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: "appointment-1",
        startsAt: new Date("2030-03-12T14:00:00.000Z"),
        endsAt: new Date("2030-03-12T14:30:00.000Z"),
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 15,
      },
    ]);
    const service = new SchedulingPoliciesService(
      prisma as never,
      timezoneService as never,
    );

    await expect(
      service.assertNoAppointmentOccupancyConflict({
        tenantId: "tenant-1",
        professionalId: "professional-1",
        occupancyStartsAt: new Date("2030-03-12T14:35:00.000Z"),
        occupancyEndsAt: new Date("2030-03-12T14:50:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  describe("assertNoSchedulingConflict — scheduleOverride", () => {
    const baseConflictInput = {
      tenantId: "tenant-1",
      professionalId: "professional-1",
      startsAt: new Date("2030-03-12T14:00:00.000Z"),
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    };

    beforeEach(() => {
      timezoneService.getDayContextByInstant.mockResolvedValue({
        weekday: "WEDNESDAY",
        date: "2030-03-12",
        dateValue: new Date("2030-03-12"),
        timezone: "America/Sao_Paulo",
        dayStartUtc: new Date("2030-03-12T03:00:00.000Z"),
        dayEndUtcExclusive: new Date("2030-03-13T03:00:00.000Z"),
      });
      prisma.scheduleBlock.findFirst.mockResolvedValue(null);
      prisma.slotHold.findMany.mockResolvedValue([]);
      prisma.appointment.findMany.mockResolvedValue([]);
    });

    it("throws BadRequestException when slot is outside schedule and no override", async () => {
      // No schedule exists for this day → outside schedule
      prisma.professionalSchedule.findMany.mockResolvedValue([]);

      const service = new SchedulingPoliciesService(
        prisma as never,
        timezoneService as never,
      );

      await expect(
        service.assertNoSchedulingConflict(baseConflictInput),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("passes when slot is outside schedule but scheduleOverride=true", async () => {
      // No schedule exists → would normally throw
      prisma.professionalSchedule.findMany.mockResolvedValue([]);

      const service = new SchedulingPoliciesService(
        prisma as never,
        timezoneService as never,
      );

      // Should not throw with override
      await expect(
        service.assertNoSchedulingConflict({
          ...baseConflictInput,
          scheduleOverride: true,
        }),
      ).resolves.toBeUndefined();
    });

    it("still throws ConflictException on appointment conflict even with scheduleOverride=true", async () => {
      prisma.professionalSchedule.findMany.mockResolvedValue([]);
      prisma.appointment.findMany.mockResolvedValue([
        {
          id: "conflict-appt",
          startsAt: new Date("2030-03-12T14:00:00.000Z"),
          endsAt: new Date("2030-03-12T14:30:00.000Z"),
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
        },
      ]);

      const service = new SchedulingPoliciesService(
        prisma as never,
        timezoneService as never,
      );

      await expect(
        service.assertNoSchedulingConflict({
          ...baseConflictInput,
          scheduleOverride: true,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it("rejects overlap against an active hold using the hold occupancy buffers", async () => {
    prisma.slotHold.findMany.mockResolvedValue([
      {
        id: "hold-1",
        startsAt: new Date("2030-03-12T14:20:00.000Z"),
        endsAt: new Date("2030-03-12T14:50:00.000Z"),
        bufferBeforeMinutes: 20,
        bufferAfterMinutes: 10,
      },
    ]);
    const service = new SchedulingPoliciesService(
      prisma as never,
      timezoneService as never,
    );

    await expect(
      service.assertNoActiveHoldConflict({
        tenantId: "tenant-1",
        professionalId: "professional-1",
        occupancyStartsAt: new Date("2030-03-12T14:00:00.000Z"),
        occupancyEndsAt: new Date("2030-03-12T14:30:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
