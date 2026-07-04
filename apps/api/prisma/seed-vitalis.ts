/**
 * Clínica Vitalis — demo seed for "Demo Ao Vivo" presentations.
 *
 * Run:
 *   pnpm --filter api seed:vitalis          # full seed (idempotent)
 *   pnpm --filter api seed:vitalis:reset    # reset transient data + re-seed appointments
 */

import {
  AppointmentStatus,
  IntegrationConnectionStatus,
  IntegrationProvider,
  MessagingChannel,
  PatientContactType,
  PrismaClient,
  RoleCode,
  ScheduleDayOfWeek,
  SubscriptionStatus,
  TenantStatus,
  UserStatus,
} from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const VITALIS_SLUG = "vitalis";
const VITALIS_DEMO_PASSWORD = "Vitalis@123";
const VITALIS_MOCK_WA_ACCOUNT_ID = "vitalis-mock-wa";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function assignRole(userId: string, roleCode: RoleCode, tenantId: string | null): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  const existing = await prisma.userRole.findFirst({ where: { userId, roleId: role.id, tenantId } });
  if (!existing) {
    await prisma.userRole.create({ data: { userId, roleId: role.id, tenantId } });
  }
}

// ---------------------------------------------------------------------------
// 1. Tenant + clinic + subscription
// ---------------------------------------------------------------------------

async function seedVitalisTenant(): Promise<string> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: VITALIS_SLUG },
    update: { name: "Clínica Vitalis", status: TenantStatus.ACTIVE },
    create: {
      slug: VITALIS_SLUG,
      name: "Clínica Vitalis",
      status: TenantStatus.ACTIVE,
      timezone: "America/Sao_Paulo",
    },
  });

  await prisma.clinic.upsert({
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

  const plan = await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  if (!plan) throw new Error("No active plan found — run the main seed first.");

  const existingSub = await prisma.subscription.findFirst({ where: { tenantId: tenant.id } });
  if (!existingSub) {
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: SubscriptionStatus.TRIAL,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });
  }

  return tenant.id;
}

// ---------------------------------------------------------------------------
// 2. Unit + professionals + schedules
// ---------------------------------------------------------------------------

async function seedVitalisStructure(
  tenantId: string,
): Promise<{ unitId: string; proAnaId: string; proCarlosId: string }> {
  const unit = await prisma.unit.upsert({
    where: { tenantId_name: { tenantId, name: "Vitalis - Unidade Centro" } },
    update: { isActive: true },
    create: {
      tenantId,
      name: "Vitalis - Unidade Centro",
      description: "Unidade principal da Clínica Vitalis no centro",
      isActive: true,
    },
  });

  const specialty = await prisma.specialty.upsert({
    where: { tenantId_name: { tenantId, name: "Estética Avançada" } },
    update: { isActive: true },
    create: { tenantId, name: "Estética Avançada", isActive: true },
  });

  const proAna = await prisma.professional.upsert({
    where: { tenantId_professionalRegister: { tenantId, professionalRegister: "VITALIS-ANA-001" } },
    update: { isActive: true },
    create: {
      tenantId,
      fullName: "Dra. Ana Ferreira",
      displayName: "Dra. Ana",
      professionalRegister: "VITALIS-ANA-001",
      visibleForSelfBooking: true,
      isActive: true,
    },
  });

  const proCarlos = await prisma.professional.upsert({
    where: { tenantId_professionalRegister: { tenantId, professionalRegister: "VITALIS-CARLOS-001" } },
    update: { isActive: true },
    create: {
      tenantId,
      fullName: "Dr. Carlos Lima",
      displayName: "Dr. Carlos",
      professionalRegister: "VITALIS-CARLOS-001",
      visibleForSelfBooking: true,
      isActive: true,
    },
  });

  for (const proId of [proAna.id, proCarlos.id]) {
    const existingPU = await prisma.professionalUnit.findFirst({ where: { professionalId: proId, unitId: unit.id } });
    if (!existingPU) {
      await prisma.professionalUnit.create({ data: { tenantId, professionalId: proId, unitId: unit.id } });
    }

    const existingPS = await prisma.professionalSpecialty.findFirst({
      where: { professionalId: proId, specialtyId: specialty.id },
    });
    if (!existingPS) {
      await prisma.professionalSpecialty.create({
        data: { tenantId, professionalId: proId, specialtyId: specialty.id },
      });
    }

    await prisma.professionalSchedule.deleteMany({ where: { tenantId, professionalId: proId } });

    const weekdays = [
      ScheduleDayOfWeek.MONDAY,
      ScheduleDayOfWeek.TUESDAY,
      ScheduleDayOfWeek.WEDNESDAY,
      ScheduleDayOfWeek.THURSDAY,
      ScheduleDayOfWeek.FRIDAY,
    ];

    await prisma.professionalSchedule.createMany({
      data: [
        ...weekdays.flatMap((dayOfWeek) => [
          {
            tenantId,
            professionalId: proId,
            unitId: unit.id,
            dayOfWeek,
            startTime: new Date("1970-01-01T08:00:00.000Z"),
            endTime: new Date("1970-01-01T12:00:00.000Z"),
            slotIntervalMinutes: 30,
            isActive: true,
          },
          {
            tenantId,
            professionalId: proId,
            unitId: unit.id,
            dayOfWeek,
            startTime: new Date("1970-01-01T13:00:00.000Z"),
            endTime: new Date("1970-01-01T17:00:00.000Z"),
            slotIntervalMinutes: 30,
            isActive: true,
          },
        ]),
        {
          tenantId,
          professionalId: proId,
          unitId: unit.id,
          dayOfWeek: ScheduleDayOfWeek.SATURDAY,
          startTime: new Date("1970-01-01T08:00:00.000Z"),
          endTime: new Date("1970-01-01T12:00:00.000Z"),
          slotIntervalMinutes: 30,
          isActive: true,
        },
      ],
    });
  }

  return { unitId: unit.id, proAnaId: proAna.id, proCarlosId: proCarlos.id };
}

// ---------------------------------------------------------------------------
// 3. Consultation types
// ---------------------------------------------------------------------------

const VITALIS_SERVICES = [
  { name: "Avaliação Inicial Vitalis", durationMinutes: 30, isFirstVisit: true, isReturnVisit: false, aestheticArea: "FACIAL" as const, invasivenessLevel: "NON_INVASIVE" as const, recoveryDays: 0, recommendedFrequencyDays: 365 },
  { name: "Limpeza de Pele Profunda", durationMinutes: 60, isFirstVisit: false, isReturnVisit: false, aestheticArea: "FACIAL" as const, invasivenessLevel: "NON_INVASIVE" as const, recoveryDays: 0, recommendedFrequencyDays: 30 },
  { name: "Toxina Botulínica", durationMinutes: 30, isFirstVisit: false, isReturnVisit: false, aestheticArea: "FACIAL" as const, invasivenessLevel: "MINIMALLY_INVASIVE" as const, recoveryDays: 3, recommendedFrequencyDays: 120 },
  { name: "Preenchimento Labial", durationMinutes: 45, isFirstVisit: false, isReturnVisit: false, aestheticArea: "FACIAL" as const, invasivenessLevel: "MINIMALLY_INVASIVE" as const, recoveryDays: 3, recommendedFrequencyDays: 180 },
  { name: "Microagulhamento Facial", durationMinutes: 45, isFirstVisit: false, isReturnVisit: false, aestheticArea: "FACIAL" as const, invasivenessLevel: "MINIMALLY_INVASIVE" as const, recoveryDays: 7, recommendedFrequencyDays: 30 },
  { name: "Radiofrequência Facial", durationMinutes: 60, isFirstVisit: false, isReturnVisit: false, aestheticArea: "FACIAL" as const, invasivenessLevel: "NON_INVASIVE" as const, recoveryDays: 1, recommendedFrequencyDays: 21 },
] as const;

async function seedVitalisServices(tenantId: string): Promise<void> {
  for (const svc of VITALIS_SERVICES) {
    await prisma.consultationType.upsert({
      where: { tenantId_name: { tenantId, name: svc.name } },
      update: { ...svc, isActive: true },
      create: { tenantId, ...svc, isActive: true },
    });
  }
}

// ---------------------------------------------------------------------------
// 4. Users
// ---------------------------------------------------------------------------

async function seedVitalisUsers(
  tenantId: string,
  proAnaId: string,
  proCarlosId: string,
): Promise<void> {
  const passwordHash = await hash(VITALIS_DEMO_PASSWORD, 10);

  const users = [
    { email: "admin@vitalis.demo", fullName: "Admin Vitalis", role: RoleCode.TENANT_ADMIN, proId: null },
    { email: "recepcao@vitalis.demo", fullName: "Recepção Vitalis", role: RoleCode.RECEPTION, proId: null },
    { email: "ana@vitalis.demo", fullName: "Dra. Ana Ferreira", role: RoleCode.PROFESSIONAL, proId: proAnaId },
    { email: "carlos@vitalis.demo", fullName: "Dr. Carlos Lima", role: RoleCode.PROFESSIONAL, proId: proCarlosId },
  ];

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { fullName: u.fullName, passwordHash, status: UserStatus.ACTIVE },
      create: { email: u.email, fullName: u.fullName, passwordHash, status: UserStatus.ACTIVE },
    });

    await assignRole(user.id, u.role, tenantId);

    if (u.proId) {
      await prisma.professional.update({ where: { id: u.proId }, data: { userId: user.id } });
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Patients
// ---------------------------------------------------------------------------

interface VitalisPatient {
  key: string;
  fullName: string;
  documentNumber: string;
  birthDate: string;
  phone: string;
}

const VITALIS_PATIENTS: VitalisPatient[] = [
  { key: "sofia", fullName: "Sofia Almeida", documentNumber: "55500011101", birthDate: "1993-03-15", phone: "5511981110001" },
  { key: "bruno", fullName: "Bruno Carvalho", documentNumber: "55500011102", birthDate: "1988-07-22", phone: "5511981110002" },
  { key: "mariana", fullName: "Mariana Costa", documentNumber: "55500011103", birthDate: "1995-11-08", phone: "5511981110003" },
  { key: "lucas", fullName: "Lucas Pereira", documentNumber: "55500011104", birthDate: "1990-01-30", phone: "5511981110004" },
  { key: "beatriz", fullName: "Beatriz Santos", documentNumber: "55500011105", birthDate: "1997-05-19", phone: "5511981110005" },
];

async function seedVitalisPatients(tenantId: string): Promise<Map<string, string>> {
  const patientIds = new Map<string, string>();

  for (const p of VITALIS_PATIENTS) {
    const normalized = normalizePhone(p.phone);

    let patient = await prisma.patient.findFirst({
      where: { tenantId, documentNumber: p.documentNumber },
      select: { id: true },
    });

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          tenantId,
          fullName: p.fullName,
          documentNumber: p.documentNumber,
          birthDate: new Date(p.birthDate),
          isActive: true,
        },
        select: { id: true },
      });
    } else {
      await prisma.patient.update({
        where: { id: patient.id },
        data: { fullName: p.fullName, birthDate: new Date(p.birthDate), isActive: true },
      });
    }

    const existingContact = await prisma.patientContact.findFirst({
      where: { tenantId, type: PatientContactType.PHONE, normalizedValue: normalized },
      select: { id: true, patientId: true },
    });

    if (existingContact && existingContact.patientId !== patient.id) {
      await prisma.patientContact.delete({ where: { id: existingContact.id } });
    }

    await prisma.patientContact.upsert({
      where: {
        tenantId_type_normalizedValue: { tenantId, type: PatientContactType.PHONE, normalizedValue: normalized },
      },
      update: { patientId: patient.id, value: p.phone, isPrimary: true },
      create: { tenantId, patientId: patient.id, type: PatientContactType.PHONE, value: p.phone, normalizedValue: normalized, isPrimary: true },
    });

    patientIds.set(p.key, patient.id);
  }

  return patientIds;
}

// ---------------------------------------------------------------------------
// 6. WhatsApp integration connection (mock)
// ---------------------------------------------------------------------------

async function seedVitalisIntegrationConnection(tenantId: string): Promise<void> {
  const existing = await prisma.integrationConnection.findFirst({
    where: { tenantId, channel: MessagingChannel.WHATSAPP },
    select: { id: true },
  });

  if (!existing) {
    await prisma.integrationConnection.create({
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

// ---------------------------------------------------------------------------
// 7. Demo appointments (transient — deleted on reset)
// ---------------------------------------------------------------------------

export async function seedVitalisAppointments(
  tenantId: string,
  patientIds: Map<string, string>,
  proAnaId: string,
  proCarlosId: string,
  unitId: string,
): Promise<void> {
  const serviceMap = new Map<string, { id: string; durationMinutes: number }>();
  const services = await prisma.consultationType.findMany({
    where: { tenantId },
    select: { id: true, name: true, durationMinutes: true },
  });
  for (const s of services) serviceMap.set(s.name, s);

  const now = roundUpToQuarterHour(new Date());

  type AppointmentFixture = {
    key: string;
    patientKey: string;
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

  const fixtures: AppointmentFixture[] = [
    // Past completed (yesterday)
    {
      key: "demo-vitalis-history-sofia",
      patientKey: "sofia",
      proId: proAnaId,
      serviceName: "Limpeza de Pele Profunda",
      startsAt: addDays(addMinutes(now, -480), -1),
      status: AppointmentStatus.COMPLETED,
      room: "Sala 1",
      confirmedAt: addDays(now, -3),
      checkedInAt: addDays(addMinutes(now, -495), -1),
      startedAt: addDays(addMinutes(now, -480), -1),
      completedAt: addDays(addMinutes(now, -420), -1),
      notes: "Limpeza realizada sem intercorrências. Paciente com pele mista, usar ácido mandélico no retorno.",
    },
    // Past (3 days ago)
    {
      key: "demo-vitalis-history-bruno",
      patientKey: "bruno",
      proId: proCarlosId,
      serviceName: "Toxina Botulínica",
      startsAt: addDays(addMinutes(now, -360), -3),
      status: AppointmentStatus.COMPLETED,
      room: "Sala 2",
      confirmedAt: addDays(now, -5),
      checkedInAt: addDays(addMinutes(now, -370), -3),
      startedAt: addDays(addMinutes(now, -360), -3),
      completedAt: addDays(addMinutes(now, -330), -3),
      notes: "Toxina aplicada região frontal e glabela. Retorno em 14 dias para avaliação.",
    },
    // Today — checked in (waiting)
    {
      key: "demo-vitalis-today-mariana-waiting",
      patientKey: "mariana",
      proId: proAnaId,
      serviceName: "Microagulhamento Facial",
      startsAt: addMinutes(now, -15),
      status: AppointmentStatus.CHECKED_IN,
      room: "Sala 1",
      confirmedAt: addDays(now, -1),
      checkedInAt: addMinutes(now, -10),
      notes: "Paciente em sala de espera. Confirmar protocolo antes de iniciar.",
    },
    // Today — upcoming (confirmed, next appt)
    {
      key: "demo-vitalis-today-lucas-next",
      patientKey: "lucas",
      proId: proCarlosId,
      serviceName: "Preenchimento Labial",
      startsAt: addMinutes(now, 60),
      status: AppointmentStatus.CONFIRMED,
      room: "Sala 2",
      confirmedAt: addDays(now, -1),
      notes: "Primeira sessão de preenchimento labial. Separar cânula 25G.",
    },
    // Today — later this afternoon (booked)
    {
      key: "demo-vitalis-today-beatriz-afternoon",
      patientKey: "beatriz",
      proId: proAnaId,
      serviceName: "Radiofrequência Facial",
      startsAt: addMinutes(now, 180),
      status: AppointmentStatus.BOOKED,
      room: "Sala 1",
      notes: "Paciente aguardando confirmação do horário da tarde.",
    },
    // Tomorrow
    {
      key: "demo-vitalis-tomorrow-sofia",
      patientKey: "sofia",
      proId: proAnaId,
      serviceName: "Avaliação Inicial Vitalis",
      startsAt: addDays(addMinutes(now, 120), 1),
      status: AppointmentStatus.CONFIRMED,
      room: "Sala 1",
      confirmedAt: now,
      notes: "Avaliação de retorno. Comparar fotos do prontuário anterior.",
    },
    // Day after tomorrow
    {
      key: "demo-vitalis-d2-mariana",
      patientKey: "mariana",
      proId: proCarlosId,
      serviceName: "Limpeza de Pele Profunda",
      startsAt: addDays(addMinutes(now, 90), 2),
      status: AppointmentStatus.BOOKED,
      room: "Sala 2",
      notes: "Retorno pós-microagulhamento. Verificar cicatrização antes de proceder.",
    },
    // Next week
    {
      key: "demo-vitalis-next-week-lucas",
      patientKey: "lucas",
      proId: proCarlosId,
      serviceName: "Toxina Botulínica",
      startsAt: addDays(addMinutes(now, 60), 7),
      status: AppointmentStatus.BOOKED,
      room: "Sala 2",
      notes: "Manutenção botox. Trazer registro fotográfico da sessão anterior.",
    },
    {
      key: "demo-vitalis-next-week-beatriz",
      patientKey: "beatriz",
      proId: proAnaId,
      serviceName: "Microagulhamento Facial",
      startsAt: addDays(addMinutes(now, 150), 7),
      status: AppointmentStatus.BOOKED,
      room: "Sala 1",
    },
    {
      key: "demo-vitalis-d14-bruno",
      patientKey: "bruno",
      proId: proCarlosId,
      serviceName: "Avaliação Inicial Vitalis",
      startsAt: addDays(addMinutes(now, 90), 14),
      status: AppointmentStatus.BOOKED,
      room: "Sala 2",
      notes: "Retorno avaliação pós-toxina botulínica.",
    },
  ];

  const adminUser = await prisma.user.findFirst({
    where: { email: "admin@vitalis.demo" },
    select: { id: true },
  });

  for (const f of fixtures) {
    const svc = serviceMap.get(f.serviceName);
    if (!svc) throw new Error(`Service not found: ${f.serviceName}`);

    const patientId = patientIds.get(f.patientKey);
    if (!patientId) throw new Error(`Patient not found: ${f.patientKey}`);

    await prisma.appointment.create({
      data: {
        tenantId,
        patientId,
        professionalId: f.proId,
        consultationTypeId: svc.id,
        unitId,
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
  }
}

// ---------------------------------------------------------------------------
// Reset transient data
// ---------------------------------------------------------------------------

export async function resetVitalisTransientData(tenantId: string): Promise<{
  appointments: number;
  threads: number;
}> {
  const { count: appointments } = await prisma.appointment.deleteMany({
    where: { tenantId, idempotencyKey: { startsWith: "demo-vitalis-" } },
  });

  const threads = await prisma.messageThread.findMany({
    where: { tenantId },
    select: { id: true },
  });

  const threadIds = threads.map((t) => t.id);

  if (threadIds.length > 0) {
    await prisma.messageEvent.deleteMany({ where: { threadId: { in: threadIds } } });
  }

  const { count: threadsDeleted } = await prisma.messageThread.deleteMany({ where: { tenantId } });

  return { appointments, threads: threadsDeleted };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const isReset = process.argv.includes("--reset");

  console.info("▶ Seeding Clínica Vitalis tenant...");
  const tenantId = await seedVitalisTenant();
  console.info(`  ✓ Tenant ID: ${tenantId}`);

  console.info("▶ Seeding Vitalis services...");
  await seedVitalisServices(tenantId);

  console.info("▶ Seeding Vitalis structure (unit + professionals)...");
  const { unitId, proAnaId, proCarlosId } = await seedVitalisStructure(tenantId);

  console.info("▶ Seeding Vitalis users...");
  await seedVitalisUsers(tenantId, proAnaId, proCarlosId);

  console.info("▶ Seeding Vitalis patients...");
  const patientIds = await seedVitalisPatients(tenantId);

  console.info("▶ Seeding Vitalis WhatsApp connection...");
  await seedVitalisIntegrationConnection(tenantId);

  if (isReset) {
    console.info("▶ Resetting transient data (appointments + threads)...");
    const cleared = await resetVitalisTransientData(tenantId);
    console.info(`  ✓ Cleared ${cleared.appointments} appointments, ${cleared.threads} threads`);
  }

  console.info("▶ Seeding Vitalis demo appointments...");
  await seedVitalisAppointments(tenantId, patientIds, proAnaId, proCarlosId, unitId);

  console.info("");
  console.info("=".repeat(60));
  console.info("  CLÍNICA VITALIS — DEMO CREDENTIALS");
  console.info("=".repeat(60));
  console.info("");
  console.info(`  Tenant ID: ${tenantId}`);
  console.info(`  Tenant slug: ${VITALIS_SLUG}`);
  console.info("");
  console.info("  CLINIC LOGIN → http://localhost:3000/login/clinic");
  console.info(`    Admin        admin@vitalis.demo       /  ${VITALIS_DEMO_PASSWORD}`);
  console.info(`    Recepção     recepcao@vitalis.demo    /  ${VITALIS_DEMO_PASSWORD}`);
  console.info(`    Dra. Ana     ana@vitalis.demo         /  ${VITALIS_DEMO_PASSWORD}`);
  console.info(`    Dr. Carlos   carlos@vitalis.demo      /  ${VITALIS_DEMO_PASSWORD}`);
  console.info("");
  console.info("  WHATSAPP (mock) — externalAccountId: vitalis-mock-wa");
  console.info("  DEMO PATIENTS:");
  for (const p of VITALIS_PATIENTS) {
    console.info(`    ${p.fullName.padEnd(20)} ${p.phone}`);
  }
  console.info("=".repeat(60));
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.info("\nVitalis seed completed.");
  })
  .catch(async (error) => {
    console.error("Vitalis seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
