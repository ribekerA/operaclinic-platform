import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import {
  Prisma,
  RoleCode,
  ScheduleDayOfWeek,
  SubscriptionStatus,
  TenantStatus,
  UserStatus,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";

const DEMO_PASSWORD = "Demo@1234";
export const DEMO_EMAIL_DOMAIN = "demo.operaclinic.local";
const DEMO_TENANT_TTL_HOURS = 24;
const DEMO_SUBSCRIPTION_TTL_DAYS = 90;
const MAX_SLUG_ATTEMPTS = 5;
const MAX_SLUG_BASE_LENGTH = 48;

const ROLE_CATALOG = [
  {
    code: RoleCode.TENANT_ADMIN,
    name: "Tenant Admin",
    description: "Clinic tenant administration.",
  },
  {
    code: RoleCode.CLINIC_MANAGER,
    name: "Clinic Manager",
    description:
      "Clinic structure and operational configuration management.",
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

const DEMO_SERVICES = [
  {
    name: "Avaliação Inicial",
    durationMinutes: 30,
    isFirstVisit: true,
    isReturnVisit: false,
    aestheticArea: "FACIAL" as const,
    invasivenessLevel: "NON_INVASIVE" as const,
    recoveryDays: 0,
    recommendedFrequencyDays: 365,
  },
  {
    name: "Limpeza de Pele Profunda",
    durationMinutes: 60,
    isFirstVisit: false,
    isReturnVisit: false,
    aestheticArea: "FACIAL" as const,
    invasivenessLevel: "NON_INVASIVE" as const,
    recoveryDays: 0,
    recommendedFrequencyDays: 30,
  },
  {
    name: "Toxina Botulínica",
    durationMinutes: 30,
    isFirstVisit: false,
    isReturnVisit: false,
    aestheticArea: "FACIAL" as const,
    invasivenessLevel: "MINIMALLY_INVASIVE" as const,
    recoveryDays: 3,
    recommendedFrequencyDays: 120,
  },
  {
    name: "Preenchimento Labial",
    durationMinutes: 45,
    isFirstVisit: false,
    isReturnVisit: false,
    aestheticArea: "FACIAL" as const,
    invasivenessLevel: "MINIMALLY_INVASIVE" as const,
    recoveryDays: 3,
    recommendedFrequencyDays: 180,
  },
];

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_BASE_LENGTH);

  return slug || "clinica-demo";
}

function randomSuffix(length = 4): string {
  return randomBytes(length).toString("hex").slice(0, length);
}

export interface CreateLeadDemoResult {
  slug: string;
  expiresAt: Date;
}

@Injectable()
export class DemoMultiTenantService {
  private readonly logger = new Logger(DemoMultiTenantService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createLeadDemo(leadClinicName: string): Promise<CreateLeadDemoResult> {
    await this.ensureRoles();
    const planId = await this.ensureBasePlan();

    const baseSlug = slugify(leadClinicName);

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSuffix()}`;

      try {
        const expiresAt = await this.provisionTenant(
          slug,
          leadClinicName,
          planId,
        );
        return { slug, expiresAt };
      } catch (error) {
        if (
          this.isUniqueConstraintError(error) &&
          attempt < MAX_SLUG_ATTEMPTS - 1
        ) {
          this.logger.warn(
            `Slug collision for "${slug}", retrying with new suffix.`,
          );
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      "Failed to provision demo tenant after multiple attempts.",
    );
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private async provisionTenant(
    slug: string,
    leadClinicName: string,
    planId: string,
  ): Promise<Date> {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + DEMO_TENANT_TTL_HOURS * 60 * 60 * 1000,
    );
    const subscriptionEndsAt = new Date(
      now.getTime() + DEMO_SUBSCRIPTION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    const passwordHash = await hash(DEMO_PASSWORD, 10);

    await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug,
          name: leadClinicName,
          status: TenantStatus.ACTIVE,
          timezone: "America/Sao_Paulo",
        },
      });

      await tx.clinic.create({
        data: {
          tenantId: tenant.id,
          displayName: leadClinicName,
          contactEmail: `admin+${slug}@${DEMO_EMAIL_DOMAIN}`,
          timezone: "America/Sao_Paulo",
          isActive: true,
        },
      });

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId,
          status: SubscriptionStatus.TRIAL,
          startsAt: now,
          endsAt: subscriptionEndsAt,
        },
      });

      const unit = await tx.unit.create({
        data: {
          tenantId: tenant.id,
          name: `${leadClinicName} - Unidade Principal`,
          isActive: true,
        },
      });

      const specialty = await tx.specialty.create({
        data: { tenantId: tenant.id, name: "Estética Avançada", isActive: true },
      });

      const professionalRole = await tx.role.findUnique({
        where: { code: RoleCode.PROFESSIONAL },
      });

      const professionals = [
        {
          register: `DEMO-${slug}-ANA-001`,
          fullName: "Dra. Ana Ferreira",
          displayName: "Dra. Ana",
          email: `ana+${slug}@${DEMO_EMAIL_DOMAIN}`,
        },
        {
          register: `DEMO-${slug}-CARLOS-001`,
          fullName: "Dr. Carlos Lima",
          displayName: "Dr. Carlos",
          email: `carlos+${slug}@${DEMO_EMAIL_DOMAIN}`,
        },
      ];

      const weekdays = [
        ScheduleDayOfWeek.MONDAY,
        ScheduleDayOfWeek.TUESDAY,
        ScheduleDayOfWeek.WEDNESDAY,
        ScheduleDayOfWeek.THURSDAY,
        ScheduleDayOfWeek.FRIDAY,
      ];

      for (const pro of professionals) {
        const professional = await tx.professional.create({
          data: {
            tenantId: tenant.id,
            fullName: pro.fullName,
            displayName: pro.displayName,
            professionalRegister: pro.register,
            visibleForSelfBooking: true,
            isActive: true,
          },
        });

        await tx.professionalUnit.create({
          data: {
            tenantId: tenant.id,
            professionalId: professional.id,
            unitId: unit.id,
          },
        });

        await tx.professionalSpecialty.create({
          data: {
            tenantId: tenant.id,
            professionalId: professional.id,
            specialtyId: specialty.id,
          },
        });

        await tx.professionalSchedule.createMany({
          data: [
            ...weekdays.flatMap((dayOfWeek) => [
              {
                tenantId: tenant.id,
                professionalId: professional.id,
                unitId: unit.id,
                dayOfWeek,
                startTime: new Date("1970-01-01T08:00:00.000Z"),
                endTime: new Date("1970-01-01T12:00:00.000Z"),
                slotIntervalMinutes: 30,
                isActive: true,
              },
              {
                tenantId: tenant.id,
                professionalId: professional.id,
                unitId: unit.id,
                dayOfWeek,
                startTime: new Date("1970-01-01T13:00:00.000Z"),
                endTime: new Date("1970-01-01T17:00:00.000Z"),
                slotIntervalMinutes: 30,
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
              slotIntervalMinutes: 30,
              isActive: true,
            },
          ],
        });

        const proUser = await tx.user.create({
          data: {
            email: pro.email,
            fullName: pro.fullName,
            passwordHash,
            status: UserStatus.ACTIVE,
          },
        });

        await tx.professional.update({
          where: { id: professional.id },
          data: { userId: proUser.id },
        });

        if (professionalRole) {
          await tx.userRole.create({
            data: {
              userId: proUser.id,
              roleId: professionalRole.id,
              tenantId: tenant.id,
            },
          });
        }
      }

      for (const svc of DEMO_SERVICES) {
        await tx.consultationType.create({
          data: { tenantId: tenant.id, ...svc, isActive: true },
        });
      }

      const adminUser = await tx.user.create({
        data: {
          email: `admin+${slug}@${DEMO_EMAIL_DOMAIN}`,
          fullName: `Admin ${leadClinicName}`,
          passwordHash,
          status: UserStatus.ACTIVE,
        },
      });
      const adminRole = await tx.role.findUnique({
        where: { code: RoleCode.TENANT_ADMIN },
      });
      if (adminRole) {
        await tx.userRole.create({
          data: {
            userId: adminUser.id,
            roleId: adminRole.id,
            tenantId: tenant.id,
          },
        });
      }

      const receptionUser = await tx.user.create({
        data: {
          email: `recepcao+${slug}@${DEMO_EMAIL_DOMAIN}`,
          fullName: `Recepção ${leadClinicName}`,
          passwordHash,
          status: UserStatus.ACTIVE,
        },
      });
      const receptionRole = await tx.role.findUnique({
        where: { code: RoleCode.RECEPTION },
      });
      if (receptionRole) {
        await tx.userRole.create({
          data: {
            userId: receptionUser.id,
            roleId: receptionRole.id,
            tenantId: tenant.id,
          },
        });
      }

      await tx.demoLeadTenant.create({
        data: {
          tenantId: tenant.id,
          slug,
          leadClinicName,
          expiresAt,
        },
      });
    });

    return expiresAt;
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
}
