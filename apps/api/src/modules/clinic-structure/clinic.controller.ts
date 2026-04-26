import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import {
  CLINIC_STRUCTURE_ADMIN_ROLES,
  CLINIC_STRUCTURE_READ_ROLES,
} from "./clinic-structure.constants";
import { UpdateClinicDto } from "./dto/update-clinic.dto";
import { ClinicProfileResponse } from "./interfaces/clinic-profile.response";
import { ClinicService } from "./clinic.service";

@Controller("clinic")
@UseGuards(AuthGuard, RoleGuard)
export class ClinicController {
  constructor(private readonly clinicService: ClinicService) {}

  @Get()
  @Roles(...CLINIC_STRUCTURE_READ_ROLES)
  async getClinic(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ClinicProfileResponse> {
    return this.clinicService.getClinic(actor);
  }

  @Patch()
  @Roles(...CLINIC_STRUCTURE_ADMIN_ROLES)
  async updateClinic(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: UpdateClinicDto,
  ): Promise<ClinicProfileResponse> {
    return this.clinicService.updateClinic(actor, input);
  }
}
