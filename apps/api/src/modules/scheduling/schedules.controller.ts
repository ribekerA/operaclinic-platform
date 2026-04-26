import { Body, Controller, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { CreateScheduleDto } from "./dto/create-schedule.dto";
import { UpdateScheduleDto } from "./dto/update-schedule.dto";
import { ScheduleResponse } from "./interfaces/schedule.response";
import { SCHEDULING_ADMIN_ROLES } from "./scheduling.constants";
import { SchedulesService } from "./schedules.service";

@Controller("schedules")
@UseGuards(AuthGuard, RoleGuard)
@Roles(...SCHEDULING_ADMIN_ROLES)
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Post()
  async createSchedule(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateScheduleDto,
  ): Promise<ScheduleResponse> {
    return this.schedulesService.createSchedule(actor, input);
  }

  @Patch(":scheduleId")
  async updateSchedule(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("scheduleId") scheduleId: string,
    @Body() input: UpdateScheduleDto,
  ): Promise<ScheduleResponse> {
    return this.schedulesService.updateSchedule(actor, scheduleId, input);
  }
}
