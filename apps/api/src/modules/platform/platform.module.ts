import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { ClinicInsightsModule } from "../clinic-insights/clinic-insights.module";
import { HealthModule } from "../health/health.module";
import { PlansController } from "./plans.controller";
import { PlansService } from "./plans.service";
import { PlatformDashboardController } from "./platform-dashboard.controller";
import { PlatformDashboardService } from "./platform-dashboard.service";
import { BillingDunningScheduler } from "./billing-dunning.scheduler";
import { SubscriptionsService } from "./subscriptions.service";
import { TenantSettingsService } from "./tenant-settings.service";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";

@Module({
  imports: [AuthModule, HealthModule, ClinicInsightsModule],
  controllers: [
    TenantsController,
    PlansController,
    PlatformDashboardController,
  ],
  providers: [
    TenantsService,
    PlansService,
    PlatformDashboardService,
    BillingDunningScheduler,
    SubscriptionsService,
    TenantSettingsService,
  ],
  exports: [PlansService, SubscriptionsService, TenantSettingsService],
})
export class PlatformModule {}
