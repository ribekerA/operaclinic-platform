import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import type {
  ProfessionalWorkspaceDashboardResponse,
  ProfessionalWorkspacePatientSummaryResponse,
} from "@operaclinic/shared";
import { RoleCode } from "@prisma/client";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { ProfessionalAppointmentNotesDto } from "./dto/professional-appointment-notes.dto";
import { ProfessionalStatusActionDto } from "./dto/professional-status-action.dto";
import { ProfessionalWorkspaceService } from "./professional-workspace.service";

@Controller("professional-workspace")
@UseGuards(AuthGuard, RoleGuard)
@Roles(RoleCode.PROFESSIONAL)
export class ProfessionalWorkspaceController {
  constructor(
    private readonly professionalWorkspaceService: ProfessionalWorkspaceService,
  ) {}

  @Get("dashboard")
  async getDashboard(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProfessionalWorkspaceDashboardResponse> {
    return this.professionalWorkspaceService.getDashboard(actor);
  }

  @Patch("appointments/:appointmentId/status")
  async updateAppointmentStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("appointmentId") appointmentId: string,
    @Body() input: ProfessionalStatusActionDto,
  ): Promise<ProfessionalWorkspaceDashboardResponse> {
    return this.professionalWorkspaceService.updateAppointmentStatus(
      actor,
      appointmentId,
      input,
    );
  }

  @Patch("appointments/:appointmentId/notes")
  async updateAppointmentNotes(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("appointmentId") appointmentId: string,
    @Body() input: ProfessionalAppointmentNotesDto,
  ): Promise<ProfessionalWorkspaceDashboardResponse> {
    return this.professionalWorkspaceService.updateAppointmentNotes(
      actor,
      appointmentId,
      input,
    );
  }

  @Get("patients/:patientId/summary")
  async getPatientSummary(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("patientId") patientId: string,
  ): Promise<ProfessionalWorkspacePatientSummaryResponse> {
    return this.professionalWorkspaceService.getPatientSummary(actor, patientId);
  }
}
