import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import type {
  MessagingTemplatePayload,
} from "@operaclinic/shared";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { CreateMessageTemplateDto } from "./dto/create-message-template.dto";
import { MessageTemplatesService } from "./message-templates.service";

@Controller("messaging/templates")
@UseGuards(AuthGuard, RoleGuard)
@Roles(RoleCode.TENANT_ADMIN, RoleCode.CLINIC_MANAGER)
export class MessageTemplatesController {
  constructor(
    private readonly messageTemplatesService: MessageTemplatesService,
  ) {}

  @Get()
  async listTemplates(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<MessagingTemplatePayload[]> {
    return this.messageTemplatesService.listTemplates(actor);
  }

  @Post()
  async createTemplate(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateMessageTemplateDto,
  ): Promise<MessagingTemplatePayload> {
    return this.messageTemplatesService.createTemplate(actor, input);
  }
}
