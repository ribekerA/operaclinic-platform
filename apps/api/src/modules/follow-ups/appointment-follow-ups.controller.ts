import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import {
  AppointmentFollowUpRunResult,
  AppointmentFollowUpsService,
  FollowUpDispatchStats,
  ListFollowUpDispatchesResult,
} from "./appointment-follow-ups.service";
import { RunAppointmentFollowUpDto } from "./dto/run-appointment-follow-up.dto";

@Controller("messaging/appointment-follow-ups")
@UseGuards(AuthGuard, RoleGuard)
export class AppointmentFollowUpsController {
  constructor(
    private readonly appointmentFollowUpsService: AppointmentFollowUpsService,
  ) {}

  @Get()
  @Roles(RoleCode.TENANT_ADMIN, RoleCode.CLINIC_MANAGER, RoleCode.RECEPTION)
  async listDispatches(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("status") status?: string,
  ): Promise<ListFollowUpDispatchesResult> {
    return this.appointmentFollowUpsService.listDispatches(actor, {
      from,
      to,
      status,
    });
  }

  @Get("stats")
  @Roles(RoleCode.TENANT_ADMIN, RoleCode.CLINIC_MANAGER, RoleCode.RECEPTION)
  async getStats(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<FollowUpDispatchStats> {
    return this.appointmentFollowUpsService.getStats(actor);
  }

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
