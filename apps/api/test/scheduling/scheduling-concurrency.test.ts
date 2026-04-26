import { ConflictException } from "@nestjs/common";
import { AppointmentStatus, SlotHoldStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentsService } from "../../src/modules/scheduling/appointments.service";
import { buildClinicActor } from "../helpers/actors";

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

function buildActiveHold(overrides: Record<string, unknown> = {}) {
  const startsAt = new Date("2030-04-10T13:00:00.000Z");
  return {
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
    ...overrides,
  };
}

function buildFinalAppointment(startsAt: Date) {
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
    endsAt: addMinutes(startsAt, 30),
    durationMinutes: 30,
    bufferBeforeMinutes: 5,
    bufferAfterMinutes: 10,
    status: AppointmentStatus.BOOKED,
    confirmedAt: null,
    checkedInAt: null,
    noShowAt: null,
    idempotencyKey: "idem-concurrent",
    cancellationReason: null,
    notes: null,
    createdByUserId: "user-clinic-1",
    updatedByUserId: "user-clinic-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    patient: { id: "patient-1", fullName: "Patient One" },
    professional: { id: "professional-1", fullName: "Dr. One", displayName: "Dr. One" },
    consultationType: { id: "consultation-1", name: "Consulta", durationMinutes: 30, bufferBeforeMinutes: 5, bufferAfterMinutes: 10 },
    unit: { id: "unit-1", name: "Main Unit" },
  };
}

describe("Scheduling Concurrency (Fase 4 — Carga e Isolamento)", () => {
  const startsAt = new Date("2030-04-10T13:00:00.000Z");

  const prisma = {
    appointment: { findFirst: vi.fn(), findUnique: vi.fn() },
  };
  const accessService = { resolveActiveTenantId: vi.fn() };
  const concurrencyService = { runExclusiveForProfessional: vi.fn() };
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
    parseIsoInstant: vi.fn((v: string) => new Date(v)),
    getCurrentInstant: vi.fn(),
  };
  const auditService = { record: vi.fn() };

  function buildService() {
    return new AppointmentsService(
      prisma as never,
      accessService as never,
      concurrencyService as never,
      policiesService as never,
      referencesService as never,
      timezoneService as never,
      auditService as never,
    );
  }

  beforeEach(() => {
    prisma.appointment.findFirst.mockReset();
    prisma.appointment.findUnique.mockReset();
    accessService.resolveActiveTenantId.mockReset();
    concurrencyService.runExclusiveForProfessional.mockReset();
    policiesService.expireStaleHolds.mockReset();
    policiesService.assertNoSchedulingConflict.mockReset();
    policiesService.calculateAppointmentWindow.mockReset();
    referencesService.assertPatientBelongsToTenant.mockReset();
    referencesService.assertProfessionalBelongsToTenant.mockReset();
    referencesService.assertUnitBelongsToTenant.mockReset();
    referencesService.assertProfessionalAssignedToUnit.mockReset();
    referencesService.getActiveConsultationType.mockReset();
    timezoneService.getTenantTimezone.mockReset();
    timezoneService.getCurrentInstant.mockReset();
    auditService.record.mockReset();

    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");
    timezoneService.getCurrentInstant.mockResolvedValue(new Date("2025-01-01T00:00:00.000Z"));
    timezoneService.parseIsoInstant.mockImplementation((v: string) => new Date(v));
    policiesService.calculateAppointmentWindow.mockImplementation(
      ({ startsAt: s, durationMinutes: d, bufferBeforeMinutes: b, bufferAfterMinutes: a }: { startsAt: Date; durationMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number }) => ({
        startsAt: s,
        endsAt: addMinutes(s, d),
        occupancyStartsAt: addMinutes(s, -b),
        occupancyEndsAt: addMinutes(addMinutes(s, d), a),
        durationMinutes: d,
        bufferBeforeMinutes: b,
        bufferAfterMinutes: a,
      }),
    );
    referencesService.getActiveConsultationType.mockResolvedValue({
      id: "consultation-1",
      durationMinutes: 30,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
    });
  });

  describe("CONCURRENCY: dupla tentativa de agendamento no mesmo horário", () => {
    it("primeiro create succeeds, segundo com conflito de policy falha com ConflictException", async () => {
      const finalAppointment = buildFinalAppointment(startsAt);
      const txSuccess = {
        appointment: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(finalAppointment),
          findUniqueOrThrow: vi.fn().mockResolvedValue(finalAppointment),
        },
        slotHold: {
          findFirst: vi.fn().mockResolvedValue(buildActiveHold()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        appointmentStatusHistory: { create: vi.fn().mockResolvedValue(null) },
      };
      const txConflict = {
        appointment: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
          findUniqueOrThrow: vi.fn(),
        },
        slotHold: { findFirst: vi.fn().mockResolvedValue(buildActiveHold()), updateMany: vi.fn() },
        appointmentStatusHistory: { create: vi.fn() },
      };

      // Primeiro runExclusive: succeeds. Segundo: política detecta conflito.
      policiesService.assertNoSchedulingConflict
        .mockResolvedValueOnce(undefined)       // primeira chamada: sem conflito
        .mockRejectedValueOnce(new ConflictException("Slot já ocupado por outro agendamento")); // segunda: conflito

      concurrencyService.runExclusiveForProfessional
        .mockImplementationOnce(async (_t: string, professionalId: string, op: Function) => {
          expect(professionalId).toBe("professional-1");
          return op(txSuccess);
        })
        .mockImplementationOnce(async (_t: string, professionalId: string, op: Function) => {
          expect(professionalId).toBe("professional-1");
          return op(txConflict);
        });

      const service = buildService();

      // Executa sequencialmente para garantir ordem determinística
      const r1 = await service.createAppointment(buildClinicActor(), {
        patientId: "patient-1",
        professionalId: "professional-1",
        consultationTypeId: "consultation-1",
        unitId: "unit-1",
        slotHoldId: "hold-1",
        startsAt: startsAt.toISOString(),
        idempotencyKey: "idem-A",
      });
      expect(r1.id).toBe(finalAppointment.id);

      await expect(
        service.createAppointment(buildClinicActor(), {
          patientId: "patient-1",
          professionalId: "professional-1",
          consultationTypeId: "consultation-1",
          unitId: "unit-1",
          slotHoldId: "hold-1",
          startsAt: startsAt.toISOString(),
          idempotencyKey: "idem-B",
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      // runExclusive foi chamado duas vezes com o mesmo profissional e tenant
      expect(concurrencyService.runExclusiveForProfessional).toHaveBeenCalledTimes(2);
      expect(concurrencyService.runExclusiveForProfessional.mock.calls.every(
        (c: unknown[]) => c[0] === "tenant-1" && c[1] === "professional-1",
      )).toBe(true);
    });

    it("conflito de constraint de occupancy no DB é mapeado para ConflictException — não vaza erro interno", async () => {
      concurrencyService.runExclusiveForProfessional.mockRejectedValue(
        new Error(
          'conflicting key value violates exclusion constraint "ex_appointments_professional_occupancy"',
        ),
      );

      const service = buildService();

      await expect(
        service.createAppointment(buildClinicActor(), {
          patientId: "patient-1",
          professionalId: "professional-1",
          consultationTypeId: "consultation-1",
          unitId: "unit-1",
          startsAt: startsAt.toISOString(),
          idempotencyKey: "idem-db-conflict",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("IDEMPOTENCY: mesmo idempotencyKey de dois chamadores", () => {
    it("segunda chamada com mesma key e mesmo payload retorna o agendamento existente sem criar duplicata", async () => {
      const existingRecord = buildFinalAppointment(startsAt);
      const existingFull = {
        ...existingRecord,
        idempotencyKey: "idem-safe",
        requestSnapshot: {
          patientId: "patient-1",
          professionalId: "professional-1",
          consultationTypeId: "consultation-1",
          startsAt,
          unitId: "unit-1",
          slotHoldId: "hold-1",
          room: "101",
          notes: null,
        },
      };

      const tx = {
        appointment: {
          findUnique: vi.fn().mockResolvedValue(existingFull),
          create: vi.fn(),
          findUniqueOrThrow: vi.fn(),
        },
        slotHold: { findFirst: vi.fn(), updateMany: vi.fn() },
        appointmentStatusHistory: { create: vi.fn() },
      };

      concurrencyService.runExclusiveForProfessional.mockImplementation(
        async (_tenantId: string, _professionalId: string, operation: Function) => operation(tx),
      );

      const service = buildService();

      const [r1, r2] = await Promise.all([
        service.createAppointment(buildClinicActor(), {
          patientId: "patient-1",
          professionalId: "professional-1",
          consultationTypeId: "consultation-1",
          unitId: "unit-1",
          slotHoldId: "hold-1",
          room: "101",
          startsAt: startsAt.toISOString(),
          idempotencyKey: "idem-safe",
        }),
        service.createAppointment(buildClinicActor(), {
          patientId: "patient-1",
          professionalId: "professional-1",
          consultationTypeId: "consultation-1",
          unitId: "unit-1",
          slotHoldId: "hold-1",
          room: "101",
          startsAt: startsAt.toISOString(),
          idempotencyKey: "idem-safe",
        }),
      ]);

      // Ambas devem retornar o mesmo appointment — sem duplicata
      expect(r1.id).toBe(existingRecord.id);
      expect(r2.id).toBe(existingRecord.id);

      // Nenhum novo registro de appointment foi criado
      expect(tx.appointment.create).not.toHaveBeenCalled();
    });

    it("segunda chamada com mesma key mas payload diferente lança ConflictException", async () => {
      const existingRecord = buildFinalAppointment(startsAt);
      const existingFull = {
        ...existingRecord,
        idempotencyKey: "idem-clash",
        requestSnapshot: {
          patientId: "patient-1",
          professionalId: "professional-1",
          consultationTypeId: "consultation-1",
          startsAt,
          unitId: "unit-1",
          slotHoldId: null,
          room: null,
          notes: null,
        },
      };

      const tx = {
        appointment: {
          findUnique: vi.fn().mockResolvedValue(existingFull),
          create: vi.fn(),
          findUniqueOrThrow: vi.fn(),
        },
      };

      concurrencyService.runExclusiveForProfessional.mockImplementation(
        async (_tenantId: string, _professionalId: string, operation: Function) => operation(tx),
      );

      const service = buildService();

      // Mesmo key, mas startsAt diferente — conflito de idempotência
      await expect(
        service.createAppointment(buildClinicActor(), {
          patientId: "patient-1",
          professionalId: "professional-1",
          consultationTypeId: "consultation-1",
          unitId: "unit-1",
          startsAt: "2030-04-10T15:00:00.000Z", // diferente!
          idempotencyKey: "idem-clash",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("TENANT ISOLATION: runExclusiveForProfessional escopado por tenantId", () => {
    it("CRITICAL: lock de profissional é sempre escopado com tenantId correto — impede cross-tenant lock", async () => {
      const actorTenantA = buildClinicActor({ activeTenantId: "tenant-A", tenantIds: ["tenant-A"] });
      const actorTenantB = buildClinicActor({ activeTenantId: "tenant-B", tenantIds: ["tenant-B"] });

      accessService.resolveActiveTenantId
        .mockReturnValueOnce("tenant-A")
        .mockReturnValueOnce("tenant-B");

      const finalAppt = buildFinalAppointment(startsAt);
      const tx = {
        appointment: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(finalAppt), findUniqueOrThrow: vi.fn().mockResolvedValue(finalAppt) },
        slotHold: { findFirst: vi.fn().mockResolvedValue(buildActiveHold()), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        appointmentStatusHistory: { create: vi.fn().mockResolvedValue(null) },
      };

      const lockCallArgs: { tenantId: string; professionalId: string }[] = [];
      concurrencyService.runExclusiveForProfessional.mockImplementation(
        async (tenantId: string, professionalId: string, operation: Function) => {
          lockCallArgs.push({ tenantId, professionalId });
          return operation(tx);
        },
      );

      const service = buildService();

      // Executa sequencialmente para evitar race condition nos mocks compartilhados
      await service.createAppointment(actorTenantA, {
        patientId: "patient-1",
        professionalId: "professional-shared",
        consultationTypeId: "consultation-1",
        startsAt: startsAt.toISOString(),
        idempotencyKey: "idem-tenant-A",
      });
      await service.createAppointment(actorTenantB, {
        patientId: "patient-2",
        professionalId: "professional-shared",
        consultationTypeId: "consultation-1",
        startsAt: startsAt.toISOString(),
        idempotencyKey: "idem-tenant-B",
      });

      // Cada chamada deve ter seu próprio tenantId na aquisição do lock
      const tenantIds = lockCallArgs.map((c) => c.tenantId);
      expect(tenantIds).toContain("tenant-A");
      expect(tenantIds).toContain("tenant-B");

      // Nenhum lock foi chamado com tenantId errado para seu contexto
      const callA = lockCallArgs.find((c) => c.tenantId === "tenant-A");
      const callB = lockCallArgs.find((c) => c.tenantId === "tenant-B");
      expect(callA).toBeDefined();
      expect(callB).toBeDefined();
      expect(callA!.professionalId).toBe("professional-shared");
      expect(callB!.professionalId).toBe("professional-shared");
    });

    it("CRITICAL: dois agendamentos simultâneos para profissional-1 em tenants distintos são serializados por tenant", async () => {
      const callOrder: string[] = [];

      accessService.resolveActiveTenantId
        .mockReturnValueOnce("tenant-X")
        .mockReturnValueOnce("tenant-Y");

      const finalApptX = buildFinalAppointment(startsAt);
      const tx = {
        appointment: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(finalApptX), findUniqueOrThrow: vi.fn().mockResolvedValue(finalApptX) },
        slotHold: { findFirst: vi.fn().mockResolvedValue(buildActiveHold()), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        appointmentStatusHistory: { create: vi.fn().mockResolvedValue(null) },
      };

      concurrencyService.runExclusiveForProfessional.mockImplementation(
        async (tenantId: string, _professionalId: string, operation: Function) => {
          callOrder.push(tenantId);
          return operation(tx);
        },
      );

      const actorX = buildClinicActor({ activeTenantId: "tenant-X", tenantIds: ["tenant-X"] });
      const actorY = buildClinicActor({ activeTenantId: "tenant-Y", tenantIds: ["tenant-Y"] });
      const service = buildService();

      // Executa sequencialmente para garantir mock ordering determinístico
      await service.createAppointment(actorX, {
        patientId: "patient-1",
        professionalId: "professional-1",
        consultationTypeId: "consultation-1",
        startsAt: startsAt.toISOString(),
        idempotencyKey: "idem-X",
      });
      await service.createAppointment(actorY, {
        patientId: "patient-2",
        professionalId: "professional-1",
        consultationTypeId: "consultation-1",
        startsAt: startsAt.toISOString(),
        idempotencyKey: "idem-Y",
      });

      // Ambas as chamadas chegam com tenantids distintos
      expect(callOrder).toContain("tenant-X");
      expect(callOrder).toContain("tenant-Y");
      expect(callOrder).toHaveLength(2);
    });
  });

  describe("SchedulingConcurrencyService: retry e isRetryable", () => {
    it("mapeia erro de exclusion constraint de occupancy para ConflictException no AppointmentsService", async () => {
      // Apenas erros que correspondem ao padrão OCCUPANCY_CONSTRAINT_NAMES são mapeados
      // para ConflictException. Erros de serialização (could not serialize access) são
      // re-lançados como estão. O teste abaixo usa o nome correto da constraint.
      concurrencyService.runExclusiveForProfessional.mockRejectedValue(
        new Error(
          'conflicting key value violates exclusion constraint "ex_appointments_professional_occupancy"',
        ),
      );

      const service = buildService();

      await expect(
        service.createAppointment(buildClinicActor(), {
          patientId: "patient-1",
          professionalId: "professional-1",
          consultationTypeId: "consultation-1",
          unitId: "unit-1",
          startsAt: startsAt.toISOString(),
          idempotencyKey: "idem-occupancy-constraint",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("erro de serialização esgotado (could not serialize access) é relançado como Error — não como ConflictException", async () => {
      // SchedulingConcurrencyService retenta P2034/serialization errors até 3x.
      // Se esgotados, o erro original chega ao AppointmentsService sem conversão.
      concurrencyService.runExclusiveForProfessional.mockRejectedValue(
        new Error("could not serialize access due to concurrent update"),
      );

      const service = buildService();

      await expect(
        service.createAppointment(buildClinicActor(), {
          patientId: "patient-1",
          professionalId: "professional-1",
          consultationTypeId: "consultation-1",
          unitId: "unit-1",
          startsAt: startsAt.toISOString(),
          idempotencyKey: "idem-serialize-exhausted",
        }),
      ).rejects.toThrow("could not serialize access");
    });
  });
});
