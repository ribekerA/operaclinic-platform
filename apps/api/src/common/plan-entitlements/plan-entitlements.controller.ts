import { Controller, ForbiddenException, Get, UseGuards } from "@nestjs/common";
import type { PlanEntitlementsSummary } from "@operaclinic/shared";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { PlanEntitlementsService } from "./plan-entitlements.service";

/** Deliberately has no @Roles(...) restriction: any authenticated clinic user may see their own
 *  tenant's plan entitlements/usage — this powers a persistent usage bar, not an admin-only report. */
@Controller("clinic/plan-entitlements")
@UseGuards(AuthGuard, RoleGuard)
export class PlanEntitlementsController {
  constructor(private readonly planEntitlements: PlanEntitlementsService) {}

  @Get()
  async getSummary(@CurrentUser() actor: AuthenticatedUser): Promise<PlanEntitlementsSummary> {
    if (!actor.activeTenantId) {
      throw new ForbiddenException("Active tenant context is required.");
    }

    return this.planEntitlements.getUsageSummary(actor.activeTenantId);
  }
}
