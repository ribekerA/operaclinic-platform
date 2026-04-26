import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { ProfessionalWorkspaceController } from "./professional-workspace.controller";
import { ProfessionalWorkspaceService } from "./professional-workspace.service";

@Module({
  imports: [AuthModule, SchedulingModule],
  controllers: [ProfessionalWorkspaceController],
  providers: [ProfessionalWorkspaceService],
})
export class ProfessionalWorkspaceModule {}
