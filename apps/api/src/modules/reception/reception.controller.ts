import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type {
  ReceptionAppointmentDetail,
  ReceptionDashboardResponse,
  ReceptionDayAgendaResponse,
  ReceptionPatientSummary,
} from "@operaclinic/shared";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { RoleCode } from "@prisma/client";
import { CancelReceptionAppointmentDto } from "./dto/cancel-reception-appointment.dto";
import { CreateReceptionAppointmentDto } from "./dto/create-reception-appointment.dto";
import { ReceptionDateQueryDto } from "./dto/reception-date-query.dto";
import { ReceptionPatientSearchQueryDto } from "./dto/reception-patient-search-query.dto";
import { ReceptionStatusActionDto } from "./dto/reception-status-action.dto";
import { UpdateReceptionAppointmentStatusDto } from "./dto/update-reception-appointment-status.dto";
import { RescheduleReceptionAppointmentDto } from "./dto/reschedule-reception-appointment.dto";
import { ReceptionService } from "./reception.service";

const RECEPTION_ROLES = [
  RoleCode.TENANT_ADMIN,
  RoleCode.CLINIC_MANAGER,
  RoleCode.RECEPTION,
] as const;

@Controller("reception")
@UseGuards(AuthGuard, RoleGuard)
@Roles(...RECEPTION_ROLES)
export class ReceptionController {
  constructor(private readonly receptionService: ReceptionService) {}

  @Get("dashboard")
  async getDashboard(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ReceptionDateQueryDto,
  ): Promise<ReceptionDashboardResponse> {
    return this.receptionService.getDashboard(actor, query);
  }

  @Get("day-agenda")
  async getDayAgenda(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ReceptionDateQueryDto,
  ): Promise<ReceptionDayAgendaResponse> {
    return this.receptionService.getDayAgenda(actor, query);
  }

  @Get("patients")
  async searchPatients(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ReceptionPatientSearchQueryDto,
  ): Promise<ReceptionPatientSummary[]> {
    return this.receptionService.searchPatients(actor, query);
  }

  @Get("availability")
  async searchAvailability(
    @CurrentUser() actor: AuthenticatedUser,
    @Query()
    query: {
      professionalId: string;
      consultationTypeId: string;
      date: string;
      unitId?: string;
    },
  ) {
    return this.receptionService.searchAvailability(actor, query);
  }

  @Get("appointments/:appointmentId")
  async getAppointmentDetail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("appointmentId") appointmentId: string,
  ): Promise<ReceptionAppointmentDetail> {
    return this.receptionService.getAppointmentDetail(actor, appointmentId);
  }

  @Post("appointments")
  async createAppointment(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateReceptionAppointmentDto,
  ): Promise<ReceptionAppointmentDetail> {
    return this.receptionService.createManualAppointment(actor, input);
  }

  @Patch("appointments/:appointmentId/reschedule")
  async rescheduleAppointment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("appointmentId") appointmentId: string,
    @Body() input: RescheduleReceptionAppointmentDto,
  ): Promise<ReceptionAppointmentDetail> {
    return this.receptionService.rescheduleAppointment(actor, appointmentId, input);
  }

  @Patch("appointments/:appointmentId/cancel")
  async cancelAppointment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("appointmentId") appointmentId: string,
    @Body() input: CancelReceptionAppointmentDto,
  ): Promise<ReceptionAppointmentDetail> {
    return this.receptionService.cancelAppointment(actor, appointmentId, input);
  }

  @Patch("appointments/:appointmentId/confirm")
  async confirmAppointment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("appointmentId") appointmentId: string,
    @Body() input: ReceptionStatusActionDto,
  ): Promise<ReceptionAppointmentDetail> {
    return this.receptionService.confirmAppointment(actor, appointmentId, input);
  }

  @Patch("appointments/:appointmentId/check-in")
  async checkInAppointment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("appointmentId") appointmentId: string,
    @Body() input: ReceptionStatusActionDto,
  ): Promise<ReceptionAppointmentDetail> {
    return this.receptionService.checkInAppointment(actor, appointmentId, input);
  }

  @Patch("appointments/:appointmentId/no-show")
  async markNoShow(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("appointmentId") appointmentId: string,
    @Body() input: ReceptionStatusActionDto,
  ): Promise<ReceptionAppointmentDetail> {
    return this.receptionService.markAppointmentAsNoShow(actor, appointmentId, input);
  }

  @Patch("appointments/:appointmentId/status")
  async updateAppointmentStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("appointmentId") appointmentId: string,
    @Body() input: UpdateReceptionAppointmentStatusDto,
  ): Promise<ReceptionAppointmentDetail> {
    return this.receptionService.updateAppointmentStatus(actor, appointmentId, input);
  }
}
