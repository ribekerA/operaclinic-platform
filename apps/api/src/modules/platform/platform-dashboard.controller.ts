import { Controller, Get, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import type { PlatformDashboardResponsePayload } from "@operaclinic/shared";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { PlatformDashboardService } from "./platform-dashboard.service";

@Controller("platform/dashboard")
@UseGuards(AuthGuard, RoleGuard)
@Roles(RoleCode.SUPER_ADMIN, RoleCode.PLATFORM_ADMIN)
export class PlatformDashboardController {
  constructor(
    private readonly platformDashboardService: PlatformDashboardService,
  ) {}

  @Get()
  async getDashboard(): Promise<PlatformDashboardResponsePayload> {
    return this.platformDashboardService.getDashboard();
  }
}
