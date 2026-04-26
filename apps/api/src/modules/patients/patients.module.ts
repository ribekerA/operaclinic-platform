import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { PatientsController } from "./patients.controller";
import { PatientsService } from "./patients.service";
import { PatientsAccessService } from "./patients-access.service";

@Module({
  imports: [AuthModule],
  controllers: [PatientsController],
  providers: [PatientsService, PatientsAccessService],
  exports: [PatientsService, PatientsAccessService],
})
export class PatientsModule {}
