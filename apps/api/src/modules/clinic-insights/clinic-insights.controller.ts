import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type {
  AestheticClinicExecutiveDashboardResponse,
  AestheticClinicOperationalKpisResponse,
} from "@operaclinic/shared";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { ClinicOperationalKpisService } from "./clinic-operational-kpis.service";
import { AestheticClinicExecutiveDashboardQueryDto } from "./dto/clinic-executive-dashboard-query.dto";
import { ClinicInsightsService } from "./clinic-insights.service";

@Controller("clinic")
@UseGuards(AuthGuard, RoleGuard)
@Roles(RoleCode.TENANT_ADMIN, RoleCode.CLINIC_MANAGER)
export class ClinicInsightsController {
  constructor(
    private readonly clinicInsightsService: ClinicInsightsService,
    private readonly clinicOperationalKpisService: ClinicOperationalKpisService,
  ) {}

  @Get("executive-dashboard")
  async getExecutiveDashboard(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: AestheticClinicExecutiveDashboardQueryDto,
  ): Promise<AestheticClinicExecutiveDashboardResponse> {
    return this.clinicInsightsService.getExecutiveDashboard(actor, query);
  }

  @Get("operational-kpis")
  async getOperationalKpis(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: AestheticClinicExecutiveDashboardQueryDto,
  ): Promise<AestheticClinicOperationalKpisResponse> {
    return this.clinicOperationalKpisService.getOperationalKpis(actor, query);
  }
}
