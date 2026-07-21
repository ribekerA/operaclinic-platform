import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  PatientContactType,
  Prisma,
  ScheduleDayOfWeek,
  SlotHoldStatus,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { PrismaService } from "../../database/prisma.service";
import { PublicAvailabilityQueryDto } from "./dto/public-availability-query.dto";
import { PublicBookAppointmentDto } from "./dto/public-book-appointment.dto";

export interface PublicClinicInfo {
  tenantId: string;
  clinicName: string;
  displayName: string;
  timezone: string;
  isDemo: boolean;
  professionals: Array<{
    id: string;
    displayName: string;
    specialties: Array<{ id: string; name: string }>;
  }>;
  consultationTypes: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    aestheticArea: string | null;
  }>;
}

export interface PublicSlot {
  startsAt: string;
  endsAt: string;
  professionalId: string;
  consultationTypeId: string;
  unitId: string | null;
}

const BLOCKING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.BOOKED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.CALLED,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.AWAITING_CLOSURE,
  AppointmentStatus.RESCHEDULED,
];

function toWeekday(date: Date, timezone: string): ScheduleDayOfWeek {
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: timezone }).format(date);
  return day.toUpperCase() as ScheduleDayOfWeek;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function toMinutes(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

@Injectable()
export class PublicBookingService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveSlugs(): Promise<{ slugs: string[] }> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: "ACTIVE" },
      select: { slug: true },
      orderBy: { slug: "asc" },
    });
    return { slugs: tenants.map((t) => t.slug) };
  }

  async getClinicPublicInfo(slug: string): Promise<PublicClinicInfo> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      include: {
        clinic: true,
      },
    });

    if (!tenant || tenant.status !== "ACTIVE") {
      throw new NotFoundException("Clínica não encontrada.");
    }

    const [professionals, consultationTypes, demoLeadTenant] = await Promise.all([
      this.prisma.professional.findMany({
        where: { tenantId: tenant.id, isActive: true, visibleForSelfBooking: true },
        select: {
          id: true,
          displayName: true,
          professionalSpecialties: { select: { specialty: { select: { id: true, name: true } } } },
        },
        orderBy: { displayName: "asc" },
      }),
      this.prisma.consultationType.findMany({
        where: { tenantId: tenant.id, isActive: true },
        select: { id: true, name: true, durationMinutes: true, aestheticArea: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.demoLeadTenant.findUnique({
        where: { tenantId: tenant.id },
        select: { id: true },
      }),
    ]);

    return {
      tenantId: tenant.id,
      clinicName: tenant.name,
      displayName: tenant.clinic?.displayName ?? tenant.name,
      timezone: tenant.timezone,
      isDemo: demoLeadTenant !== null,
      professionals: professionals.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        specialties: p.professionalSpecialties.map((ps) => ({ id: ps.specialty.id, name: ps.specialty.name })),
      })),
      consultationTypes: consultationTypes.map((ct) => ({
        id: ct.id,
        name: ct.name,
        durationMinutes: ct.durationMinutes,
        aestheticArea: ct.aestheticArea ?? null,
      })),
    };
  }

  async searchPublicAvailability(
    slug: string,
    query: PublicAvailabilityQueryDto,
  ): Promise<PublicSlot[]> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, timezone: true, status: true },
    });
    if (!tenant || tenant.status !== "ACTIVE") throw new NotFoundException("Clínica não encontrada.");

    const tenantId = tenant.id;
    const timezone = tenant.timezone;

    const consultationType = await this.prisma.consultationType.findFirst({
      where: { id: query.consultationTypeId, tenantId, isActive: true },
      select: { durationMinutes: true, bufferBeforeMinutes: true, bufferAfterMinutes: true },
    });
    if (!consultationType) throw new NotFoundException("Tipo de consulta não encontrado.");

    // Parse and validate the requested date
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(query.date);
    if (!dateMatch) throw new BadRequestException("data inválida (use YYYY-MM-DD).");

    const dayStartLocal = new Date(`${query.date}T00:00:00`);
    const dayStartUtc = fromZonedTime(dayStartLocal, timezone);
    const dayEndUtc = fromZonedTime(new Date(`${query.date}T23:59:59`), timezone);
    const weekday = toWeekday(dayStartUtc, timezone);

    const now = new Date();
    if (dayEndUtc < now) return []; // Past date

    // Load schedules, blocks, existing appointments
    const [schedules, blocks, appointments] = await Promise.all([
      this.prisma.professionalSchedule.findMany({
        where: {
          tenantId,
          professionalId: query.professionalId,
          dayOfWeek: weekday,
          isActive: true,
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: new Date(query.date) } }] },
            { OR: [{ validTo: null }, { validTo: { gte: new Date(query.date) } }] },
          ],
        },
        select: { startTime: true, endTime: true, slotIntervalMinutes: true, unitId: true },
      }),
      this.prisma.scheduleBlock.findMany({
        where: {
          tenantId,
          professionalId: query.professionalId,
          isActive: true,
          startsAt: { lt: dayEndUtc },
          endsAt: { gt: dayStartUtc },
        },
        select: { startsAt: true, endsAt: true },
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          professionalId: query.professionalId,
          status: { in: BLOCKING_STATUSES },
          startsAt: { lt: dayEndUtc },
          endsAt: { gt: dayStartUtc },
        },
        select: { startsAt: true, endsAt: true },
      }),
    ]);

    if (schedules.length === 0) return [];

    const slots: PublicSlot[] = [];
    const bufferBefore = consultationType.bufferBeforeMinutes;
    const bufferAfter = consultationType.bufferAfterMinutes;
    const duration = consultationType.durationMinutes;
    const total = bufferBefore + duration + bufferAfter;

    for (const schedule of schedules) {
      const interval = schedule.slotIntervalMinutes;
      // Convert stored time (UTC 1970 epoch) to minutes-of-day
      const schedStartMin = toMinutes(schedule.startTime);
      const schedEndMin = toMinutes(schedule.endTime);

      // Build the actual start/end for this day in UTC
      const tzOffset = dayStartUtc.getTime() - fromZonedTime(new Date(Date.UTC(1970, 0, 1)), timezone).getTime();
      const dayBase = new Date(dayStartUtc.getTime() - (dayStartUtc.getUTCHours() * 60 + dayStartUtc.getUTCMinutes()) * 60_000);

      for (let minOfDay = schedStartMin; minOfDay + total <= schedEndMin; minOfDay += interval) {
        const slotStart = fromZonedTime(
          new Date(`${query.date}T${String(Math.floor(minOfDay / 60)).padStart(2, "0")}:${String(minOfDay % 60).padStart(2, "0")}:00`),
          timezone,
        );
        const occupancyStart = addMinutes(slotStart, -bufferBefore);
        const occupancyEnd = addMinutes(slotStart, duration + bufferAfter);
        const slotEnd = addMinutes(slotStart, duration);

        // Skip past slots
        if (addMinutes(slotStart, -bufferBefore) < now) continue;

        // Check block conflicts
        const blockedByBlock = blocks.some(
          (b) => b.startsAt < occupancyEnd && b.endsAt > occupancyStart,
        );
        if (blockedByBlock) continue;

        // Check appointment conflicts
        const blockedByAppointment = appointments.some(
          (a) => a.startsAt < occupancyEnd && a.endsAt > occupancyStart,
        );
        if (blockedByAppointment) continue;

        slots.push({
          startsAt: slotStart.toISOString(),
          endsAt: slotEnd.toISOString(),
          professionalId: query.professionalId,
          consultationTypeId: query.consultationTypeId,
          unitId: schedule.unitId ?? query.unitId ?? null,
        });
      }
    }

    return slots;
  }

  async bookAppointment(
    slug: string,
    input: PublicBookAppointmentDto,
  ): Promise<{ appointmentId: string; startsAt: string; confirmationCode: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, timezone: true, status: true },
    });
    if (!tenant || tenant.status !== "ACTIVE") throw new NotFoundException("Clínica não encontrada.");

    const tenantId = tenant.id;
    const startsAt = new Date(input.startsAt);

    if (startsAt < new Date()) {
      throw new BadRequestException("Não é possível agendar no passado.");
    }

    const [professional, consultationType] = await Promise.all([
      this.prisma.professional.findFirst({
        where: { id: input.professionalId, tenantId, isActive: true },
        select: { id: true, displayName: true },
      }),
      this.prisma.consultationType.findFirst({
        where: { id: input.consultationTypeId, tenantId, isActive: true },
        select: { id: true, durationMinutes: true, bufferBeforeMinutes: true, bufferAfterMinutes: true },
      }),
    ]);

    if (!professional) throw new NotFoundException("Profissional não encontrado.");
    if (!consultationType) throw new NotFoundException("Tipo de consulta não encontrado.");

    const endsAt = addMinutes(startsAt, consultationType.durationMinutes);
    const normalizedPhone = input.patientPhone.replace(/\D/g, "");

    const result = await this.prisma.$transaction(async (tx) => {
      // Find or create patient by phone number
      const existingContact = await tx.patientContact.findFirst({
        where: {
          tenantId,
          normalizedValue: normalizedPhone,
          type: { in: [PatientContactType.PHONE, PatientContactType.WHATSAPP] },
          patient: { mergedIntoPatientId: null },
        },
        include: { patient: true },
      });

      let patientId: string;

      if (existingContact) {
        patientId = existingContact.patientId;
        // Update name if changed
        if (input.patientName && existingContact.patient.fullName !== input.patientName) {
          await tx.patient.update({
            where: { id: patientId },
            data: { fullName: input.patientName },
          });
        }
      } else {
        // Create new patient
        const newPatient = await tx.patient.create({
          data: {
            tenantId,
            fullName: input.patientName,
            isActive: true,
          },
        });
        patientId = newPatient.id;

        await tx.patientContact.create({
          data: {
            tenantId,
            patientId,
            type: (input.contactType ?? "WHATSAPP") as PatientContactType,
            value: input.patientPhone,
            normalizedValue: normalizedPhone,
            isPrimary: true,
          },
        });
      }

      // Check for conflicts
      const conflict = await tx.appointment.findFirst({
        where: {
          tenantId,
          professionalId: input.professionalId,
          status: { in: BLOCKING_STATUSES },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { id: true },
      });

      if (conflict) {
        throw new ConflictException("Horário indisponível. Por favor escolha outro.");
      }

      const idempotencyKey = `public-${slug}-${input.professionalId}-${startsAt.toISOString()}`;
      const confirmationCode = randomUUID().slice(0, 8).toUpperCase();

      const appointment = await tx.appointment.create({
        data: {
          tenantId,
          patientId,
          professionalId: input.professionalId,
          consultationTypeId: input.consultationTypeId,
          unitId: input.unitId ?? null,
          status: AppointmentStatus.BOOKED,
          startsAt,
          endsAt,
          durationMinutes: consultationType.durationMinutes,
          bufferBeforeMinutes: consultationType.bufferBeforeMinutes,
          bufferAfterMinutes: consultationType.bufferAfterMinutes,
          idempotencyKey,
          notes: input.notes ?? null,
          outsideSchedule: false,
        },
      });

      return { appointmentId: appointment.id, confirmationCode };
    });

    return {
      appointmentId: result.appointmentId,
      startsAt: startsAt.toISOString(),
      confirmationCode: result.confirmationCode,
    };
  }
}
