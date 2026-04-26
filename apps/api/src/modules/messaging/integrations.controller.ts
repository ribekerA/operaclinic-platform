import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import type {
  CreateMessagingIntegrationConnectionResponsePayload,
  MessagingIntegrationConnectionPayload,
} from "@operaclinic/shared";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { CreateIntegrationConnectionDto } from "./dto/create-integration-connection.dto";
import { IntegrationConnectionsService } from "./integration-connections.service";

@Controller("integrations")
@UseGuards(AuthGuard, RoleGuard)
@Roles(RoleCode.TENANT_ADMIN, RoleCode.CLINIC_MANAGER)
export class IntegrationsController {
  constructor(
    private readonly integrationConnectionsService: IntegrationConnectionsService,
  ) {}

  @Get()
  async listConnections(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<MessagingIntegrationConnectionPayload[]> {
    return this.integrationConnectionsService.listConnections(actor);
  }

  @Post()
  async createConnection(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateIntegrationConnectionDto,
  ): Promise<CreateMessagingIntegrationConnectionResponsePayload> {
    return this.integrationConnectionsService.createConnection(actor, input);
  }
}
