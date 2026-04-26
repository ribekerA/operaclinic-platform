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
import { CreateSpecialtyDto } from "./dto/create-specialty.dto";
import { UpdateSpecialtyDto } from "./dto/update-specialty.dto";
import { SpecialtyResponse } from "./interfaces/specialty.response";
import { SpecialtiesService } from "./specialties.service";

@Controller("specialties")
@UseGuards(AuthGuard, RoleGuard)
export class SpecialtiesController {
  constructor(private readonly specialtiesService: SpecialtiesService) {}

  @Get()
  @Roles(...CLINIC_STRUCTURE_READ_ROLES)
  async listSpecialties(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SpecialtyResponse[]> {
    return this.specialtiesService.listSpecialties(actor);
  }

  @Post()
  @Roles(...CLINIC_STRUCTURE_ADMIN_ROLES)
  async createSpecialty(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateSpecialtyDto,
  ): Promise<SpecialtyResponse> {
    return this.specialtiesService.createSpecialty(actor, input);
  }

  @Patch(":specialtyId")
  @Roles(...CLINIC_STRUCTURE_ADMIN_ROLES)
  async updateSpecialty(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("specialtyId") specialtyId: string,
    @Body() input: UpdateSpecialtyDto,
  ): Promise<SpecialtyResponse> {
    return this.specialtiesService.updateSpecialty(actor, specialtyId, input);
  }
}

