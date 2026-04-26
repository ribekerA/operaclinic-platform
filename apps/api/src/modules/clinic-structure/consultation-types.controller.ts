import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { CreateConsultationTypeDto } from "./dto/create-consultation-type.dto";
import { UpdateConsultationTypeDto } from "./dto/update-consultation-type.dto";
import { ConsultationTypeResponse } from "./interfaces/consultation-type.response";
import { ConsultationTypesService } from "./consultation-types.service";

@Controller("consultation-types")
@UseGuards(AuthGuard, RoleGuard)
export class ConsultationTypesController {
  constructor(
    private readonly consultationTypesService: ConsultationTypesService,
  ) {}

  @Get()
  @Roles(...CLINIC_STRUCTURE_READ_ROLES)
  async listConsultationTypes(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ConsultationTypeResponse[]> {
    return this.consultationTypesService.listConsultationTypes(actor);
  }

  @Post()
  @Roles(...CLINIC_STRUCTURE_ADMIN_ROLES)
  async createConsultationType(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateConsultationTypeDto,
  ): Promise<ConsultationTypeResponse> {
    return this.consultationTypesService.createConsultationType(actor, input);
  }

  @Patch(":consultationTypeId")
  @Roles(...CLINIC_STRUCTURE_ADMIN_ROLES)
  async updateConsultationType(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("consultationTypeId") consultationTypeId: string,
    @Body() input: UpdateConsultationTypeDto,
  ): Promise<ConsultationTypeResponse> {
    return this.consultationTypesService.updateConsultationType(
      actor,
      consultationTypeId,
      input,
    );
  }
}

