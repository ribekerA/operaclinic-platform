import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  CommercialAdminListOnboardingsQuery,
  CommercialAdminOnboardingSummary,
} from "@operaclinic/shared";
import { RoleCode } from "@prisma/client";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { CommercialService } from "./commercial.service";

@Controller("admin/commercial")
@UseGuards(AuthGuard, RoleGuard)
@Roles(RoleCode.PLATFORM_ADMIN, RoleCode.SUPER_ADMIN)
export class CommercialAdminController {
  constructor(private readonly commercialService: CommercialService) {}

  @Get("onboardings")
  async listOnboardings(
    @Query() query: CommercialAdminListOnboardingsQuery,
  ): Promise<CommercialAdminOnboardingSummary[]> {
    return this.commercialService.listOnboardings(query);
  }
}
