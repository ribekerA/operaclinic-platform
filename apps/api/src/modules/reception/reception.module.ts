import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { PatientsModule } from "../patients/patients.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { ReceptionController } from "./reception.controller";
import { ReceptionService } from "./reception.service";

@Module({
  imports: [AuthModule, PatientsModule, SchedulingModule],
  controllers: [ReceptionController],
  providers: [ReceptionService],
})
export class ReceptionModule {}
