import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { RoleCode } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { AuthenticatedUser } from "../src/auth/interfaces/authenticated-user.interface";
import { PrismaService } from "../src/database/prisma.service";
import { ReceptionService } from "../src/modules/reception/reception.service";

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const prisma = app.get(PrismaService);
    const receptionService = app.get(ReceptionService);

    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { slug: "estetica-demo" },
      select: { id: true, name: true },
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "recepcao@estetica-demo.local" },
      include: {
        userRoles: {
          where: { tenantId: tenant.id },
          include: { role: true },
        },
      },
    });

    const actor: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      profile: "clinic",
      roles: user.userRoles.map((entry) => entry.role.code as RoleCode),
      tenantIds: [tenant.id],
      activeTenantId: tenant.id,
      sessionVersion: user.sessionVersion,
    };

    const professional = await prisma.professional.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        professionalRegister: "ESTETICA-SMOKE-E2E",
      },
      select: { id: true },
    });

    const consultationType = await prisma.consultationType.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        name: "Avaliacao Estetica Smoke E2E",
      },
      select: { id: true },
    });

    const unit = await prisma.unit.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        name: "Unidade Estetica Smoke E2E",
      },
      select: { id: true },
    });

    const patient = await prisma.patient.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        fullName: "Paciente Smoke E2E",
      },
      select: { id: true },
    });

    console.log(
      "Resolved resources",
      JSON.stringify(
        {
          tenantId: tenant.id,
          professionalId: professional.id,
          consultationTypeId: consultationType.id,
          unitId: unit.id,
          patientId: patient.id,
        },
        null,
        2,
      ),
    );

    const availability = await receptionService.searchAvailability(actor, {
      professionalId: professional.id,
      consultationTypeId: consultationType.id,
      unitId: unit.id,
      date: "2026-04-04",
    });

    const slot = availability[0];

    if (!slot) {
      throw new Error("No slot returned by receptionService.searchAvailability.");
    }

    console.log("Resolved slot", slot);

    const created = await receptionService.createManualAppointment(actor, {
      patientId: patient.id,
      professionalId: professional.id,
      consultationTypeId: consultationType.id,
      unitId: unit.id,
      startsAt: slot.startsAt,
      room: "Sala Estetica Smoke",
      notes: "Atendimento estetico Smoke E2E",
      idempotencyKey: `debug-${Date.now()}`,
    });

    console.log("Appointment created", created.id, created.status);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("debug-reception-appointment failed");
  console.error(error);
  process.exit(1);
});