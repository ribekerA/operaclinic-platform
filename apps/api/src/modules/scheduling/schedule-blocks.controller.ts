import { Body, Controller, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { CreateScheduleBlockDto } from "./dto/create-schedule-block.dto";
import { UpdateScheduleBlockDto } from "./dto/update-schedule-block.dto";
import { ScheduleBlockResponse } from "./interfaces/schedule-block.response";
import { SCHEDULING_ADMIN_ROLES } from "./scheduling.constants";
import { ScheduleBlocksService } from "./schedule-blocks.service";

@Controller("schedule-blocks")
@UseGuards(AuthGuard, RoleGuard)
@Roles(...SCHEDULING_ADMIN_ROLES)
export class ScheduleBlocksController {
  constructor(private readonly scheduleBlocksService: ScheduleBlocksService) {}

  @Post()
  async createBlock(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateScheduleBlockDto,
  ): Promise<ScheduleBlockResponse> {
    return this.scheduleBlocksService.createBlock(actor, input);
  }

  @Patch(":blockId")
  async updateBlock(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("blockId") blockId: string,
    @Body() input: UpdateScheduleBlockDto,
  ): Promise<ScheduleBlockResponse> {
    return this.scheduleBlocksService.updateBlock(actor, blockId, input);
  }
}
