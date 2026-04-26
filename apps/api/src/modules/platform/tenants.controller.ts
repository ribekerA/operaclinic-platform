import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { ChangeTenantPlanDto } from "./dto/change-tenant-plan.dto";
import { CancelTenantSubscriptionDto } from "./dto/cancel-tenant-subscription.dto";
import { CreateTenantDto } from "./dto/create-tenant.dto";
import { GrantReferralBonusDto } from "./dto/grant-referral-bonus.dto";
import { ListTenantsQueryDto } from "./dto/list-tenants-query.dto";
import { UpdateTenantDto } from "./dto/update-tenant.dto";
import { TenantSummaryResponse } from "./interfaces/tenant-summary.response";
import { TenantsService } from "./tenants.service";

@Controller("platform/tenants")
@UseGuards(AuthGuard, RoleGuard)
@Roles(RoleCode.SUPER_ADMIN, RoleCode.PLATFORM_ADMIN)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  async listTenants(
    @Query() query: ListTenantsQueryDto,
  ): Promise<TenantSummaryResponse[]> {
    return this.tenantsService.listTenants(query);
  }

  @Post()
  async createTenant(
    @Body() input: CreateTenantDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TenantSummaryResponse> {
    return this.tenantsService.createTenant(input, actor);
  }

  @Patch(":tenantId")
  async updateTenant(
    @Param("tenantId") tenantId: string,
    @Body() input: UpdateTenantDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TenantSummaryResponse> {
    return this.tenantsService.updateTenant(tenantId, input, actor);
  }

  @Patch(":tenantId/plan")
  async changeTenantPlan(
    @Param("tenantId") tenantId: string,
    @Body() input: ChangeTenantPlanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TenantSummaryResponse> {
    return this.tenantsService.changeTenantPlan(tenantId, input, actor);
  }

  @Patch(":tenantId/subscription/cancel")
  async cancelTenantSubscription(
    @Param("tenantId") tenantId: string,
    @Body() input: CancelTenantSubscriptionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TenantSummaryResponse> {
    return this.tenantsService.cancelTenantSubscription(tenantId, input, actor);
  }

  @Post("billing/run-dunning")
  async runBillingDunning(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{
    processed: number;
    reminded: number;
    suspended: number;
  }> {
    return this.tenantsService.runBillingDunning(actor);
  }

  @Patch(":tenantId/subscription/grant-referral-bonus")
  async grantReferralBonus(
    @Param("tenantId") tenantId: string,
    @Body() input: GrantReferralBonusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TenantSummaryResponse> {
    return this.tenantsService.grantReferralBonus(tenantId, input, actor);
  }
}
