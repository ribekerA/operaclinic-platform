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
  CLINIC_STRUCTURE_ADMIN_ROLES,
  CLINIC_STRUCTURE_READ_ROLES,
} from "./clinic-structure.constants";
import { CreateProcedureProtocolDto } from "./dto/create-procedure-protocol.dto";
import { ListProcedureProtocolsQueryDto } from "./dto/list-procedure-protocols-query.dto";
import { UpdateProcedureProtocolDto } from "./dto/update-procedure-protocol.dto";
import { ProcedureProtocolResponse } from "./interfaces/procedure-protocol.response";
import { ProcedureProtocolsService } from "./procedure-protocols.service";

@Controller("procedure-protocols")
@UseGuards(AuthGuard, RoleGuard)
export class ProcedureProtocolsController {
  constructor(
    private readonly procedureProtocolsService: ProcedureProtocolsService,
  ) {}

  @Get()
  @Roles(...CLINIC_STRUCTURE_READ_ROLES)
  async listProcedureProtocols(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListProcedureProtocolsQueryDto,
  ): Promise<ProcedureProtocolResponse[]> {
    return this.procedureProtocolsService.listProcedureProtocols(actor, query);
  }

  @Post()
  @Roles(...CLINIC_STRUCTURE_ADMIN_ROLES)
  async createProcedureProtocol(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateProcedureProtocolDto,
  ): Promise<ProcedureProtocolResponse> {
    return this.procedureProtocolsService.createProcedureProtocol(actor, input);
  }

  @Patch(":procedureProtocolId")
  @Roles(...CLINIC_STRUCTURE_ADMIN_ROLES)
  async updateProcedureProtocol(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("procedureProtocolId") procedureProtocolId: string,
    @Body() input: UpdateProcedureProtocolDto,
  ): Promise<ProcedureProtocolResponse> {
    return this.procedureProtocolsService.updateProcedureProtocol(
      actor,
      procedureProtocolId,
      input,
    );
  }
}
