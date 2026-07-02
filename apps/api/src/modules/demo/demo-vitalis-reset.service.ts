import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import {
  AppointmentStatus,
  IntegrationConnectionStatus,
  IntegrationProvider,
  MessagingChannel,
  PatientContactType,
  ScheduleDayOfWeek,
  SubscriptionStatus,
  TenantStatus,
  UserStatus,
  RoleCode,
} from "@prisma/client";
import { hash } from "bcryptjs";

const VITALIS_SLUG = "vitalis";
const VITALIS_DEMO_PASSWORD = "Vitalis@123";
const VITALIS_MOCK_WA_ACCOUNT_ID = "vitalis-mock-wa";

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function roundUpToQuarterHour(date: Date): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const rem = d.getMinutes() % 15;
  if (rem !== 0) d.setMinutes(d.getMinutes() + (15 - rem));
  return d;
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

export interface ResetResult {
  ok: boolean;
  tenantId: string;
  cleared: {
    appointments: number;
    threads: number;
    events: number;
  };
  created: {
    appointments: number;
  };
}

@Injectable()
export class DemoVitalisResetService {
  private readonly logger = new Logger(DemoVitalisResetService.name);

  constructor(private readonly prisma: PrismaService) {}

  async reset(): Promise<ResetResult> {
    this.logger.log("DemoVitalisReset: starting reset");

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: VITALIS_SLUG },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException(
        `Vitalis demo tenant not found. Run 'pnpm --filter api seed:vitalis' first.`,
      );
    }

    const tenantId = tenant.id;

    // Ensure static data exists
    await this.ensureStaticData(tenantId);

    // Clear transient data
    const { count: apptCount } = await this.prisma.appointment.deleteMany({
      where: { tenantId, idempotencyKey: { startsWith: "demo-vitalis-" } },
    });

    const threads = await this.prisma.messageThread.findMany({
      where: { tenantId },
      select: { id: true },
    });
    const threadIds = threads.map((t) => t.id);

    let eventsCount = 0;
    if (threadIds.length > 0) {
      const { count } = await this.prisma.messageEvent.deleteMany({
        where: { threadId: { in: threadIds } },
      });
      eventsCount = count;
    }

    const { count: threadsCount } = await this.prisma.messageThread.deleteMany({
      where: { tenantId },
    });

    this.logger.log(
      `DemoVitalisReset: cleared appointments=${apptCount} threads=${threadsCount} events=${eventsCount}`,
    );

    // Re-seed appointments
    const created = await this.createDemoAppointments(tenantId);

    this.logger.log(`DemoVitalisReset: created ${created} appointments`);

    return {
      ok: true,
      tenantId,
      cleared: { appointments: apptCount, threads: threadsCount, events: eventsCount },
      created: { appointments: created },
    };
  }

  private async ensureStaticData(tenantId: string): Promise<void> {
    // Upsert clinic
    await this.prisma.clinic.upsert({
      where: { tenantId },
      update: { displayName: "Clínica Vitalis", isActive: true },
      create: {
        tenantId,
        displayName: "Clínica Vitalis",
        legalName: "Clínica Vitalis Estética LTDA",
        contactEmail: "contato@vitalis.demo",
        contactPhone: "(11) 3200-8900",
        timezone: "America/Sao_Paulo",
        isActive: true,
      },
    });

    // Ensure subscription exists
    const sub = await this.prisma.subscription.findFirst({ where: { tenantId } });
    if (!sub) {
      const plan = await this.prisma.plan.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
      if (plan) {
        await this.prisma.subscription.create({
          data: {
            tenantId,
            planId: plan.id,
            status: SubscriptionStatus.TRIAL,
            startsAt: new Date(),
            endsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
        });
      }
    }

    // Ensure integration connection
    const conn = await this.prisma.integrationConnection.findFirst({
      where: { tenantId, channel: MessagingChannel.WHATSAPP },
    });
    if (!conn) {
      await this.prisma.integrationConnection.create({
        data: {
          tenantId,
          displayName: "WhatsApp Vitalis (Mock)",
          provider: IntegrationProvider.WHATSAPP_MOCK,
          channel: MessagingChannel.WHATSAPP,
          status: IntegrationConnectionStatus.ACTIVE,
          externalAccountId: VITALIS_MOCK_WA_ACCOUNT_ID,
        },
      });
    }
  }

  private async createDemoAppointments(tenantId: string): Promise<number> {
    const proAna = await this.prisma.professional.findFirst({
      where: { tenantId, professionalRegister: "VITALIS-ANA-001" },
      select: { id: true },
    });
    const proCarlos = await this.prisma.professional.findFirst({
      where: { tenantId, professionalRegister: "VITALIS-CARLOS-001" },
      select: { id: true },
    });
    const unit = await this.prisma.unit.findFirst({
      where: { tenantId, name: "Vitalis - Unidade Centro" },
      select: { id: true },
    });
    const adminUser = await this.prisma.user.findFirst({
      where: { email: "admin@vitalis.demo" },
      select: { id: true },
    });

    if (!proAna || !proCarlos || !unit) {
      throw new NotFoundException("Vitalis professionals/unit not found. Run full seed first.");
    }

    const services = await this.prisma.consultationType.findMany({
      where: { tenantId },
      select: { id: true, name: true, durationMinutes: true },
    });
    const svcMap = new Map(services.map((s) => [s.name, s]));

    const patients = await this.prisma.patientContact.findMany({
      where: {
        tenantId,
        type: PatientContactType.PHONE,
        normalizedValue: { in: ["5511981110001", "5511981110002", "5511981110003", "5511981110004", "5511981110005"] },
      },
      select: { patientId: true, normalizedValue: true },
    });
    const patientByPhone = new Map(patients.map((p) => [p.normalizedValue, p.patientId]));

    const now = roundUpToQuarterHour(new Date());

    type Fixture = {
      key: string;
      phone: string;
      proId: string;
      serviceName: string;
      startsAt: Date;
      status: AppointmentStatus;
      room: string;
      confirmedAt?: Date;
      checkedInAt?: Date;
      startedAt?: Date;
      completedAt?: Date;
      notes?: string;
    };

    const fixtures: Fixture[] = [
      { key: "demo-vitalis-history-sofia", phone: "5511981110001", proId: proAna.id, serviceName: "Limpeza de Pele Profunda", startsAt: addDays(addMinutes(now, -480), -1), status: AppointmentStatus.COMPLETED, room: "Sala 1", confirmedAt: addDays(now, -3), checkedInAt: addDays(addMinutes(now, -495), -1), startedAt: addDays(addMinutes(now, -480), -1), completedAt: addDays(addMinutes(now, -420), -1), notes: "Limpeza realizada sem intercorrências." },
      { key: "demo-vitalis-history-bruno", phone: "5511981110002", proId: proCarlos.id, serviceName: "Toxina Botulínica", startsAt: addDays(addMinutes(now, -360), -3), status: AppointmentStatus.COMPLETED, room: "Sala 2", confirmedAt: addDays(now, -5), checkedInAt: addDays(addMinutes(now, -370), -3), startedAt: addDays(addMinutes(now, -360), -3), completedAt: addDays(addMinutes(now, -330), -3), notes: "Toxina frontal e glabela. Retorno em 14 dias." },
      { key: "demo-vitalis-today-mariana-waiting", phone: "5511981110003", proId: proAna.id, serviceName: "Microagulhamento Facial", startsAt: addMinutes(now, -15), status: AppointmentStatus.CHECKED_IN, room: "Sala 1", confirmedAt: addDays(now, -1), checkedInAt: addMinutes(now, -10), notes: "Paciente aguardando na recepção." },
      { key: "demo-vitalis-today-lucas-next", phone: "5511981110004", proId: proCarlos.id, serviceName: "Preenchimento Labial", startsAt: addMinutes(now, 60), status: AppointmentStatus.CONFIRMED, room: "Sala 2", confirmedAt: addDays(now, -1), notes: "Primeira sessão de preenchimento labial." },
      { key: "demo-vitalis-today-beatriz-afternoon", phone: "5511981110005", proId: proAna.id, serviceName: "Radiofrequência Facial", startsAt: addMinutes(now, 180), status: AppointmentStatus.BOOKED, room: "Sala 1" },
      { key: "demo-vitalis-tomorrow-sofia", phone: "5511981110001", proId: proAna.id, serviceName: "Avaliação Inicial Vitalis", startsAt: addDays(addMinutes(now, 120), 1), status: AppointmentStatus.CONFIRMED, room: "Sala 1", confirmedAt: now },
      { key: "demo-vitalis-d2-mariana", phone: "5511981110003", proId: proCarlos.id, serviceName: "Limpeza de Pele Profunda", startsAt: addDays(addMinutes(now, 90), 2), status: AppointmentStatus.BOOKED, room: "Sala 2" },
      { key: "demo-vitalis-next-week-lucas", phone: "5511981110004", proId: proCarlos.id, serviceName: "Toxina Botulínica", startsAt: addDays(addMinutes(now, 60), 7), status: AppointmentStatus.BOOKED, room: "Sala 2" },
      { key: "demo-vitalis-next-week-beatriz", phone: "5511981110005", proId: proAna.id, serviceName: "Microagulhamento Facial", startsAt: addDays(addMinutes(now, 150), 7), status: AppointmentStatus.BOOKED, room: "Sala 1" },
      { key: "demo-vitalis-d14-bruno", phone: "5511981110002", proId: proCarlos.id, serviceName: "Avaliação Inicial Vitalis", startsAt: addDays(addMinutes(now, 90), 14), status: AppointmentStatus.BOOKED, room: "Sala 2", notes: "Retorno avaliação pós-toxina." },
    ];

    let count = 0;
    for (const f of fixtures) {
      const svc = svcMap.get(f.serviceName);
      if (!svc) continue;

      const patientId = patientByPhone.get(f.phone);
      if (!patientId) continue;

      await this.prisma.appointment.create({
        data: {
          tenantId,
          patientId,
          professionalId: f.proId,
          consultationTypeId: svc.id,
          unitId: unit.id,
          room: f.room,
          startsAt: f.startsAt,
          endsAt: addMinutes(f.startsAt, svc.durationMinutes),
          durationMinutes: svc.durationMinutes,
          status: f.status,
          confirmedAt: f.confirmedAt ?? null,
          checkedInAt: f.checkedInAt ?? null,
          startedAt: f.startedAt ?? null,
          completedAt: f.completedAt ?? null,
          idempotencyKey: f.key,
          notes: f.notes ?? null,
          createdByUserId: adminUser?.id ?? null,
          updatedByUserId: adminUser?.id ?? null,
        },
      });
      count++;
    }

    return count;
  }
}
