import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { WaitlistStatus } from "@prisma/client";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { SCHEDULING_OPERATION_ROLES } from "./scheduling.constants";
import {
  CreateWaitlistEntryDto,
  UpdateWaitlistStatusDto,
  WaitlistService,
} from "./waitlist.service";

@Controller("waitlist")
@UseGuards(AuthGuard, RoleGuard)
@Roles(...SCHEDULING_OPERATION_ROLES)
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("status") status?: WaitlistStatus,
  ) {
    return this.waitlistService.list(actor, status);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateWaitlistEntryDto,
  ) {
    return this.waitlistService.create(actor, input);
  }

  @Patch(":entryId/status")
  updateStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("entryId") entryId: string,
    @Body() body: UpdateWaitlistStatusDto,
  ) {
    return this.waitlistService.updateStatus(actor, entryId, body.status);
  }

  @Delete(":entryId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("entryId") entryId: string,
  ) {
    return this.waitlistService.remove(actor, entryId);
  }
}
