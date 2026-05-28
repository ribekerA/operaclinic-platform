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
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import {
  CreateProcedureProtocolDto,
  ProcedureProtocolsService,
  UpdateProcedureProtocolDto,
} from "./procedure-protocols.service";
import { RoleCode } from "@prisma/client";

const PROTOCOL_ADMIN_ROLES = [
  RoleCode.TENANT_ADMIN,
  RoleCode.CLINIC_MANAGER,
] as const;

const PROTOCOL_READ_ROLES = [
  ...PROTOCOL_ADMIN_ROLES,
  RoleCode.RECEPTION,
  RoleCode.PROFESSIONAL,
] as const;

@Controller("procedure-protocols")
@UseGuards(AuthGuard, RoleGuard)
export class ProcedureProtocolsController {
  constructor(private readonly service: ProcedureProtocolsService) {}

  @Get()
  @Roles(...PROTOCOL_READ_ROLES)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("activeOnly") activeOnly?: string,
  ) {
    return this.service.list(actor, activeOnly !== "false");
  }

  @Get(":protocolId")
  @Roles(...PROTOCOL_READ_ROLES)
  findOne(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("protocolId") protocolId: string,
  ) {
    return this.service.findOne(actor, protocolId);
  }

  @Post()
  @Roles(...PROTOCOL_ADMIN_ROLES)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateProcedureProtocolDto,
  ) {
    return this.service.create(actor, input);
  }

  @Patch(":protocolId")
  @Roles(...PROTOCOL_ADMIN_ROLES)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("protocolId") protocolId: string,
    @Body() input: UpdateProcedureProtocolDto,
  ) {
    return this.service.update(actor, protocolId, input);
  }
}
