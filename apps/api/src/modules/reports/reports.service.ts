import { Injectable, ForbiddenException } from "@nestjs/common";
import { AppointmentStatus } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { PrismaService } from "../../database/prisma.service";

function escapeCsvField(value: string | null | undefined): string {
  const str = value ?? "";
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(fields: (string | null | undefined)[]): string {
  return fields.map(escapeCsvField).join(",");
}

function translateAppointmentStatus(status: AppointmentStatus): string {
  const map: Record<AppointmentStatus, string> = {
    BOOKED: "Agendado",
    RESCHEDULED: "Reagendado",
    CONFIRMED: "Confirmado",
    CHECKED_IN: "Check-in realizado",
    CALLED: "Chamado",
    IN_PROGRESS: "Em atendimento",
    AWAITING_CLOSURE: "Aguardando encerramento",
    AWAITING_PAYMENT: "Aguardando pagamento",
    COMPLETED: "Concluído",
    CANCELED: "Cancelado",
    NO_SHOW: "Não compareceu",
  };
  return map[status] ?? status;
}

function resolveActiveTenantId(actor: AuthenticatedUser): string {
  if (actor.profile !== "clinic") {
    throw new ForbiddenException(
      "Reports endpoints are available only for clinic profiles.",
    );
  }

  if (!actor.activeTenantId) {
    throw new ForbiddenException("Active tenant context is required.");
  }

  return actor.activeTenantId;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async exportAppointmentsCsv(
    actor: AuthenticatedUser,
    query: { from?: string; to?: string },
  ): Promise<string> {
    const tenantId = resolveActiveTenantId(actor);

    const where: {
      tenantId: string;
      startsAt?: { gte?: Date; lte?: Date };
    } = { tenantId };

    if (query.from || query.to) {
      where.startsAt = {};
      if (query.from) {
        where.startsAt.gte = new Date(`${query.from}T00:00:00.000Z`);
      }
      if (query.to) {
        where.startsAt.lte = new Date(`${query.to}T23:59:59.999Z`);
      }
    }

    const appointments = await this.prisma.appointment.findMany({
      where,
      include: {
        patient: {
          select: { fullName: true },
        },
        professional: {
          select: { displayName: true },
        },
        consultationType: {
          select: { name: true },
        },
      },
      orderBy: { startsAt: "asc" },
    });

    const headers = buildCsvRow([
      "ID",
      "Paciente",
      "Profissional",
      "Procedimento",
      "Data/Hora",
      "Duração(min)",
      "Status",
      "Notas",
    ]);

    const rows = appointments.map((apt) =>
      buildCsvRow([
        apt.id,
        apt.patient.fullName,
        apt.professional.displayName,
        apt.consultationType.name,
        apt.startsAt.toISOString(),
        String(apt.durationMinutes),
        translateAppointmentStatus(apt.status),
        apt.notes,
      ]),
    );

    return [headers, ...rows].join("\r\n");
  }

  async exportPatientsCsv(
    actor: AuthenticatedUser,
    query: { search?: string },
  ): Promise<string> {
    const tenantId = resolveActiveTenantId(actor);

    const where: {
      tenantId: string;
      mergedIntoPatientId: null;
      OR?: Array<{ fullName?: { contains: string; mode: "insensitive" }; documentNumber?: { contains: string; mode: "insensitive" } }>;
    } = {
      tenantId,
      mergedIntoPatientId: null,
    };

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { documentNumber: { contains: search, mode: "insensitive" } },
      ];
    }

    const patients = await this.prisma.patient.findMany({
      where,
      include: {
        contacts: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
        _count: {
          select: { appointments: true },
        },
      },
      orderBy: { fullName: "asc" },
    });

    const headers = buildCsvRow([
      "ID",
      "Nome",
      "Telefone",
      "Email",
      "Criado em",
      "Total de agendamentos",
    ]);

    const rows = patients.map((patient) => {
      const primaryContact =
        patient.contacts.find((c) => c.isPrimary)?.value ??
        patient.contacts[0]?.value ??
        null;

      return buildCsvRow([
        patient.id,
        patient.fullName,
        primaryContact,
        null,
        patient.createdAt.toISOString(),
        String(patient._count.appointments),
      ]);
    });

    return [headers, ...rows].join("\r\n");
  }
}
