import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import {
  AppointmentFollowUpRunResult,
  AppointmentFollowUpsService,
} from "./appointment-follow-ups.service";
import { RunAppointmentFollowUpDto } from "./dto/run-appointment-follow-up.dto";

@Controller("messaging/appointment-follow-ups")
@UseGuards(AuthGuard, RoleGuard)
export class AppointmentFollowUpsController {
  constructor(
    private readonly appointmentFollowUpsService: AppointmentFollowUpsService,
  ) {}

  @Post("dispatch")
  @Roles(RoleCode.TENANT_ADMIN, RoleCode.CLINIC_MANAGER, RoleCode.RECEPTION)
  async dispatchAppointmentReminder(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: RunAppointmentFollowUpDto,
  ): Promise<AppointmentFollowUpRunResult> {
    return this.appointmentFollowUpsService.runAppointmentReminder24h(
      actor,
      input,
    );
  }
}
