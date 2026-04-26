import { hash } from "bcryptjs";
import { PatientContactType, PrismaClient, RoleCode, ScheduleDayOfWeek, UserStatus } from "@prisma/client";
import { SMOKE_E2E } from "@operaclinic/shared";

const prisma = new PrismaClient();

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

async function ensureClinicUser(
  tenantId: string,
  input: {
    email: string;
    fullName: string;
    roleCode: RoleCode;
    password: string;
  },
): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { code: input.roleCode },
    select: { id: true },
  });
  const passwordHash = await hash(input.password, 10);

  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {
      fullName: input.fullName,
      passwordHash,
      passwordChangedAt: new Date(),
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      sessionVersion: 0,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: input.email,
      fullName: input.fullName,
      passwordHash,
      passwordChangedAt: new Date(),
      status: UserStatus.ACTIVE,
    },
    select: {
      id: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId_tenantId: {
        userId: user.id,
        roleId: role.id,
        tenantId,
      },
    },
    update: {},
    create: {
      userId: user.id,
      roleId: role.id,
      tenantId,
    },
  });
}

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: SMOKE_E2E.tenantSlug },
    select: {
      id: true,
      timezone: true,
    },
  });

  if (!tenant) {
    throw new Error(
      `Tenant ${SMOKE_E2E.tenantSlug} not found. Run prisma seed before the smoke fixture.`,
    );
  }

  const unit = await prisma.unit.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: SMOKE_E2E.aestheticClinicResources.unitName,
      },
    },
    update: {
      isActive: true,
      description: "Fixture unit for smoke E2E.",
    },
    create: {
      tenantId: tenant.id,
      name: SMOKE_E2E.aestheticClinicResources.unitName,
      description: "Fixture unit for smoke E2E.",
      isActive: true,
    },
  });

  const consultationType = await prisma.consultationType.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: SMOKE_E2E.aestheticClinicResources.consultationTypeName,
      },
    },
    update: {
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      isActive: true,
    },
    create: {
      tenantId: tenant.id,
      name: SMOKE_E2E.aestheticClinicResources.consultationTypeName,
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      isFirstVisit: true,
      isActive: true,
    },
  });

  const professional = await prisma.professional.upsert({
    where: {
      tenantId_professionalRegister: {
        tenantId: tenant.id,
        professionalRegister: SMOKE_E2E.aestheticClinicResources.professionalRegister,
      },
    },
    update: {
      fullName: SMOKE_E2E.aestheticClinicResources.professionalFullName,
      displayName: SMOKE_E2E.aestheticClinicResources.professionalDisplayName,
      isActive: true,
      visibleForSelfBooking: false,
      userId: null,
    },
    create: {
      tenantId: tenant.id,
      fullName: SMOKE_E2E.aestheticClinicResources.professionalFullName,
      displayName: SMOKE_E2E.aestheticClinicResources.professionalDisplayName,
      professionalRegister: SMOKE_E2E.aestheticClinicResources.professionalRegister,
      visibleForSelfBooking: false,
      isActive: true,
    },
  });

  await prisma.professionalUnit.deleteMany({
    where: {
      tenantId: tenant.id,
      professionalId: professional.id,
      NOT: {
        unitId: unit.id,
      },
    },
  });

  await prisma.professionalUnit.upsert({
    where: {
      professionalId_unitId: {
        professionalId: professional.id,
        unitId: unit.id,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      professionalId: professional.id,
      unitId: unit.id,
    },
  });

  await prisma.professionalSchedule.deleteMany({
    where: {
      tenantId: tenant.id,
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
          tenantId: tenant.id,
          professionalId: professional.id,
          unitId: unit.id,
          dayOfWeek,
          startTime: new Date("1970-01-01T08:00:00.000Z"),
          endTime: new Date("1970-01-01T12:00:00.000Z"),
          slotIntervalMinutes: 15,
          isActive: true,
        },
        {
          tenantId: tenant.id,
          professionalId: professional.id,
          unitId: unit.id,
          dayOfWeek,
          startTime: new Date("1970-01-01T13:00:00.000Z"),
          endTime: new Date("1970-01-01T22:00:00.000Z"),
          slotIntervalMinutes: 15,
          isActive: true,
        },
      ]),
      {
        tenantId: tenant.id,
        professionalId: professional.id,
        unitId: unit.id,
        dayOfWeek: ScheduleDayOfWeek.SATURDAY,
        startTime: new Date("1970-01-01T08:00:00.000Z"),
        endTime: new Date("1970-01-01T12:00:00.000Z"),
        slotIntervalMinutes: 15,
        isActive: true,
      },
      {
        tenantId: tenant.id,
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

  const existingPatient = await prisma.patient.findFirst({
    where: {
      tenantId: tenant.id,
      documentNumber: SMOKE_E2E.aestheticClinicResources.patientDocumentNumber,
    },
    select: {
      id: true,
    },
  });

  const patient = existingPatient
    ? await prisma.patient.update({
        where: { id: existingPatient.id },
        data: {
          fullName: SMOKE_E2E.aestheticClinicResources.patientFullName,
          documentNumber: SMOKE_E2E.aestheticClinicResources.patientDocumentNumber,
          isActive: true,
          notes: "Fixture patient for smoke E2E.",
        },
      })
    : await prisma.patient.create({
        data: {
          tenantId: tenant.id,
          fullName: SMOKE_E2E.aestheticClinicResources.patientFullName,
          documentNumber: SMOKE_E2E.aestheticClinicResources.patientDocumentNumber,
          isActive: true,
          notes: "Fixture patient for smoke E2E.",
        },
      });

  const normalizedPhone = normalizePhone(SMOKE_E2E.aestheticClinicResources.patientContactValue);

  const existingContact = await prisma.patientContact.findFirst({
    where: {
      tenantId: tenant.id,
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
        tenantId: tenant.id,
        type: PatientContactType.PHONE,
        normalizedValue: normalizedPhone,
      },
    },
    update: {
      patientId: patient.id,
      value: SMOKE_E2E.aestheticClinicResources.patientContactValue,
      isPrimary: true,
    },
    create: {
      tenantId: tenant.id,
      patientId: patient.id,
      type: PatientContactType.PHONE,
      value: SMOKE_E2E.aestheticClinicResources.patientContactValue,
      normalizedValue: normalizedPhone,
      isPrimary: true,
    },
  });

  await prisma.appointment.deleteMany({
    where: {
      tenantId: tenant.id,
      professionalId: professional.id,
      startsAt: {
        gte: new Date(),
      },
    },
  });

  await prisma.slotHold.deleteMany({
    where: {
      tenantId: tenant.id,
      professionalId: professional.id,
      startsAt: {
        gte: new Date(),
      },
    },
  });

  await ensureClinicUser(tenant.id, {
    email: SMOKE_E2E.aestheticClinicAccountUser.email,
    fullName: SMOKE_E2E.aestheticClinicAccountUser.fullName,
    roleCode: RoleCode.CLINIC_MANAGER,
    password: SMOKE_E2E.smokePassword,
  });

  await ensureClinicUser(tenant.id, {
    email: SMOKE_E2E.aestheticClinicResetUser.email,
    fullName: SMOKE_E2E.aestheticClinicResetUser.fullName,
    roleCode: RoleCode.CLINIC_MANAGER,
    password: SMOKE_E2E.smokePassword,
  });

  await ensureClinicUser(tenant.id, {
    email: SMOKE_E2E.aestheticClinicLifecycleUser.email,
    fullName: SMOKE_E2E.aestheticClinicLifecycleUser.fullName,
    roleCode: RoleCode.RECEPTION,
    password: SMOKE_E2E.smokePassword,
  });

  console.info("Smoke E2E fixture ready.");
  console.info(`Smoke patient: ${patient.id}`);
  console.info(`Smoke professional: ${professional.id}`);
  console.info(`Smoke consultation type: ${consultationType.id}`);
  console.info(`Smoke unit: ${unit.id}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Smoke E2E fixture failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
