import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { CronGuard } from "../../auth/guards/cron.guard";
import { MessagingModule } from "../messaging/messaging.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { AppointmentFollowUpsCronController } from "./appointment-follow-ups-cron.controller";
import { AppointmentFollowUpsController } from "./appointment-follow-ups.controller";
import { AppointmentFollowUpsService } from "./appointment-follow-ups.service";

@Module({
  imports: [AuthModule, MessagingModule, SchedulingModule],
  controllers: [AppointmentFollowUpsController, AppointmentFollowUpsCronController],
  providers: [AppointmentFollowUpsService, CronGuard],
})
export class FollowUpsModule {}
