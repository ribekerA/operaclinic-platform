import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type {
  MessagingHandoffListItemPayload,
  MessagingHandoffPayload,
} from "@operaclinic/shared";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AssignHandoffDto } from "./dto/assign-handoff.dto";
import { CloseHandoffDto } from "./dto/close-handoff.dto";
import { CreateHandoffDto } from "./dto/create-handoff.dto";
import { ListHandoffsQueryDto } from "./dto/list-handoffs-query.dto";
import { HandoffRequestsService } from "./handoff-requests.service";

@Controller("messaging/handoffs")
@UseGuards(AuthGuard, RoleGuard)
@Roles(RoleCode.TENANT_ADMIN, RoleCode.CLINIC_MANAGER, RoleCode.RECEPTION)
export class HandoffsController {
  constructor(private readonly handoffsService: HandoffRequestsService) {}

  @Get()
  async listHandoffs(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListHandoffsQueryDto,
  ): Promise<MessagingHandoffListItemPayload[]> {
    return this.handoffsService.listHandoffs(actor, query);
  }

  @Post()
  async openHandoff(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateHandoffDto,
  ): Promise<MessagingHandoffPayload> {
    return this.handoffsService.openHandoff(actor, input);
  }

  @Patch(":handoffId/close")
  async closeHandoff(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("handoffId") handoffId: string,
    @Body() input: CloseHandoffDto,
  ): Promise<MessagingHandoffPayload> {
    return this.handoffsService.closeHandoff(actor, handoffId, input);
  }

  @Patch(":handoffId/assign")
  async assignHandoff(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("handoffId") handoffId: string,
    @Body() input: AssignHandoffDto,
  ): Promise<MessagingHandoffPayload> {
    return this.handoffsService.assignHandoff(actor, handoffId, input);
  }
}
