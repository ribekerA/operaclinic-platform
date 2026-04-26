import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { ClinicOperationalKpisService } from "./clinic-operational-kpis.service";
import { ClinicInsightsController } from "./clinic-insights.controller";
import { ClinicInsightsService } from "./clinic-insights.service";

@Module({
  imports: [AuthModule, SchedulingModule],
  controllers: [ClinicInsightsController],
  providers: [ClinicInsightsService, ClinicOperationalKpisService],
  exports: [ClinicOperationalKpisService],
})
export class ClinicInsightsModule {}
