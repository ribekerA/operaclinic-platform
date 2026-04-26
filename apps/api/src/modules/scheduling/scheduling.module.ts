import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";
import { AvailabilityController } from "./availability.controller";
import { AvailabilityService } from "./availability.service";
import { SchedulingConcurrencyService } from "./scheduling-concurrency.service";
import { ScheduleBlocksController } from "./schedule-blocks.controller";
import { ScheduleBlocksService } from "./schedule-blocks.service";
import { SchedulesController } from "./schedules.controller";
import { SchedulingReferencesService } from "./scheduling-references.service";
import { SchedulingTimezoneService } from "./scheduling-timezone.service";
import { SchedulesService } from "./schedules.service";
import { SchedulingAccessService } from "./scheduling-access.service";
import { SchedulingPoliciesService } from "./scheduling-policies.service";
import { ProfessionalWorkspaceGateway } from "./gateways/professional-workspace.gateway";
import { NoShowSchedulerService } from "./no-show-scheduler.service";

@Module({
  imports: [AuthModule],
  controllers: [
    SchedulesController,
    ScheduleBlocksController,
    AvailabilityController,
    AppointmentsController,
  ],
  providers: [
    SchedulingAccessService,
    SchedulingConcurrencyService,
    SchedulingPoliciesService,
    SchedulingReferencesService,
    SchedulingTimezoneService,
    SchedulesService,
    ScheduleBlocksService,
    AvailabilityService,
    AppointmentsService,
    ProfessionalWorkspaceGateway,
    NoShowSchedulerService,
  ],
  exports: [
    AppointmentsService,
    AvailabilityService,
    SchedulingAccessService,
    SchedulingConcurrencyService,
    SchedulingReferencesService,
    SchedulingTimezoneService,
    ProfessionalWorkspaceGateway,
  ],
})
export class SchedulingModule {}
