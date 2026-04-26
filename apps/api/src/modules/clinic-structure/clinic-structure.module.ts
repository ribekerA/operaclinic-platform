import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { IdentityModule } from "../identity/identity.module";
import { ClinicController } from "./clinic.controller";
import { ClinicService } from "./clinic.service";
import { ClinicStructureAccessService } from "./clinic-structure-access.service";
import { ConsultationTypesController } from "./consultation-types.controller";
import { ConsultationTypesService } from "./consultation-types.service";
import { ProfessionalsController } from "./professionals.controller";
import { ProfessionalsService } from "./professionals.service";
import { ProcedureProtocolsController } from "./procedure-protocols.controller";
import { ProcedureProtocolsService } from "./procedure-protocols.service";
import { SpecialtiesController } from "./specialties.controller";
import { SpecialtiesService } from "./specialties.service";
import { UnitsController } from "./units.controller";
import { UnitsService } from "./units.service";

@Module({
  imports: [AuthModule, IdentityModule],
  controllers: [
    ClinicController,
    UnitsController,
    SpecialtiesController,
    ProfessionalsController,
    ConsultationTypesController,
    ProcedureProtocolsController,
  ],
  providers: [
    ClinicStructureAccessService,
    ClinicService,
    UnitsService,
    SpecialtiesService,
    ProfessionalsService,
    ConsultationTypesService,
    ProcedureProtocolsService,
  ],
})
export class ClinicStructureModule {}
