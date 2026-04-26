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
import { CreateUnitDto } from "./dto/create-unit.dto";
import { UpdateUnitDto } from "./dto/update-unit.dto";
import { UnitResponse } from "./interfaces/unit.response";
import { UnitsService } from "./units.service";

@Controller("units")
@UseGuards(AuthGuard, RoleGuard)
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  @Roles(...CLINIC_STRUCTURE_READ_ROLES)
  async listUnits(@CurrentUser() actor: AuthenticatedUser): Promise<UnitResponse[]> {
    return this.unitsService.listUnits(actor);
  }

  @Post()
  @Roles(...CLINIC_STRUCTURE_ADMIN_ROLES)
  async createUnit(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateUnitDto,
  ): Promise<UnitResponse> {
    return this.unitsService.createUnit(actor, input);
  }

  @Patch(":unitId")
  @Roles(...CLINIC_STRUCTURE_ADMIN_ROLES)
  async updateUnit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("unitId") unitId: string,
    @Body() input: UpdateUnitDto,
  ): Promise<UnitResponse> {
    return this.unitsService.updateUnit(actor, unitId, input);
  }
}

