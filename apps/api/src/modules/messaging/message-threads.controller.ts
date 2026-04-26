import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type {
  MessagingThreadDetailPayload,
  MessagingThreadSummaryPayload,
} from "@operaclinic/shared";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { LinkThreadPatientDto } from "./dto/link-thread-patient.dto";
import { ListMessageThreadsQueryDto } from "./dto/list-message-threads-query.dto";
import { ResolveThreadDto } from "./dto/resolve-thread.dto";
import { SendThreadMessageDto } from "./dto/send-thread-message.dto";
import { MessageThreadsService } from "./message-threads.service";

@Controller("messaging/threads")
@UseGuards(AuthGuard, RoleGuard)
@Roles(RoleCode.TENANT_ADMIN, RoleCode.CLINIC_MANAGER, RoleCode.RECEPTION)
export class MessageThreadsController {
  constructor(private readonly messageThreadsService: MessageThreadsService) {}

  @Get()
  async listThreads(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListMessageThreadsQueryDto,
  ): Promise<MessagingThreadSummaryPayload[]> {
    return this.messageThreadsService.listThreads(actor, query);
  }

  @Get(":threadId")
  async getThreadById(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("threadId") threadId: string,
  ): Promise<MessagingThreadDetailPayload> {
    return this.messageThreadsService.getThreadById(actor, threadId);
  }

  @Patch(":threadId/patient")
  async linkThreadPatient(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("threadId") threadId: string,
    @Body() input: LinkThreadPatientDto,
  ): Promise<MessagingThreadDetailPayload> {
    return this.messageThreadsService.linkThreadPatient(actor, threadId, input);
  }

  @Patch(":threadId/resolve")
  async resolveThread(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("threadId") threadId: string,
    @Body() input: ResolveThreadDto,
  ): Promise<MessagingThreadDetailPayload> {
    return this.messageThreadsService.resolveThread(actor, threadId, input);
  }

  @Post(":threadId/messages")
  async sendMessage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("threadId") threadId: string,
    @Body() input: SendThreadMessageDto,
  ): Promise<MessagingThreadDetailPayload> {
    return this.messageThreadsService.sendMessage(actor, threadId, input);
  }
}
