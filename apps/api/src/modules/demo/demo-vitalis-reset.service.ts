import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import {
  AppointmentStatus,
  IntegrationConnectionStatus,
  IntegrationProvider,
  MessagingChannel,
  PatientContactType,
  RoleCode,
  ScheduleDayOfWeek,
  SubscriptionStatus,
  TenantStatus,
  UserStatus,
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

const ROLE_CATALOG = [
  { code: RoleCode.SUPER_ADMIN, name: "Super Admin", description: "Global control plane administrator." },
  { code: RoleCode.PLATFORM_ADMIN, name: "Platform Admin", description: "Platform administration operations." },
  { code: RoleCode.TENANT_ADMIN, name: "Tenant Admin", description: "Clinic tenant administration." },
  { code: RoleCode.CLINIC_MANAGER, name: "Clinic Manager", description: "Clinic structure and operational configuration management." },
  { code: RoleCode.RECEPTION, name: "Reception", description: "Clinic reception operations." },
  { code: RoleCode.PROFESSIONAL, name: "Professional", description: "Healthcare professional role." },
];

const VITALIS_SERVICES = [
  { name: "Avaliação Inicial Vitalis", durationMinutes: 30, isFirstVisit: true, isReturnVisit: false, aestheticArea: "FACIAL" as const, invasivenessLevel: "NON_INVASIVE" as const, recoveryDays: 0, recommendedFrequencyDays: 365 },
  { name: "Limpeza de Pele Profunda", durationMinutes: 60, isFirstVisit: false, isReturnVisit: false, aestheticArea: "FACIAL" as const, invasivenessLevel: "NON_INVASIVE" as const, recoveryDays: 0, recommendedFrequencyDays: 30 },
  { name: "Toxina Botulínica", durationMinutes: 30, isFirstVisit: false, isReturnVisit: false, aestheticArea: "FACIAL" as const, invasivenessLevel: "MINIMALLY_INVASIVE" as const, recoveryDays: 3, recommendedFrequencyDays: 120 },
  { name: "Preenchimento Labial", durationMinutes: 45, isFirstVisit: false, isReturnVisit: false, aestheticArea: "FACIAL" as const, invasivenessLevel: "MINIMALLY_INVASIVE" as const, recoveryDays: 3, recommendedFrequencyDays: 180 },
  { name: "Microagulhamento Facial", durationMinutes: 45, isFirstVisit: false, isReturnVisit: false, aestheticArea: "FACIAL" as const, invasivenessLevel: "MINIMALLY_INVASIVE" as const, recoveryDays: 7, recommendedFrequencyDays: 30 },
  { name: "Radiofrequência Facial", durationMinutes: 60, isFirstVisit: false, isReturnVisit: false, aestheticArea: "FACIAL" as const, invasivenessLevel: "NON_INVASIVE" as const, recoveryDays: 1, recommendedFrequencyDays: 21 },
];

const VITALIS_PATIENTS = [
  { fullName: "Sofia Almeida", documentNumber: "55500011101", birthDate: "1993-03-15", phone: "5511981110001" },
  { fullName: "Bruno Carvalho", documentNumber: "55500011102", birthDate: "1988-07-22", phone: "5511981110002" },
  { fullName: "Mariana Costa", documentNumber: "55500011103", birthDate: "1995-11-08", phone: "5511981110003" },
  { fullName: "Lucas Pereira", documentNumber: "55500011104", birthDate: "1990-01-30", phone: "5511981110004" },
  { fullName: "Beatriz Santos", documentNumber: "55500011105", birthDate: "1997-05-19", phone: "5511981110005" },
];

@Injectable()
export class DemoVitalisResetService {
  private readonly logger = new Logger(DemoVitalisResetService.name);

  constructor(private readonly prisma: PrismaService) {}

  async reset(): Promise<ResetResult> {
    this.logger.log("DemoVitalisReset: starting full upsert + reset");

    // Ensure foundational data (roles + base plan)
    await this.ensureRoles();
    const planId = await this.ensureBasePlan();

    // Upsert Vitalis tenant + static structure
    const tenantId = await this.ensureTenant(planId);
    await this.ensureStructure(tenantId);
    await this.ensureServices(tenantId);
    await this.ensureUsers(tenantId);
    await this.ensurePatients(tenantId);
    await this.ensureIntegrationConnection(tenantId);

    // Clear transient data
    const cleared = await this.clearTransientData(tenantId);

    // Re-seed demo appointments
    const created = await this.createDemoAppointments(tenantId);

    this.logger.log(
      `DemoVitalisReset: done — tenantId=${tenantId} cleared=${JSON.stringify(cleared)} created=${created}`,
    );

    return { ok: true, tenantId, cleared, created: { appointments: created } };
  }

  private async ensureRoles(): Promise<void> {
    for (const r of ROLE_CATALOG) {
      await this.prisma.role.upsert({
        where: { code: r.code },
        update: { name: r.name, description: r.description },
        create: { code: r.code, name: r.name, description: r.description },
      });
    }
  }

  private async ensureBasePlan(): Promise<string> {
    const existing = await this.prisma.plan.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (existing) return existing.id;

    const plan = await this.prisma.plan.create({
      data: {
        code: "BASE_MVP",
        name: "Base MVP",
        description: "Plano base para onboarding inicial.",
        priceCents: 0,
        isActive: true,
      },
      select: { id: true },
    });
    return plan.id;
  }

  private async ensureTenant(planId: string): Promise<string> {
    const tenant = await this.prisma.tenant.upsert({
      where: { slug: VITALIS_SLUG },
      update: { name: "Clínica Vitalis", status: TenantStatus.ACTIVE },
      create: {
        slug: VITALIS_SLUG,
        name: "Clínica Vitalis",
        status: TenantStatus.ACTIVE,
        timezone: "America/Sao_Paulo",
      },
    });

    await this.prisma.clinic.upsert({
      where: { tenantId: tenant.id },
      update: { displayName: "Clínica Vitalis", isActive: true },
      create: {
        tenantId: tenant.id,
        displayName: "Clínica Vitalis",
        legalName: "Clínica Vitalis Estética LTDA",
        contactEmail: "contato@vitalis.demo",
        contactPhone: "(11) 3200-8900",
        timezone: "America/Sao_Paulo",
        isActive: true,
      },
    });

    const existingSub = await this.prisma.subscription.findFirst({ where: { tenantId: tenant.id } });
    if (!existingSub) {
      await this.prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId,
          status: SubscriptionStatus.TRIAL,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      });
    }

    return tenant.id;
  }

  private async ensureStructure(tenantId: string): Promise<{ unitId: string; proAnaId: string; proCarlosId: string }> {
    const unit = await this.prisma.unit.upsert({
      where: { tenantId_name: { tenantId, name: "Vitalis - Unidade Centro" } },
      update: { isActive: true },
      create: { tenantId, name: "Vitalis - Unidade Centro", description: "Unidade principal da Clínica Vitalis", isActive: true },
    });

    const specialty = await this.prisma.specialty.upsert({
      where: { tenantId_name: { tenantId, name: "Estética Avançada" } },
      update: { isActive: true },
      create: { tenantId, name: "Estética Avançada", isActive: true },
    });

    const proAna = await this.prisma.professional.upsert({
      where: { tenantId_professionalRegister: { tenantId, professionalRegister: "VITALIS-ANA-001" } },
      update: { isActive: true },
      create: { tenantId, fullName: "Dra. Ana Ferreira", displayName: "Dra. Ana", professionalRegister: "VITALIS-ANA-001", visibleForSelfBooking: true, isActive: true },
    });

    const proCarlos = await this.prisma.professional.upsert({
      where: { tenantId_professionalRegister: { tenantId, professionalRegister: "VITALIS-CARLOS-001" } },
      update: { isActive: true },
      create: { tenantId, fullName: "Dr. Carlos Lima", displayName: "Dr. Carlos", professionalRegister: "VITALIS-CARLOS-001", visibleForSelfBooking: true, isActive: true },
    });

    for (const pro of [proAna, proCarlos]) {
      const existingPU = await this.prisma.professionalUnit.findFirst({ where: { professionalId: pro.id, unitId: unit.id } });
      if (!existingPU) {
        await this.prisma.professionalUnit.create({ data: { tenantId, professionalId: pro.id, unitId: unit.id } });
      }
      const existingPS = await this.prisma.professionalSpecialty.findFirst({ where: { professionalId: pro.id, specialtyId: specialty.id } });
      if (!existingPS) {
        await this.prisma.professionalSpecialty.create({ data: { tenantId, professionalId: pro.id, specialtyId: specialty.id } });
      }

      await this.prisma.professionalSchedule.deleteMany({ where: { tenantId, professionalId: pro.id } });

      const weekdays = [ScheduleDayOfWeek.MONDAY, ScheduleDayOfWeek.TUESDAY, ScheduleDayOfWeek.WEDNESDAY, ScheduleDayOfWeek.THURSDAY, ScheduleDayOfWeek.FRIDAY];
      await this.prisma.professionalSchedule.createMany({
        data: [
          ...weekdays.flatMap((dayOfWeek) => [
            { tenantId, professionalId: pro.id, unitId: unit.id, dayOfWeek, startTime: new Date("1970-01-01T08:00:00.000Z"), endTime: new Date("1970-01-01T12:00:00.000Z"), slotIntervalMinutes: 30, isActive: true },
            { tenantId, professionalId: pro.id, unitId: unit.id, dayOfWeek, startTime: new Date("1970-01-01T13:00:00.000Z"), endTime: new Date("1970-01-01T17:00:00.000Z"), slotIntervalMinutes: 30, isActive: true },
          ]),
          { tenantId, professionalId: pro.id, unitId: unit.id, dayOfWeek: ScheduleDayOfWeek.SATURDAY, startTime: new Date("1970-01-01T08:00:00.000Z"), endTime: new Date("1970-01-01T12:00:00.000Z"), slotIntervalMinutes: 30, isActive: true },
        ],
      });
    }

    return { unitId: unit.id, proAnaId: proAna.id, proCarlosId: proCarlos.id };
  }

  private async ensureServices(tenantId: string): Promise<void> {
    for (const svc of VITALIS_SERVICES) {
      await this.prisma.consultationType.upsert({
        where: { tenantId_name: { tenantId, name: svc.name } },
        update: { ...svc, isActive: true },
        create: { tenantId, ...svc, isActive: true },
      });
    }
  }

  private async ensureUsers(tenantId: string): Promise<void> {
    const passwordHash = await hash(VITALIS_DEMO_PASSWORD, 10);

    const proAna = await this.prisma.professional.findFirst({
      where: { tenantId, professionalRegister: "VITALIS-ANA-001" },
      select: { id: true },
    });
    const proCarlos = await this.prisma.professional.findFirst({
      where: { tenantId, professionalRegister: "VITALIS-CARLOS-001" },
      select: { id: true },
    });

    const users = [
      { email: "admin@vitalis.demo", fullName: "Admin Vitalis", role: RoleCode.TENANT_ADMIN, proId: null },
      { email: "recepcao@vitalis.demo", fullName: "Recepção Vitalis", role: RoleCode.RECEPTION, proId: null },
      { email: "ana@vitalis.demo", fullName: "Dra. Ana Ferreira", role: RoleCode.PROFESSIONAL, proId: proAna?.id ?? null },
      { email: "carlos@vitalis.demo", fullName: "Dr. Carlos Lima", role: RoleCode.PROFESSIONAL, proId: proCarlos?.id ?? null },
    ];

    for (const u of users) {
      const user = await this.prisma.user.upsert({
        where: { email: u.email },
        update: { fullName: u.fullName, passwordHash, status: UserStatus.ACTIVE },
        create: { email: u.email, fullName: u.fullName, passwordHash, status: UserStatus.ACTIVE },
      });

      const role = await this.prisma.role.findUnique({ where: { code: u.role } });
      if (role) {
        const existingRole = await this.prisma.userRole.findFirst({ where: { userId: user.id, roleId: role.id, tenantId } });
        if (!existingRole) {
          await this.prisma.userRole.create({ data: { userId: user.id, roleId: role.id, tenantId } });
        }
      }

      if (u.proId) {
        await this.prisma.professional.update({ where: { id: u.proId }, data: { userId: user.id } });
      }
    }
  }

  private async ensurePatients(tenantId: string): Promise<void> {
    for (const p of VITALIS_PATIENTS) {
      const normalized = normalizePhone(p.phone);

      let patient = await this.prisma.patient.findFirst({
        where: { tenantId, documentNumber: p.documentNumber },
        select: { id: true },
      });

      if (!patient) {
        patient = await this.prisma.patient.create({
          data: { tenantId, fullName: p.fullName, documentNumber: p.documentNumber, birthDate: new Date(p.birthDate), isActive: true },
          select: { id: true },
        });
      } else {
        await this.prisma.patient.update({ where: { id: patient.id }, data: { fullName: p.fullName, birthDate: new Date(p.birthDate), isActive: true } });
      }

      const existingContact = await this.prisma.patientContact.findFirst({
        where: { tenantId, type: PatientContactType.PHONE, normalizedValue: normalized },
        select: { id: true, patientId: true },
      });

      if (existingContact && existingContact.patientId !== patient.id) {
        await this.prisma.patientContact.delete({ where: { id: existingContact.id } });
      }

      await this.prisma.patientContact.upsert({
        where: { tenantId_type_normalizedValue: { tenantId, type: PatientContactType.PHONE, normalizedValue: normalized } },
        update: { patientId: patient.id, value: p.phone, isPrimary: true },
        create: { tenantId, patientId: patient.id, type: PatientContactType.PHONE, value: p.phone, normalizedValue: normalized, isPrimary: true },
      });
    }
  }

  private async ensureIntegrationConnection(tenantId: string): Promise<void> {
    const existing = await this.prisma.integrationConnection.findFirst({
      where: { tenantId, channel: MessagingChannel.WHATSAPP },
      select: { id: true },
    });
    if (!existing) {
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

  private async clearTransientData(tenantId: string): Promise<{ appointments: number; threads: number; events: number }> {
    const { count: appointments } = await this.prisma.appointment.deleteMany({
      where: { tenantId, idempotencyKey: { startsWith: "demo-vitalis-" } },
    });

    const threads = await this.prisma.messageThread.findMany({ where: { tenantId }, select: { id: true } });
    const threadIds = threads.map((t) => t.id);

    let events = 0;
    if (threadIds.length > 0) {
      const { count } = await this.prisma.messageEvent.deleteMany({ where: { threadId: { in: threadIds } } });
      events = count;
    }

    const { count: threadsCount } = await this.prisma.messageThread.deleteMany({ where: { tenantId } });

    return { appointments, threads: threadsCount, events };
  }

  private async createDemoAppointments(tenantId: string): Promise<number> {
    const proAna = await this.prisma.professional.findFirst({ where: { tenantId, professionalRegister: "VITALIS-ANA-001" }, select: { id: true } });
    const proCarlos = await this.prisma.professional.findFirst({ where: { tenantId, professionalRegister: "VITALIS-CARLOS-001" }, select: { id: true } });
    const unit = await this.prisma.unit.findFirst({ where: { tenantId, name: "Vitalis - Unidade Centro" }, select: { id: true } });
    const adminUser = await this.prisma.user.findFirst({ where: { email: "admin@vitalis.demo" }, select: { id: true } });

    if (!proAna || !proCarlos || !unit) return 0;

    const services = await this.prisma.consultationType.findMany({ where: { tenantId }, select: { id: true, name: true, durationMinutes: true } });
    const svcMap = new Map(services.map((s) => [s.name, s]));

    const patients = await this.prisma.patientContact.findMany({
      where: { tenantId, type: PatientContactType.PHONE, normalizedValue: { in: ["5511981110001", "5511981110002", "5511981110003", "5511981110004", "5511981110005"] } },
      select: { patientId: true, normalizedValue: true },
    });
    const patientByPhone = new Map(patients.map((p) => [p.normalizedValue, p.patientId]));

    const now = roundUpToQuarterHour(new Date());

    type Fixture = {
      key: string; phone: string; proId: string; serviceName: string;
      startsAt: Date; status: AppointmentStatus; room: string;
      confirmedAt?: Date; checkedInAt?: Date; startedAt?: Date; completedAt?: Date; notes?: string;
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
