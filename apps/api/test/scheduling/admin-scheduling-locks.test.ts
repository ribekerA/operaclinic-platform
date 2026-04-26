import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleBlocksService } from "../../src/modules/scheduling/schedule-blocks.service";
import { SchedulesService } from "../../src/modules/scheduling/schedules.service";
import { buildClinicActor } from "../helpers/actors";

describe("Admin scheduling writes use professional locks", () => {
  const accessService = {
    ensureAdminAccess: vi.fn(),
    resolveActiveTenantId: vi.fn(),
  };
  const concurrencyService = {
    runExclusiveForProfessional: vi.fn(),
    runExclusiveForProfessionals: vi.fn(),
  };
  const referencesService = {
    assertProfessionalBelongsToTenant: vi.fn(),
    assertUnitBelongsToTenant: vi.fn(),
    assertProfessionalAssignedToUnit: vi.fn(),
  };
  const auditService = {
    record: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");
    referencesService.assertProfessionalBelongsToTenant.mockResolvedValue(undefined);
    referencesService.assertUnitBelongsToTenant.mockResolvedValue(undefined);
    referencesService.assertProfessionalAssignedToUnit.mockResolvedValue(undefined);
    auditService.record.mockResolvedValue(undefined);
  });

  it("serializes schedule creation with the same professional lock used by booking", async () => {
    const tx = {
      professionalSchedule: {
        create: vi.fn().mockResolvedValue({
          id: "schedule-1",
          tenantId: "tenant-1",
          professionalId: "professional-1",
          unitId: "unit-1",
          dayOfWeek: "MONDAY",
          startTime: new Date(Date.UTC(1970, 0, 1, 9, 0, 0, 0)),
          endTime: new Date(Date.UTC(1970, 0, 1, 12, 0, 0, 0)),
          slotIntervalMinutes: 15,
          isActive: true,
          validFrom: null,
          validTo: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const prisma = {};

    concurrencyService.runExclusiveForProfessional.mockImplementation(
      async (_tenantId: string, _professionalId: string, operation: Function) =>
        operation(tx),
    );

    const service = new SchedulesService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      referencesService as never,
      auditService as never,
    );

    await service.createSchedule(buildClinicActor(), {
      professionalId: "professional-1",
      dayOfWeek: "MONDAY",
      startTime: "09:00",
      endTime: "12:00",
      slotIntervalMinutes: 15,
      unitId: "unit-1",
    });

    expect(concurrencyService.runExclusiveForProfessional).toHaveBeenCalledWith(
      "tenant-1",
      "professional-1",
      expect.any(Function),
    );
    expect(tx.professionalSchedule.create).toHaveBeenCalledOnce();
  });

  it("locks both source and target professionals when moving an active schedule block", async () => {
    const prisma = {
      scheduleBlock: {
        findFirst: vi.fn().mockResolvedValue({
          professionalId: "professional-current",
        }),
      },
    };
    const tx = {
      scheduleBlock: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: "block-1",
            tenantId: "tenant-1",
            professionalId: "professional-current",
            unitId: null,
            room: null,
            reason: null,
            startsAt: new Date("2030-01-01T10:00:00.000Z"),
            endsAt: new Date("2030-01-01T11:00:00.000Z"),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .mockResolvedValueOnce(null),
        findMany: vi.fn(),
        update: vi.fn().mockResolvedValue({
          id: "block-1",
          tenantId: "tenant-1",
          professionalId: "professional-new",
          unitId: null,
          room: null,
          reason: null,
          startsAt: new Date("2030-01-01T10:00:00.000Z"),
          endsAt: new Date("2030-01-01T11:00:00.000Z"),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    };
    const policiesService = {
      assertNoActiveHoldConflict: vi.fn().mockResolvedValue(undefined),
      assertNoAppointmentOccupancyConflict: vi.fn().mockResolvedValue(undefined),
    };
    const timezoneService = {
      parseIsoInstant: vi.fn(),
    };

    concurrencyService.runExclusiveForProfessionals.mockImplementation(
      async (_tenantId: string, _professionalIds: string[], operation: Function) =>
        operation(tx),
    );

    const service = new ScheduleBlocksService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      policiesService as never,
      referencesService as never,
      timezoneService as never,
      auditService as never,
    );

    await service.updateBlock(buildClinicActor(), "block-1", {
      professionalId: "professional-new",
    });

    expect(
      concurrencyService.runExclusiveForProfessionals,
    ).toHaveBeenCalledWith(
      "tenant-1",
      ["professional-current", "professional-new"],
      expect.any(Function),
    );
    expect(tx.scheduleBlock.update).toHaveBeenCalledOnce();
  });
});
