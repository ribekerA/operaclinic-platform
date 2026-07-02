import { ConflictException, BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentApiService } from "../../src/modules/agent-api/agent-api.service";
import { AgentApiException, AgentErrorCode } from "../../src/modules/agent-api/agent-api.errors";
import { AgentKeyGuard } from "../../src/modules/agent-api/guards/agent-key.guard";

const TENANT_ID = "tenant-uuid-1";
const PROFESSIONAL_ID = "prof-uuid-1";
const SERVICE_ID = "svc-uuid-1";
const PATIENT_ID = "patient-uuid-1";
const APPOINTMENT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function buildMockAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: APPOINTMENT_ID,
    tenantId: TENANT_ID,
    patientId: PATIENT_ID,
    professionalId: PROFESSIONAL_ID,
    consultationTypeId: SERVICE_ID,
    unitId: null,
    slotHoldId: null,
    room: null,
    startsAt: new Date("2099-08-01T14:00:00Z"),
    endsAt: new Date("2099-08-01T14:30:00Z"),
    durationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    status: "BOOKED",
    confirmedAt: null,
    checkedInAt: null,
    calledAt: null,
    startedAt: null,
    closureReadyAt: null,
    awaitingPaymentAt: null,
    completedAt: null,
    noShowAt: null,
    idempotencyKey: "agent-5511999998888-2099-08-01T14:00:00.000Z",
    cancellationReason: null,
    outsideSchedule: false,
    notes: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    patient: { id: PATIENT_ID, fullName: "Maria Silva" },
    professional: { id: PROFESSIONAL_ID, fullName: "Ana Souza", displayName: "Dra. Ana" },
    consultationType: {
      id: SERVICE_ID,
      name: "Avaliação Estética",
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    },
    unit: null,
    ...overrides,
  };
}

describe("AgentApiService", () => {
  const prisma = {
    consultationType: { findFirst: vi.fn() },
    professional: { findFirst: vi.fn(), findMany: vi.fn() },
    patientContact: { findFirst: vi.fn(), findMany: vi.fn() },
    patient: { create: vi.fn() },
    appointment: { findFirst: vi.fn(), findMany: vi.fn() },
  };

  const availabilityService = { searchAvailability: vi.fn() };
  const appointmentsService = {
    createAppointment: vi.fn(),
    rescheduleAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
  };
  const timezoneService = { getTenantTimezone: vi.fn() };

  let service: AgentApiService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentApiService(
      prisma as never,
      availabilityService as never,
      appointmentsService as never,
      timezoneService as never,
    );
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe("createAppointment — happy path", () => {
    it("returns appointment with 6-char confirmation code", async () => {
      prisma.patientContact.findFirst.mockResolvedValue(null);
      prisma.patient.create.mockResolvedValue({ id: PATIENT_ID });
      appointmentsService.createAppointment.mockResolvedValue(buildMockAppointment());

      const result = await service.createAppointment(TENANT_ID, {
        professional_id: PROFESSIONAL_ID,
        service_id: SERVICE_ID,
        starts_at: "2099-08-01T14:00:00Z",
        patient_name: "Maria Silva",
        patient_phone: "+5511999998888",
      });

      expect(result.id).toBe(APPOINTMENT_ID);
      expect(result.confirmation_code).toMatch(/^[A-F0-9]{6}$/);
      expect(result.status).toBe("BOOKED");
      expect(result.patient_name).toBe("Maria Silva");
      expect(result.patient_phone).toBe("+5511999998888");
      expect(result.professional_name).toBe("Dra. Ana");
    });

    it("reuses existing patient when phone already registered", async () => {
      prisma.patientContact.findFirst.mockResolvedValue({ patientId: PATIENT_ID });
      appointmentsService.createAppointment.mockResolvedValue(buildMockAppointment());

      await service.createAppointment(TENANT_ID, {
        professional_id: PROFESSIONAL_ID,
        service_id: SERVICE_ID,
        starts_at: "2099-08-01T14:00:00Z",
        patient_name: "Maria Silva",
        patient_phone: "+5511999998888",
      });

      expect(prisma.patient.create).not.toHaveBeenCalled();
    });
  });

  // ─── Slot taken ───────────────────────────────────────────────────────────

  describe("createAppointment — slot taken", () => {
    it("throws AgentApiException SLOT_TAKEN (409) when slot is already booked", async () => {
      prisma.patientContact.findFirst.mockResolvedValue({ patientId: PATIENT_ID });
      appointmentsService.createAppointment.mockRejectedValue(
        new ConflictException("Scheduling conflict: slot already occupied."),
      );

      await expect(
        service.createAppointment(TENANT_ID, {
          professional_id: PROFESSIONAL_ID,
          service_id: SERVICE_ID,
          starts_at: "2099-08-01T14:00:00Z",
          patient_name: "Maria Silva",
          patient_phone: "+5511999998888",
        }),
      ).rejects.toMatchObject({
        errorCode: AgentErrorCode.SLOT_TAKEN,
        statusCode: 409,
      });
    });

    it("SLOT_TAKEN message includes instruction to consult /availability", async () => {
      prisma.patientContact.findFirst.mockResolvedValue({ patientId: PATIENT_ID });
      appointmentsService.createAppointment.mockRejectedValue(
        new ConflictException("Slot occupied."),
      );

      try {
        await service.createAppointment(TENANT_ID, {
          professional_id: PROFESSIONAL_ID,
          service_id: SERVICE_ID,
          starts_at: "2099-08-01T14:00:00Z",
          patient_name: "Maria Silva",
          patient_phone: "+5511999998888",
        });
      } catch (err) {
        expect((err as AgentApiException).message).toContain("/availability");
      }
    });
  });

  // ─── Race condition ────────────────────────────────────────────────────────

  describe("createAppointment — race condition", () => {
    it("second concurrent booking on same slot throws SLOT_TAKEN", async () => {
      prisma.patientContact.findFirst.mockResolvedValue({ patientId: PATIENT_ID });
      appointmentsService.createAppointment
        .mockResolvedValueOnce(buildMockAppointment())
        .mockRejectedValueOnce(new ConflictException("Scheduling conflict: slot already occupied."));

      const input = {
        professional_id: PROFESSIONAL_ID,
        service_id: SERVICE_ID,
        starts_at: "2099-08-01T14:00:00Z",
        patient_name: "Maria Silva",
        patient_phone: "+5511999998888",
      };

      const [first, second] = await Promise.allSettled([
        service.createAppointment(TENANT_ID, input),
        service.createAppointment(TENANT_ID, { ...input, patient_phone: "+5511888887777" }),
      ]);

      expect(first.status).toBe("fulfilled");
      expect(second.status).toBe("rejected");
      if (second.status === "rejected") {
        expect((second.reason as AgentApiException).errorCode).toBe(AgentErrorCode.SLOT_TAKEN);
        expect((second.reason as AgentApiException).statusCode).toBe(409);
      }
    });
  });

  // ─── Availability ─────────────────────────────────────────────────────────

  describe("getAvailability", () => {
    it("returns slots for a single-day range", async () => {
      prisma.consultationType.findFirst.mockResolvedValue({
        id: SERVICE_ID,
        name: "Avaliação Estética",
        durationMinutes: 30,
      });
      prisma.professional.findMany.mockResolvedValue([
        { id: PROFESSIONAL_ID, displayName: "Dra. Ana", fullName: "Ana Souza" },
      ]);
      availabilityService.searchAvailability.mockResolvedValue([
        {
          startsAt: new Date("2099-08-01T13:00:00Z"),
          endsAt: new Date("2099-08-01T13:30:00Z"),
          occupancyStartsAt: new Date("2099-08-01T13:00:00Z"),
          occupancyEndsAt: new Date("2099-08-01T13:30:00Z"),
          professionalId: PROFESSIONAL_ID,
          unitId: null,
        },
      ]);

      const result = await service.getAvailability(TENANT_ID, {
        service_id: SERVICE_ID,
        date_from: "2099-08-01",
        date_to: "2099-08-01",
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        professional_id: PROFESSIONAL_ID,
        service_id: SERVICE_ID,
        service_name: "Avaliação Estética",
        duration_minutes: 30,
      });
    });

    it("throws SERVICE_NOT_FOUND (404) for unknown service_id", async () => {
      prisma.consultationType.findFirst.mockResolvedValue(null);

      await expect(
        service.getAvailability(TENANT_ID, {
          service_id: "unknown-id",
          date_from: "2099-08-01",
          date_to: "2099-08-01",
        }),
      ).rejects.toMatchObject({ errorCode: AgentErrorCode.SERVICE_NOT_FOUND, statusCode: 404 });
    });

    it("throws INVALID_DATE_RANGE when range exceeds 14 days", async () => {
      prisma.consultationType.findFirst.mockResolvedValue({
        id: SERVICE_ID,
        name: "Consulta",
        durationMinutes: 30,
      });
      prisma.professional.findMany.mockResolvedValue([]);

      await expect(
        service.getAvailability(TENANT_ID, {
          service_id: SERVICE_ID,
          date_from: "2099-08-01",
          date_to: "2099-08-20",
        }),
      ).rejects.toMatchObject({ errorCode: AgentErrorCode.INVALID_DATE_RANGE });
    });
  });

  // ─── Lookup ───────────────────────────────────────────────────────────────

  describe("lookupAppointments", () => {
    it("returns future appointments for a known phone", async () => {
      prisma.patientContact.findMany.mockResolvedValue([{ patientId: PATIENT_ID }]);
      prisma.appointment.findMany.mockResolvedValue([
        {
          id: APPOINTMENT_ID,
          professionalId: PROFESSIONAL_ID,
          consultationTypeId: SERVICE_ID,
          unitId: null,
          startsAt: new Date("2099-08-01T14:00:00Z"),
          endsAt: new Date("2099-08-01T14:30:00Z"),
          durationMinutes: 30,
          status: "BOOKED",
          professional: { id: PROFESSIONAL_ID, fullName: "Ana Souza", displayName: "Dra. Ana" },
          consultationType: { id: SERVICE_ID, name: "Avaliação Estética" },
          unit: null,
        },
      ]);

      const result = await service.lookupAppointments(TENANT_ID, "+5511999998888");

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: APPOINTMENT_ID,
        professional_name: "Dra. Ana",
        service_name: "Avaliação Estética",
        status: "BOOKED",
      });
      expect(result[0].confirmation_code).toMatch(/^[A-F0-9]{6}$/);
    });

    it("returns empty array for unknown phone", async () => {
      prisma.patientContact.findMany.mockResolvedValue([]);
      const result = await service.lookupAppointments(TENANT_ID, "+5511000000000");
      expect(result).toEqual([]);
    });
  });

  // ─── Reschedule ───────────────────────────────────────────────────────────

  describe("rescheduleAppointment", () => {
    it("throws APPOINTMENT_NOT_FOUND for unknown id", async () => {
      prisma.appointment.findFirst.mockResolvedValue(null);

      await expect(
        service.rescheduleAppointment(TENANT_ID, "nonexistent-id", {
          starts_at: "2099-09-01T10:00:00Z",
        }),
      ).rejects.toMatchObject({ errorCode: AgentErrorCode.APPOINTMENT_NOT_FOUND, statusCode: 404 });
    });

    it("throws SLOT_TAKEN when new slot is occupied", async () => {
      prisma.appointment.findFirst.mockResolvedValue({ id: APPOINTMENT_ID });
      appointmentsService.rescheduleAppointment.mockRejectedValue(
        new ConflictException("Scheduling conflict."),
      );

      await expect(
        service.rescheduleAppointment(TENANT_ID, APPOINTMENT_ID, {
          starts_at: "2099-09-01T10:00:00Z",
        }),
      ).rejects.toMatchObject({ errorCode: AgentErrorCode.SLOT_TAKEN, statusCode: 409 });
    });
  });

  // ─── Cancel ───────────────────────────────────────────────────────────────

  describe("cancelAppointment", () => {
    it("cancels successfully and returns updated appointment", async () => {
      prisma.appointment.findFirst.mockResolvedValue({ id: APPOINTMENT_ID });
      appointmentsService.cancelAppointment.mockResolvedValue(
        buildMockAppointment({ status: "CANCELED" }),
      );

      const result = await service.cancelAppointment(TENANT_ID, APPOINTMENT_ID, {});
      expect(result.status).toBe("CANCELED");
    });

    it("throws APPOINTMENT_NOT_FOUND for unknown id", async () => {
      prisma.appointment.findFirst.mockResolvedValue(null);

      await expect(
        service.cancelAppointment(TENANT_ID, "bad-id", {}),
      ).rejects.toMatchObject({ errorCode: AgentErrorCode.APPOINTMENT_NOT_FOUND });
    });

    it("uses default reason when none is provided", async () => {
      prisma.appointment.findFirst.mockResolvedValue({ id: APPOINTMENT_ID });
      appointmentsService.cancelAppointment.mockResolvedValue(
        buildMockAppointment({ status: "CANCELED" }),
      );

      await service.cancelAppointment(TENANT_ID, APPOINTMENT_ID, {});

      expect(appointmentsService.cancelAppointment).toHaveBeenCalledWith(
        expect.anything(),
        APPOINTMENT_ID,
        expect.objectContaining({ reason: expect.stringContaining("assistente virtual") }),
      );
    });
  });
});

// ─── AgentKeyGuard ──────────────────────────────────────────────────────────

describe("AgentKeyGuard", () => {
  function buildContext(key: string | undefined) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: key !== undefined ? { "x-agent-key": key } : {},
        }),
      }),
    } as never;
  }

  function buildConfig(apiKey: string) {
    return {
      get: (k: string) => (k === "AGENT_API_KEY" ? apiKey : "tenant-uuid"),
    } as never;
  }

  it("allows request with correct key and injects tenantId", () => {
    const guard = new AgentKeyGuard(buildConfig("secret-key"));
    const request: Record<string, unknown> = { headers: { "x-agent-key": "secret-key" } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request["__agentTenantId__"]).toBe("tenant-uuid");
  });

  it("throws UNAUTHORIZED (401) for wrong key", () => {
    const guard = new AgentKeyGuard(buildConfig("secret-key"));
    expect(() => guard.canActivate(buildContext("wrong-key"))).toThrowError(
      expect.objectContaining({ errorCode: AgentErrorCode.UNAUTHORIZED, statusCode: 401 }),
    );
  });

  it("throws UNAUTHORIZED (401) when key header is missing", () => {
    const guard = new AgentKeyGuard(buildConfig("secret-key"));
    expect(() => guard.canActivate(buildContext(undefined))).toThrowError(
      expect.objectContaining({ errorCode: AgentErrorCode.UNAUTHORIZED }),
    );
  });

  it("throws 503 when AGENT_API_KEY is not configured", () => {
    const guard = new AgentKeyGuard({ get: () => "" } as never);
    expect(() => guard.canActivate(buildContext("any-key"))).toThrowError(
      expect.objectContaining({ errorCode: AgentErrorCode.UNAUTHORIZED, statusCode: 503 }),
    );
  });
});
