import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { CreatePlanDto } from "./dto/create-plan.dto";
import { ListPlansQueryDto } from "./dto/list-plans-query.dto";
import { PlanSummaryResponse } from "./interfaces/plan-summary.response";
import { PlansService } from "./plans.service";

@Controller("platform/plans")
@UseGuards(AuthGuard, RoleGuard)
@Roles(RoleCode.SUPER_ADMIN, RoleCode.PLATFORM_ADMIN)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  async listPlans(
    @Query() query: ListPlansQueryDto,
  ): Promise<PlanSummaryResponse[]> {
    return this.plansService.listPlans(query);
  }

  @Post()
  async createPlan(
    @Body() input: CreatePlanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PlanSummaryResponse> {
    return this.plansService.createPlan(input, actor);
  }
}
