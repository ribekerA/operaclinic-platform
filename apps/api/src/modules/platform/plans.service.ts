import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { findCommercialPublicPlanCatalogEntry } from "@operaclinic/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../../common/audit/audit.service";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { PrismaService } from "../../database/prisma.service";
import { CreatePlanDto } from "./dto/create-plan.dto";
import { ListPlansQueryDto } from "./dto/list-plans-query.dto";
import { PlanSummaryResponse } from "./interfaces/plan-summary.response";

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listPlans(query: ListPlansQueryDto): Promise<PlanSummaryResponse[]> {
    const where: Prisma.PlanWhereInput = {};

    if (query.search?.trim()) {
      where.OR = [
        { code: { contains: query.search.trim(), mode: "insensitive" } },
        { name: { contains: query.search.trim(), mode: "insensitive" } },
      ];
    }

    if (typeof query.isActive === "string") {
      where.isActive = this.parseBoolean(query.isActive, "isActive");
    }

    if (typeof query.isPublic === "string") {
      where.isPublic = this.parseBoolean(query.isPublic, "isPublic");
    }

    const plans = await this.prisma.plan.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return plans.map((plan) => ({
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        currency: plan.currency,
        isPublic: plan.isPublic,
        isActive: plan.isActive,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      }));
  }

  async createPlan(
    input: CreatePlanDto,
    actor: AuthenticatedUser,
  ): Promise<PlanSummaryResponse> {
    const code = input.code?.trim().toUpperCase();
    const name = input.name?.trim();

    if (!code || !name) {
      throw new BadRequestException("code and name are required.");
    }

    const priceCents = Number(input.priceCents);

    if (!Number.isInteger(priceCents) || priceCents < 0) {
      throw new BadRequestException("priceCents must be a non-negative integer.");
    }

    const currency = (input.currency ?? "BRL").trim().toUpperCase();

    if (currency.length !== 3) {
      throw new BadRequestException("currency must have exactly 3 characters.");
    }

    const publicCatalogEntry =
      input.isPublic === true
        ? findCommercialPublicPlanCatalogEntry(code)
        : null;

    if (input.isPublic === true && !publicCatalogEntry) {
      throw new BadRequestException(
        "Public commercial plans must use a shared catalog code.",
      );
    }

    const normalizedName = publicCatalogEntry?.name ?? name;
    const normalizedDescription =
      publicCatalogEntry?.description ?? input.description?.trim() ?? null;
    const normalizedPriceCents = publicCatalogEntry?.priceCents ?? priceCents;
    const normalizedCurrency = publicCatalogEntry?.currency ?? currency;

    try {
      const plan = await this.prisma.$transaction(async (tx) => {
        const created = await tx.plan.create({
          data: {
            code,
            name: normalizedName,
            description: normalizedDescription,
            priceCents: normalizedPriceCents,
            currency: normalizedCurrency,
            isPublic: input.isPublic ?? false,
            isActive: input.isActive ?? true,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.PLAN_CREATED,
            actor,
            targetType: "plan",
            targetId: created.id,
            metadata: {
              code: created.code,
              name: created.name,
              priceCents: created.priceCents,
              currency: created.currency,
              isPublic: created.isPublic,
              isActive: created.isActive,
            },
          },
          tx,
        );

        return created;
      });

      return {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        currency: plan.currency,
        isPublic: plan.isPublic,
        isActive: plan.isActive,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Plan code already exists.");
      }

      throw error;
    }
  }

  private parseBoolean(value: string, field: string): boolean {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }

    throw new BadRequestException(`${field} must be 'true' or 'false'.`);
  }
}
