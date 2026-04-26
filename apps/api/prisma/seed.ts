import {
  COMMERCIAL_PUBLIC_PLAN_CATALOG,
} from "@operaclinic/shared";
import {
  AppointmentStatus,
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

// ---------------------------------------------------------------------------
// Roles catalog
// ---------------------------------------------------------------------------

const roleSeed = [
  {
    code: RoleCode.SUPER_ADMIN,
    name: "Super Admin",
    description: "Global control plane administrator.",
  },
  {
    code: RoleCode.PLATFORM_ADMIN,
    name: "Platform Admin",
    description: "Platform administration operations.",
  },
  {
    code: RoleCode.TENANT_ADMIN,
    name: "Tenant Admin",
    description: "Clinic tenant administration.",
  },
  {
    code: RoleCode.CLINIC_MANAGER,
    name: "Clinic Manager",
    description: "Clinic structure and operational configuration management.",
  },
  {
    code: RoleCode.RECEPTION,
    name: "Reception",
    description: "Clinic reception operations.",
  },
  {
    code: RoleCode.PROFESSIONAL,
    name: "Professional",
    description: "Healthcare professional role.",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveBasePlanPrice(): number {
  const parsed = Number.parseInt(process.env.SEED_BASE_PLAN_PRICE_CENTS ?? "0", 10);

  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

function roundUpToQuarterHour(date: Date): Date {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);

  const remainder = rounded.getMinutes() % 15;
  if (remainder === 0) {
    return rounded;
  }

  rounded.setMinutes(rounded.getMinutes() + (15 - remainder));
  return rounded;
}

function buildClinicalNotes(input: {
  intercurrence?: string;
  preparation?: string;
  guidance?: string;
  operational?: string;
}): string | null {
  const sections: string[] = [];

  if (input.preparation?.trim()) {
    sections.push(`Preparacao/pele:\n${input.preparation.trim()}`);
  }

  if (input.intercurrence?.trim()) {
    sections.push(`Intercorrencia:\n${input.intercurrence.trim()}`);
  }

  if (input.guidance?.trim()) {
    sections.push(`Orientacao final:\n${input.guidance.trim()}`);
  }

  if (input.operational?.trim()) {
    sections.push(`Observacoes:\n${input.operational.trim()}`);
  }

  if (sections.length === 0) {
    return null;
  }

  return sections.join("\n\n");
}

async function assignRole(userId: string, roleCode: RoleCode, tenantId: string | null): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });

  const existing = await prisma.userRole.findFirst({
    where: { userId, roleId: role.id, tenantId },
  });

  if (!existing) {
    await prisma.userRole.create({
      data: { userId, roleId: role.id, tenantId },
    });
  }
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

async function seedRoles(): Promise<void> {
  for (const role of roleSeed) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        description: role.description,
        isSystem: true,
      },
      create: {
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: true,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Super Admin (platform profile)
// ---------------------------------------------------------------------------

async function seedSuperAdmin(): Promise<void> {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL ?? "superadmin@operaclinic.local";
  const fullName = process.env.SEED_SUPER_ADMIN_NAME ?? "OperaClinic Super Admin";
  const plainPassword = process.env.SEED_SUPER_ADMIN_PASSWORD;
  const explicitHash = process.env.SEED_SUPER_ADMIN_PASSWORD_HASH?.trim();

  if (!plainPassword?.trim() && !explicitHash) {
    throw new Error(
      "Set SEED_SUPER_ADMIN_PASSWORD or SEED_SUPER_ADMIN_PASSWORD_HASH before running prisma seed.",
    );
  }

  const passwordHash =
    plainPassword && plainPassword.trim().length > 0
      ? await hash(plainPassword, 10)
      : (explicitHash as string);

  const user = await prisma.user.upsert({
    where: { email },
    update: { fullName, passwordHash, status: UserStatus.ACTIVE },
    create: { email, fullName, passwordHash, status: UserStatus.ACTIVE },
  });

  await assignRole(user.id, RoleCode.SUPER_ADMIN, null);
}

// ---------------------------------------------------------------------------
// Base plan
// ---------------------------------------------------------------------------

async function seedBasePlan(): Promise<void> {
  const code = process.env.SEED_BASE_PLAN_CODE ?? "BASE_MVP";
  const name = process.env.SEED_BASE_PLAN_NAME ?? "Base MVP";
  const description =
    process.env.SEED_BASE_PLAN_DESCRIPTION ?? "Initial base plan for early tenant onboarding.";

  await prisma.plan.upsert({
    where: { code },
    update: {
      name,
      description,
      priceCents: resolveBasePlanPrice(),
      currency: "BRL",
      isPublic: false,
      isActive: true,
    },
    create: {
      code,
      name,
      description,
      priceCents: resolveBasePlanPrice(),
      currency: "BRL",
      isPublic: false,
      isActive: true,
    },
  });
}

async function seedCommercialPlans(): Promise<void> {
  for (const plan of COMMERCIAL_PUBLIC_PLAN_CATALOG) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        currency: plan.currency,
        isPublic: true,
        isActive: true,
      },
      create: {
        code: plan.code,
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        currency: plan.currency,
        isPublic: true,
        isActive: true,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Demo aesthetic clinic tenant — creates tenant + clinic + subscription
// Returns the tenant ID
// ---------------------------------------------------------------------------

async function seedDemoTenant(): Promise<string> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "estetica-demo" },
    update: { name: "Clinica Estetica Demo", status: TenantStatus.ACTIVE },
    create: {
      slug: "estetica-demo",
      name: "Clinica Estetica Demo",
      status: TenantStatus.ACTIVE,
      timezone: "America/Sao_Paulo",
    },
  });

  await prisma.clinic.upsert({
    where: { tenantId: tenant.id },
    update: { displayName: "Clinica Estetica Demo", isActive: true },
    create: {
      tenantId: tenant.id,
      displayName: "Clinica Estetica Demo",
      legalName: "Clinica Estetica Demo LTDA",
      contactEmail: "contato@estetica-demo.local",
      contactPhone: "(11) 3000-0000",
      timezone: "America/Sao_Paulo",
      isActive: true,
    },
  });

  const plan = await prisma.plan.findUniqueOrThrow({ where: { code: "BASE_MVP" } });

  const existingSub = await prisma.subscription.findFirst({ where: { tenantId: tenant.id } });

  if (!existingSub) {
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: SubscriptionStatus.TRIAL,
        startsAt: new Date(),
        endsAt: trialEndsAt,
      },
    });
  }

  return tenant.id;
}

// ---------------------------------------------------------------------------
// Clinic structure: unit, specialties, consultation types, professional entity
// Returns { unitId, professionalId }
// ---------------------------------------------------------------------------

async function seedDemoAestheticClinicStructure(
  tenantId: string,
): Promise<{ unitId: string; professionalId: string }> {
  // Unit
  const unit = await prisma.unit.upsert({
    where: { tenantId_name: { tenantId, name: "Unidade Principal" } },
    update: { isActive: true },
    create: { tenantId, name: "Unidade Principal", description: "Unidade central da clinica estetica demo", isActive: true },
  });

  // Specialties
  const specialtyMed = await prisma.specialty.upsert({
    where: { tenantId_name: { tenantId, name: "Estetica Facial" } },
    update: { isActive: true },
    create: { tenantId, name: "Estetica Facial", isActive: true },
  });

  await prisma.specialty.upsert({
    where: { tenantId_name: { tenantId, name: "Harmonizacao Orofacial" } },
    update: { isActive: true },
    create: { tenantId, name: "Harmonizacao Orofacial", isActive: true },
  });

  // Note: Consultation types are now seeded separately via seedAestheticProcedures()

  // Professional entity (used for scheduling — separate from the login User)
  const professional = await prisma.professional.upsert({
    where: {
      tenantId_professionalRegister: {
        tenantId,
        professionalRegister: "ESTETICA-RESP-001",
      },
    },
    update: { isActive: true },
    create: {
      tenantId,
      fullName: "Dra. Helena Estetica Demo",
      displayName: "Dra. Helena",
      professionalRegister: "ESTETICA-RESP-001",
      visibleForSelfBooking: true,
      isActive: true,
    },
  });

  // Link professional → unit
  const existingProfUnit = await prisma.professionalUnit.findFirst({
    where: { professionalId: professional.id, unitId: unit.id },
  });
  if (!existingProfUnit) {
    await prisma.professionalUnit.create({
      data: { tenantId, professionalId: professional.id, unitId: unit.id },
    });
  }

  // Link professional → specialty
  const existingProfSpec = await prisma.professionalSpecialty.findFirst({
    where: { professionalId: professional.id, specialtyId: specialtyMed.id },
  });
  if (!existingProfSpec) {
    await prisma.professionalSpecialty.create({
      data: { tenantId, professionalId: professional.id, specialtyId: specialtyMed.id },
    });
  }

  await prisma.professionalSchedule.deleteMany({
    where: {
      tenantId,
      professionalId: professional.id,
    },
  });

  await prisma.professionalSchedule.createMany({
    data: [
      ...[
        ScheduleDayOfWeek.MONDAY,
        ScheduleDayOfWeek.TUESDAY,
        ScheduleDayOfWeek.WEDNESDAY,
        ScheduleDayOfWeek.THURSDAY,
        ScheduleDayOfWeek.FRIDAY,
      ].flatMap((dayOfWeek) => [
        {
          tenantId,
          professionalId: professional.id,
          unitId: unit.id,
          dayOfWeek,
          startTime: new Date("1970-01-01T08:00:00.000Z"),
          endTime: new Date("1970-01-01T12:00:00.000Z"),
          slotIntervalMinutes: 15,
          isActive: true,
        },
        {
          tenantId,
          professionalId: professional.id,
          unitId: unit.id,
          dayOfWeek,
          startTime: new Date("1970-01-01T13:00:00.000Z"),
          endTime: new Date("1970-01-01T18:00:00.000Z"),
          slotIntervalMinutes: 15,
          isActive: true,
        },
      ]),
      {
        tenantId,
        professionalId: professional.id,
        unitId: unit.id,
        dayOfWeek: ScheduleDayOfWeek.SATURDAY,
        startTime: new Date("1970-01-01T08:00:00.000Z"),
        endTime: new Date("1970-01-01T12:00:00.000Z"),
        slotIntervalMinutes: 15,
        isActive: true,
      },
      {
        tenantId,
        professionalId: professional.id,
        unitId: unit.id,
        dayOfWeek: ScheduleDayOfWeek.SUNDAY,
        startTime: new Date("1970-01-01T09:00:00.000Z"),
        endTime: new Date("1970-01-01T12:00:00.000Z"),
        slotIntervalMinutes: 15,
        isActive: true,
      },
    ],
  });

  return { unitId: unit.id, professionalId: professional.id };
}

// ---------------------------------------------------------------------------
// Clinic users — one per role (all share the same demo password)
// ---------------------------------------------------------------------------

const DEMO_PASSWORD = "Demo@123";

const clinicUsersSeed = [
  {
    email: "admin@estetica-demo.local",
    fullName: "Admin da Clinica Estetica Demo",
    role: RoleCode.TENANT_ADMIN,
    label: "Tenant Admin",
  },
  {
    email: "gestor@estetica-demo.local",
    fullName: "Gestora Clinica Estetica Demo",
    role: RoleCode.CLINIC_MANAGER,
    label: "Clinic Manager",
  },
  {
    email: "recepcao@estetica-demo.local",
    fullName: "Recepcionista Demo",
    role: RoleCode.RECEPTION,
    label: "Recepção",
  },
  {
    email: "profissional@estetica-demo.local",
    fullName: "Dra. Helena Estetica Demo",
    role: RoleCode.PROFESSIONAL,
    label: "Profissional",
  },
];

// ---------------------------------------------------------------------------
// Aesthetic procedures catalog — 20+ procedures with metadata
// ---------------------------------------------------------------------------

interface AestheticProcedureData {
  name: string;
  durationMinutes: number;
  aestheticArea: "FACIAL" | "CORPORAL" | "CAPILAR" | "LASER" | "HARMONIZACAO_OROFACIAL" | "PEELING" | "OUTRO";
  invasivenessLevel: "NON_INVASIVE" | "MINIMALLY_INVASIVE" | "MODERATELY_INVASIVE" | "HIGHLY_INVASIVE" | "SURGICAL";
  recoveryDays: number;
  recommendedFrequencyDays: number;
  isFirstVisit?: boolean;
  isReturnVisit?: boolean;
}

const AESTHETIC_PROCEDURES_CATALOG: AestheticProcedureData[] = [
  // Facial procedures
  { name: "Avaliacao Estetica Facial", durationMinutes: 30, aestheticArea: "FACIAL", invasivenessLevel: "NON_INVASIVE", recoveryDays: 0, recommendedFrequencyDays: 365, isFirstVisit: true },
  { name: "Retorno Estetico Facial", durationMinutes: 15, aestheticArea: "FACIAL", invasivenessLevel: "NON_INVASIVE", recoveryDays: 0, recommendedFrequencyDays: 30, isReturnVisit: true },
  { name: "Limpeza de Pele Profunda", durationMinutes: 60, aestheticArea: "FACIAL", invasivenessLevel: "NON_INVASIVE", recoveryDays: 0, recommendedFrequencyDays: 30 },
  { name: "Toxina Botulinica", durationMinutes: 30, aestheticArea: "FACIAL", invasivenessLevel: "MINIMALLY_INVASIVE", recoveryDays: 3, recommendedFrequencyDays: 120 },
  { name: "Preenchimento Facial", durationMinutes: 45, aestheticArea: "FACIAL", invasivenessLevel: "MINIMALLY_INVASIVE", recoveryDays: 3, recommendedFrequencyDays: 180 },
  { name: "Microagulhamento Facial", durationMinutes: 45, aestheticArea: "FACIAL", invasivenessLevel: "MINIMALLY_INVASIVE", recoveryDays: 7, recommendedFrequencyDays: 30 },
  { name: "Peeling Quimico Superficial", durationMinutes: 45, aestheticArea: "FACIAL", invasivenessLevel: "NON_INVASIVE", recoveryDays: 3, recommendedFrequencyDays: 14 },
  { name: "Radiofrequencia Facial", durationMinutes: 60, aestheticArea: "FACIAL", invasivenessLevel: "NON_INVASIVE", recoveryDays: 1, recommendedFrequencyDays: 21 },
  
  // Body procedures
  { name: "Avaliacao Corporal", durationMinutes: 30, aestheticArea: "CORPORAL", invasivenessLevel: "NON_INVASIVE", recoveryDays: 0, recommendedFrequencyDays: 365, isFirstVisit: true },
  { name: "Drenagem Linfatica Manual", durationMinutes: 60, aestheticArea: "CORPORAL", invasivenessLevel: "NON_INVASIVE", recoveryDays: 0, recommendedFrequencyDays: 7 },
  { name: "Radiofrequencia Corporal", durationMinutes: 45, aestheticArea: "CORPORAL", invasivenessLevel: "NON_INVASIVE", recoveryDays: 1, recommendedFrequencyDays: 14 },
  { name: "Criolipolitica", durationMinutes: 60, aestheticArea: "CORPORAL", invasivenessLevel: "MINIMALLY_INVASIVE", recoveryDays: 7, recommendedFrequencyDays: 60 },
  { name: "Emesculptura Corporal", durationMinutes: 45, aestheticArea: "CORPORAL", invasivenessLevel: "NON_INVASIVE", recoveryDays: 1, recommendedFrequencyDays: 21 },

  // Hair procedures
  { name: "Avaliacao Capilar", durationMinutes: 20, aestheticArea: "CAPILAR", invasivenessLevel: "NON_INVASIVE", recoveryDays: 0, recommendedFrequencyDays: 90, isFirstVisit: true },
  { name: "Tratamento Capilar Restaurador", durationMinutes: 60, aestheticArea: "CAPILAR", invasivenessLevel: "NON_INVASIVE", recoveryDays: 0, recommendedFrequencyDays: 21 },
  { name: "Plasma Rico em Plaquetas Capilar", durationMinutes: 45, aestheticArea: "CAPILAR", invasivenessLevel: "MINIMALLY_INVASIVE", recoveryDays: 2, recommendedFrequencyDays: 30 },

  // Laser procedures
  { name: "Epilacao a Laser", durationMinutes: 30, aestheticArea: "LASER", invasivenessLevel: "NON_INVASIVE", recoveryDays: 1, recommendedFrequencyDays: 30 },
  { name: "Limpeza de Manchas a Laser", durationMinutes: 30, aestheticArea: "LASER", invasivenessLevel: "NON_INVASIVE", recoveryDays: 3, recommendedFrequencyDays: 30 },
  { name: "Rejuvenescimento a Laser", durationMinutes: 45, aestheticArea: "LASER", invasivenessLevel: "NON_INVASIVE", recoveryDays: 5, recommendedFrequencyDays: 30 },

  // Harmonization procedures
  { name: "Avaliacao Harmonizacao Orofacial", durationMinutes: 30, aestheticArea: "HARMONIZACAO_OROFACIAL", invasivenessLevel: "NON_INVASIVE", recoveryDays: 0, recommendedFrequencyDays: 365, isFirstVisit: true },
  { name: "Harmonizacao Orofacial", durationMinutes: 60, aestheticArea: "HARMONIZACAO_OROFACIAL", invasivenessLevel: "MINIMALLY_INVASIVE", recoveryDays: 5, recommendedFrequencyDays: 180 },

  // Peeling procedures
  { name: "Peeling Acido Mandélico", durationMinutes: 45, aestheticArea: "PEELING", invasivenessLevel: "NON_INVASIVE", recoveryDays: 3, recommendedFrequencyDays: 14 },
  { name: "Peeling Glicolico", durationMinutes: 45, aestheticArea: "PEELING", invasivenessLevel: "NON_INVASIVE", recoveryDays: 3, recommendedFrequencyDays: 14 },
];

async function seedAestheticProcedures(tenantId: string): Promise<void> {
  for (const proc of AESTHETIC_PROCEDURES_CATALOG) {
    await prisma.consultationType.upsert({
      where: { tenantId_name: { tenantId, name: proc.name } },
      update: {
        durationMinutes: proc.durationMinutes,
        aestheticArea: proc.aestheticArea,
        invasivenessLevel: proc.invasivenessLevel,
        recoveryDays: proc.recoveryDays,
        recommendedFrequencyDays: proc.recommendedFrequencyDays,
        isFirstVisit: proc.isFirstVisit ?? false,
        isReturnVisit: proc.isReturnVisit ?? false,
        isActive: true,
      },
      create: {
        tenantId,
        name: proc.name,
        durationMinutes: proc.durationMinutes,
        aestheticArea: proc.aestheticArea,
        invasivenessLevel: proc.invasivenessLevel,
        recoveryDays: proc.recoveryDays,
        recommendedFrequencyDays: proc.recommendedFrequencyDays,
        isFirstVisit: proc.isFirstVisit ?? false,
        isReturnVisit: proc.isReturnVisit ?? false,
        isActive: true,
      },
    });
  }
}

async function seedAestheticProtocols(tenantId: string): Promise<void> {
  // Protocols are multi-session treatment plans
  // Example: "Botox 3 Sessions" - 3 appointments spaced 15 days apart
  
  const protocols = [
    {
      consultationTypeName: "Toxina Botulinica",
      protocolName: "Tratamento Toxina Botulínica (3 Sessões)",
      description: "Protocolo completo de Toxina Botulínica com 3 sessões espaçadas para máximo resultado",
      totalSessions: 3,
      intervalBetweenSessionsDays: 15,
    },
    {
      consultationTypeName: "Preenchimento Facial",
      protocolName: "Protocolo Preenchimento Facial (2 Sessões)",
      description: "Preenchimento em duas etapas para melhor integração e resultado natural",
      totalSessions: 2,
      intervalBetweenSessionsDays: 7,
    },
    {
      consultationTypeName: "Microagulhamento Facial",
      protocolName: "Microagulhamento Intensivo (6 Sessões)",
      description: "Série completa de microagulhamento para rejuvenescimento facial profundo",
      totalSessions: 6,
      intervalBetweenSessionsDays: 21,
    },
    {
      consultationTypeName: "Plasma Rico em Plaquetas Capilar",
      protocolName: "PRP Capilar Completo (4 Sessões)",
      description: "Protocolo de 4 sessões de PRP para reabilitação capilar",
      totalSessions: 4,
      intervalBetweenSessionsDays: 30,
    },
    {
      consultationTypeName: "Harmonizacao Orofacial",
      protocolName: "Harmonização Completa (3 Sessões)",
      description: "Harmonização facial e orofacial em três etapas de 15 dias",
      totalSessions: 3,
      intervalBetweenSessionsDays: 15,
    },
  ];

  for (const proto of protocols) {
    const consultationType = await prisma.consultationType.findFirst({
      where: {
        tenantId,
        name: proto.consultationTypeName,
      },
    });

    if (consultationType) {
      await prisma.procedureProtocol.upsert({
        where: { tenantId_consultationTypeId_name: { tenantId, consultationTypeId: consultationType.id, name: proto.protocolName } },
        update: {
          description: proto.description,
          totalSessions: proto.totalSessions,
          intervalBetweenSessionsDays: proto.intervalBetweenSessionsDays,
          isActive: true,
        },
        create: {
          tenantId,
          consultationTypeId: consultationType.id,
          name: proto.protocolName,
          description: proto.description,
          totalSessions: proto.totalSessions,
          intervalBetweenSessionsDays: proto.intervalBetweenSessionsDays,
          isActive: true,
        },
      });
    }
  }
}

async function seedClinicUsers(tenantId: string): Promise<void> {
  const { professionalId } = await seedDemoAestheticClinicStructure(tenantId);
  const passwordHash = await hash(DEMO_PASSWORD, 10);

  for (const u of clinicUsersSeed) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { fullName: u.fullName, passwordHash, status: UserStatus.ACTIVE },
      create: { email: u.email, fullName: u.fullName, passwordHash, status: UserStatus.ACTIVE },
    });

    await assignRole(user.id, u.role, tenantId);

    if (u.role === RoleCode.PROFESSIONAL) {
      await prisma.professional.update({
        where: { id: professionalId },
        data: { userId: user.id },
      });
    }
  }
}

interface DemoWorkspacePatientFixture {
  key: string;
  fullName: string;
  documentNumber: string;
  birthDate: string;
  phone: string;
  patientNotes: string;
}

async function upsertDemoWorkspacePatient(
  tenantId: string,
  fixture: DemoWorkspacePatientFixture,
): Promise<{ id: string }> {
  const existingPatient = await prisma.patient.findFirst({
    where: {
      tenantId,
      documentNumber: fixture.documentNumber,
    },
    select: {
      id: true,
    },
  });

  const patient = existingPatient
    ? await prisma.patient.update({
        where: { id: existingPatient.id },
        data: {
          fullName: fixture.fullName,
          birthDate: new Date(fixture.birthDate),
          documentNumber: fixture.documentNumber,
          notes: fixture.patientNotes,
          isActive: true,
        },
        select: {
          id: true,
        },
      })
    : await prisma.patient.create({
        data: {
          tenantId,
          fullName: fixture.fullName,
          birthDate: new Date(fixture.birthDate),
          documentNumber: fixture.documentNumber,
          notes: fixture.patientNotes,
          isActive: true,
        },
        select: {
          id: true,
        },
      });

  const normalizedPhone = normalizePhone(fixture.phone);
  const existingContact = await prisma.patientContact.findFirst({
    where: {
      tenantId,
      type: PatientContactType.PHONE,
      normalizedValue: normalizedPhone,
    },
    select: {
      id: true,
      patientId: true,
    },
  });

  if (existingContact && existingContact.patientId !== patient.id) {
    await prisma.patientContact.delete({
      where: { id: existingContact.id },
    });
  }

  await prisma.patientContact.upsert({
    where: {
      tenantId_type_normalizedValue: {
        tenantId,
        type: PatientContactType.PHONE,
        normalizedValue: normalizedPhone,
      },
    },
    update: {
      patientId: patient.id,
      value: fixture.phone,
      isPrimary: true,
    },
    create: {
      tenantId,
      patientId: patient.id,
      type: PatientContactType.PHONE,
      value: fixture.phone,
      normalizedValue: normalizedPhone,
      isPrimary: true,
    },
  });

  return patient;
}

async function seedProfessionalWorkspaceFixtures(tenantId: string): Promise<void> {
  const professional = await prisma.professional.findFirstOrThrow({
    where: {
      tenantId,
      professionalRegister: "ESTETICA-RESP-001",
    },
    select: {
      id: true,
      userId: true,
    },
  });

  const unit = await prisma.unit.findFirstOrThrow({
    where: {
      tenantId,
      name: "Unidade Principal",
    },
    select: {
      id: true,
    },
  });

  const consultationTypes = await prisma.consultationType.findMany({
    where: {
      tenantId,
      name: {
        in: [
          "Limpeza de Pele Profunda",
          "Toxina Botulinica",
          "Microagulhamento Facial",
          "Retorno Estetico Facial",
          "Harmonizacao Orofacial",
        ],
      },
    },
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      bufferBeforeMinutes: true,
      bufferAfterMinutes: true,
    },
  });

  const consultationTypeMap = new Map(
    consultationTypes.map((item) => [item.name, item]),
  );

  const requiredConsultationTypes = [
    "Limpeza de Pele Profunda",
    "Toxina Botulinica",
    "Microagulhamento Facial",
    "Retorno Estetico Facial",
    "Harmonizacao Orofacial",
  ];

  for (const consultationTypeName of requiredConsultationTypes) {
    if (!consultationTypeMap.has(consultationTypeName)) {
      throw new Error(
        `Consultation type ${consultationTypeName} was not seeded for demo fixtures.`,
      );
    }
  }

  const patientFixtures: DemoWorkspacePatientFixture[] = [
    {
      key: "camila",
      fullName: "Camila Alves",
      documentNumber: "11122233344",
      birthDate: "1991-04-12",
      phone: "(11) 99888-1101",
      patientNotes: "Paciente demo do workspace profissional. Historico de sensibilidade cutanea no pos-procedimento.",
    },
    {
      key: "renata",
      fullName: "Renata Mota",
      documentNumber: "22233344455",
      birthDate: "1987-08-05",
      phone: "(11) 99888-1102",
      patientNotes: "Paciente demo com retorno frequente para harmonizacao facial.",
    },
    {
      key: "patricia",
      fullName: "Patricia Nogueira",
      documentNumber: "33344455566",
      birthDate: "1994-01-19",
      phone: "(11) 99888-1103",
      patientNotes: "Paciente demo em acompanhamento de limpeza e revitalizacao.",
    },
    {
      key: "luiza",
      fullName: "Luiza Tavares",
      documentNumber: "44455566677",
      birthDate: "1989-11-27",
      phone: "(11) 99888-1104",
      patientNotes: "Paciente demo com foco em manutencao facial e orientacao domiciliar.",
    },
  ];

  const patients = new Map<string, { id: string }>();
  for (const fixture of patientFixtures) {
    const patient = await upsertDemoWorkspacePatient(tenantId, fixture);
    patients.set(fixture.key, patient);
  }

  await prisma.appointment.deleteMany({
    where: {
      tenantId,
      idempotencyKey: {
        startsWith: "demo-professional-workspace-",
      },
    },
  });

  const now = new Date();
  const roundedNow = roundUpToQuarterHour(now);

  const completedTodayStart = addMinutes(roundedNow, -180);
  const completedTodayEnd = addMinutes(
    completedTodayStart,
    consultationTypeMap.get("Microagulhamento Facial")!.durationMinutes,
  );
  const waitingStart = addMinutes(roundedNow, -20);
  const waitingEnd = addMinutes(
    waitingStart,
    consultationTypeMap.get("Limpeza de Pele Profunda")!.durationMinutes,
  );
  const nextStart = addMinutes(roundedNow, 45);
  const nextEnd = addMinutes(
    nextStart,
    consultationTypeMap.get("Toxina Botulinica")!.durationMinutes,
  );
  const laterTodayStart = addMinutes(roundedNow, 180);
  const laterTodayEnd = addMinutes(
    laterTodayStart,
    consultationTypeMap.get("Retorno Estetico Facial")!.durationMinutes,
  );
  const tomorrowStart = addMinutes(addDays(roundedNow, 1), 120);
  const tomorrowEnd = addMinutes(
    tomorrowStart,
    consultationTypeMap.get("Harmonizacao Orofacial")!.durationMinutes,
  );
  const nextWeekStart = addMinutes(addDays(roundedNow, 3), 90);
  const nextWeekEnd = addMinutes(
    nextWeekStart,
    consultationTypeMap.get("Retorno Estetico Facial")!.durationMinutes,
  );
  const historicalOneStart = addDays(completedTodayStart, -21);
  const historicalOneEnd = addMinutes(
    historicalOneStart,
    consultationTypeMap.get("Limpeza de Pele Profunda")!.durationMinutes,
  );
  const historicalTwoStart = addDays(completedTodayStart, -35);
  const historicalTwoEnd = addMinutes(
    historicalTwoStart,
    consultationTypeMap.get("Toxina Botulinica")!.durationMinutes,
  );

  const appointments = [
    {
      idempotencyKey: "demo-professional-workspace-history-camila",
      patientId: patients.get("camila")!.id,
      consultationTypeName: "Limpeza de Pele Profunda",
      room: "Sala 1",
      startsAt: historicalOneStart,
      endsAt: historicalOneEnd,
      status: AppointmentStatus.COMPLETED,
      confirmedAt: addDays(historicalOneStart, -2),
      checkedInAt: addMinutes(historicalOneStart, -10),
      calledAt: addMinutes(historicalOneStart, -4),
      startedAt: historicalOneStart,
      closureReadyAt: addMinutes(historicalOneEnd, -5),
      completedAt: historicalOneEnd,
      notes: buildClinicalNotes({
        preparation:
          "Pele sensibilizada em regiao malar. Reforcar limpeza suave e evitar acidos por 72h.",
        intercurrence:
          "Edema leve apos extracao manual, sem necessidade de medicacao adicional.",
        guidance:
          "Manter fotoprotecao rigorosa e retornar se houver ardor persistente.",
      }),
    },
    {
      idempotencyKey: "demo-professional-workspace-history-renata",
      patientId: patients.get("renata")!.id,
      consultationTypeName: "Toxina Botulinica",
      room: "Sala 2",
      startsAt: historicalTwoStart,
      endsAt: historicalTwoEnd,
      status: AppointmentStatus.COMPLETED,
      confirmedAt: addDays(historicalTwoStart, -3),
      checkedInAt: addMinutes(historicalTwoStart, -8),
      calledAt: addMinutes(historicalTwoStart, -3),
      startedAt: historicalTwoStart,
      closureReadyAt: addMinutes(historicalTwoEnd, -4),
      completedAt: historicalTwoEnd,
      notes: buildClinicalNotes({
        preparation:
          "Pele integra, sem irritacao no dia do procedimento.",
        guidance:
          "Nao manipular regiao frontal por 24h e evitar atividade intensa no mesmo dia.",
      }),
    },
    {
      idempotencyKey: "demo-professional-workspace-completed-luiza",
      patientId: patients.get("luiza")!.id,
      consultationTypeName: "Microagulhamento Facial",
      room: "Sala 3",
      startsAt: completedTodayStart,
      endsAt: completedTodayEnd,
      status: AppointmentStatus.AWAITING_PAYMENT,
      confirmedAt: addDays(completedTodayStart, -1),
      checkedInAt: addMinutes(completedTodayStart, -12),
      calledAt: addMinutes(completedTodayStart, -4),
      startedAt: completedTodayStart,
      closureReadyAt: addMinutes(completedTodayEnd, -6),
      awaitingPaymentAt: completedTodayEnd,
      completedAt: null,
      notes: buildClinicalNotes({
        preparation:
          "Paciente chegou com pele higienizada e sem maquiagem.",
        guidance:
          "Evitar calor excessivo e maquiagem nas proximas 24h.",
        operational:
          "Procedimento finalizado sem intercorrencias. Fotos registradas no prontuario.",
      }),
    },
    {
      idempotencyKey: "demo-professional-workspace-waiting-camila",
      patientId: patients.get("camila")!.id,
      consultationTypeName: "Limpeza de Pele Profunda",
      room: "Sala 1",
      startsAt: waitingStart,
      endsAt: waitingEnd,
      status: AppointmentStatus.CHECKED_IN,
      confirmedAt: addDays(waitingStart, -1),
      checkedInAt: addMinutes(waitingStart, -5),
      notes: "Paciente ja aguardando na recepcao. Confirmar sensibilidade recente antes de iniciar.",
    },
    {
      idempotencyKey: "demo-professional-workspace-next-renata",
      patientId: patients.get("renata")!.id,
      consultationTypeName: "Toxina Botulinica",
      room: "Sala 2",
      startsAt: nextStart,
      endsAt: nextEnd,
      status: AppointmentStatus.CONFIRMED,
      confirmedAt: addDays(nextStart, -1),
      notes: "Retorno de ajuste fino. Conferir registro fotografico anterior antes da aplicacao.",
    },
    {
      idempotencyKey: "demo-professional-workspace-booked-patricia",
      patientId: patients.get("patricia")!.id,
      consultationTypeName: "Retorno Estetico Facial",
      room: "Sala 1",
      startsAt: laterTodayStart,
      endsAt: laterTodayEnd,
      status: AppointmentStatus.BOOKED,
      notes: "Paciente sem confirmacao final. Revisar disponibilidade de encaixe no periodo da tarde.",
    },
    {
      idempotencyKey: "demo-professional-workspace-upcoming-patricia",
      patientId: patients.get("patricia")!.id,
      consultationTypeName: "Harmonizacao Orofacial",
      room: "Sala 2",
      startsAt: tomorrowStart,
      endsAt: tomorrowEnd,
      status: AppointmentStatus.CONFIRMED,
      confirmedAt: addDays(tomorrowStart, -2),
      notes: "Sessao de continuidade. Separar material de marcacao facial.",
    },
    {
      idempotencyKey: "demo-professional-workspace-upcoming-camila",
      patientId: patients.get("camila")!.id,
      consultationTypeName: "Retorno Estetico Facial",
      room: "Sala 1",
      startsAt: nextWeekStart,
      endsAt: nextWeekEnd,
      status: AppointmentStatus.BOOKED,
      notes: "Retorno de acompanhamento para reavaliar resposta da pele e reforcar orientacoes.",
    },
  ];

  for (const appointment of appointments) {
    const consultationType = consultationTypeMap.get(
      appointment.consultationTypeName,
    )!;

    await prisma.appointment.create({
      data: {
        tenantId,
        patientId: appointment.patientId,
        professionalId: professional.id,
        consultationTypeId: consultationType.id,
        unitId: unit.id,
        room: appointment.room,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        durationMinutes: consultationType.durationMinutes,
        bufferBeforeMinutes: consultationType.bufferBeforeMinutes,
        bufferAfterMinutes: consultationType.bufferAfterMinutes,
        status: appointment.status,
        confirmedAt: appointment.confirmedAt ?? null,
        checkedInAt: appointment.checkedInAt ?? null,
        calledAt: appointment.calledAt ?? null,
        startedAt: appointment.startedAt ?? null,
        closureReadyAt: appointment.closureReadyAt ?? null,
        awaitingPaymentAt: appointment.awaitingPaymentAt ?? null,
        completedAt: appointment.completedAt ?? null,
        idempotencyKey: appointment.idempotencyKey,
        notes: appointment.notes ?? null,
        createdByUserId: professional.userId,
        updatedByUserId: professional.userId,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.info("▶ Seeding roles...");
  await seedRoles();

  console.info("▶ Seeding super admin...");
  await seedSuperAdmin();

  console.info("▶ Seeding base plan...");
  await seedBasePlan();

  console.info("▶ Seeding public commercial plans...");
  await seedCommercialPlans();

  console.info("▶ Seeding demo tenant + clinic + subscription...");
  const tenantId = await seedDemoTenant();

  console.info("▶ Seeding aesthetic procedures catalog (20+ procedures)...");
  await seedAestheticProcedures(tenantId);

  console.info("▶ Seeding aesthetic protocols (multi-session treatments)...");
  await seedAestheticProtocols(tenantId);

  console.info("▶ Seeding clinic users (all roles)...");
  await seedClinicUsers(tenantId);

  console.info("▶ Seeding professional workspace demo fixtures...");
  await seedProfessionalWorkspaceFixtures(tenantId);

  console.info("");
  console.info("=".repeat(60));
  console.info("  TEST CREDENTIALS");
  console.info("=".repeat(60));
  console.info("");
  console.info("  PLATFORM LOGIN → http://localhost:3000/login/platform");
  console.info(`    Super Admin     ${process.env.SEED_SUPER_ADMIN_EMAIL ?? "superadmin@operaclinic.local"}  /  ${process.env.SEED_SUPER_ADMIN_PASSWORD ?? "(senha do .env)"}`);
  console.info("");
  console.info("  CLINIC LOGIN    → http://localhost:3000/login/clinic");
  console.info(`    Tenant Admin    admin@estetica-demo.local        /  ${DEMO_PASSWORD}`);
  console.info(`    Clinic Manager  gestor@estetica-demo.local       /  ${DEMO_PASSWORD}`);
  console.info(`    Recepção        recepcao@estetica-demo.local      /  ${DEMO_PASSWORD}`);
  console.info(`    Profissional    profissional@estetica-demo.local  /  ${DEMO_PASSWORD}`);
  console.info("=".repeat(60));
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.info("\nSeed completed successfully.");
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
