import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { RoleCode } from "@prisma/client";
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
import {
  EnrollPatientInProtocolDto,
  ProcedureProtocolsService,
  UpdateProtocolInstanceDto,
  UpdateProtocolSessionDto,
} from "./procedure-protocols.service";

// Patient enrollment/session routes are also reachable by PROFESSIONAL (session execution),
// unlike the rest of clinic-structure which is admin/reception-only.
const PROTOCOL_INSTANCE_READ_ROLES = [
  ...CLINIC_STRUCTURE_READ_ROLES,
  RoleCode.PROFESSIONAL,
] as const;

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

  // Patient protocol instances — declared before ":procedureProtocolId" so the literal
  // "instances" segment is matched first by the router.

  @Post("instances/enroll")
  @Roles(...CLINIC_STRUCTURE_ADMIN_ROLES, RoleCode.RECEPTION)
  enrollPatient(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: EnrollPatientInProtocolDto,
  ) {
    return this.procedureProtocolsService.enrollPatient(actor, input);
  }

  @Get("instances/patient/:patientId")
  @Roles(...PROTOCOL_INSTANCE_READ_ROLES)
  listPatientInstances(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("patientId") patientId: string,
  ) {
    return this.procedureProtocolsService.listPatientInstances(actor, patientId);
  }

  @Get("instances/:instanceId")
  @Roles(...PROTOCOL_INSTANCE_READ_ROLES)
  getPatientInstance(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("instanceId") instanceId: string,
  ) {
    return this.procedureProtocolsService.getPatientInstance(actor, instanceId);
  }

  @Patch("instances/:instanceId")
  @Roles(...CLINIC_STRUCTURE_ADMIN_ROLES, RoleCode.RECEPTION)
  updatePatientInstance(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("instanceId") instanceId: string,
    @Body() input: UpdateProtocolInstanceDto,
  ) {
    return this.procedureProtocolsService.updatePatientInstance(actor, instanceId, input);
  }

  @Patch("instances/:instanceId/sessions/:seq")
  @Roles(...PROTOCOL_INSTANCE_READ_ROLES)
  updateProtocolSession(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("instanceId") instanceId: string,
    @Param("seq", ParseIntPipe) seq: number,
    @Body() input: UpdateProtocolSessionDto,
  ) {
    return this.procedureProtocolsService.updateProtocolSession(actor, instanceId, seq, input);
  }

  @Get(":procedureProtocolId")
  @Roles(...CLINIC_STRUCTURE_READ_ROLES)
  async findOne(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("procedureProtocolId") procedureProtocolId: string,
  ): Promise<ProcedureProtocolResponse> {
    return this.procedureProtocolsService.findOne(actor, procedureProtocolId);
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
