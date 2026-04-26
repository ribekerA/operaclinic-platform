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
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AuthGuard } from "../../auth/guards/auth.guard";
import { RoleGuard } from "../../auth/guards/role.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AppointmentsService } from "./appointments.service";
import { CancelAppointmentDto } from "./dto/cancel-appointment.dto";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { ListAppointmentsQueryDto } from "./dto/list-appointments-query.dto";
import { RescheduleAppointmentDto } from "./dto/reschedule-appointment.dto";
import { AppointmentResponse } from "./interfaces/appointment.response";
import { SCHEDULING_OPERATION_ROLES } from "./scheduling.constants";

@Controller("appointments")
@UseGuards(AuthGuard, RoleGuard)
@Roles(...SCHEDULING_OPERATION_ROLES)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  async createAppointment(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateAppointmentDto,
  ): Promise<AppointmentResponse> {
    return this.appointmentsService.createAppointment(actor, input);
  }

  @Get()
  async listAppointments(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListAppointmentsQueryDto,
  ): Promise<AppointmentResponse[]> {
    return this.appointmentsService.listAppointments(actor, query);
  }

  @Get(":appointmentId")
  async getAppointmentById(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("appointmentId") appointmentId: string,
  ): Promise<AppointmentResponse> {
    return this.appointmentsService.getAppointmentById(actor, appointmentId);
  }

  @Patch(":appointmentId/reschedule")
  async rescheduleAppointment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("appointmentId") appointmentId: string,
    @Body() input: RescheduleAppointmentDto,
  ): Promise<AppointmentResponse> {
    return this.appointmentsService.rescheduleAppointment(
      actor,
      appointmentId,
      input,
    );
  }

  @Patch(":appointmentId/cancel")
  async cancelAppointment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("appointmentId") appointmentId: string,
    @Body() input: CancelAppointmentDto,
  ): Promise<AppointmentResponse> {
    return this.appointmentsService.cancelAppointment(actor, appointmentId, input);
  }
}
