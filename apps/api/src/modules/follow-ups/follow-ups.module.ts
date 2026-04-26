import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { MessagingModule } from "../messaging/messaging.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { AppointmentFollowUpsController } from "./appointment-follow-ups.controller";
import { AppointmentFollowUpsService } from "./appointment-follow-ups.service";

@Module({
  imports: [AuthModule, MessagingModule, SchedulingModule],
  controllers: [AppointmentFollowUpsController],
  providers: [AppointmentFollowUpsService],
})
export class FollowUpsModule {}
