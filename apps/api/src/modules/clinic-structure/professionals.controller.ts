import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import {
  CLINIC_STRUCTURE_ADMIN_ROLES,
  CLINIC_STRUCTURE_READ_ROLES,
} from "./clinic-structure.constants";
import { CreateProfessionalDto } from "./dto/create-professional.dto";
import { UpdateProfessionalDto } from "./dto/update-professional.dto";
import { ProfessionalResponse } from "./interfaces/professional.response";
import { ProfessionalsService } from "./professionals.service";

@Controller("professionals")
@UseGuards(AuthGuard, RoleGuard)
export class ProfessionalsController {
  constructor(private readonly professionalsService: ProfessionalsService) {}

  @Get()
  @Roles(...CLINIC_STRUCTURE_READ_ROLES)
  async listProfessionals(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProfessionalResponse[]> {
    return this.professionalsService.listProfessionals(actor);
  }

  @Post()
  @Roles(...CLINIC_STRUCTURE_ADMIN_ROLES)
  async createProfessional(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateProfessionalDto,
  ): Promise<ProfessionalResponse> {
    return this.professionalsService.createProfessional(actor, input);
  }

  @Patch(":professionalId")
  @Roles(...CLINIC_STRUCTURE_ADMIN_ROLES)
  async updateProfessional(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("professionalId") professionalId: string,
    @Body() input: UpdateProfessionalDto,
  ): Promise<ProfessionalResponse> {
    return this.professionalsService.updateProfessional(
      actor,
      professionalId,
      input,
    );
  }
}
