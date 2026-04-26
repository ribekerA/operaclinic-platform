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
import { CreatePatientDto } from "./dto/create-patient.dto";
import { FindOrMergePatientDto } from "./dto/find-or-merge-patient.dto";
import { ListPatientsQueryDto } from "./dto/list-patients-query.dto";
import { UpdatePatientContactAutomatedMessagingDto } from "./dto/update-patient-contact-automated-messaging.dto";
import { UpdatePatientDto } from "./dto/update-patient.dto";
import { PatientContactAutomatedMessagingPreferenceResponse } from "./interfaces/patient-contact-automated-messaging.response";
import { PATIENTS_READ_ROLES, PATIENTS_WRITE_ROLES } from "./patients.constants";
import { PatientSummaryResponse } from "./interfaces/patient-summary.response";
import { PatientsService } from "./patients.service";

@Controller("patients")
@UseGuards(AuthGuard, RoleGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @Roles(...PATIENTS_READ_ROLES)
  async listPatients(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListPatientsQueryDto,
  ): Promise<PatientSummaryResponse[]> {
    return this.patientsService.listPatients(actor, query);
  }

  @Post()
  @Roles(...PATIENTS_WRITE_ROLES)
  async createPatient(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreatePatientDto,
  ): Promise<PatientSummaryResponse> {
    return this.patientsService.createPatient(actor, input);
  }

  @Patch(":patientId")
  @Roles(...PATIENTS_WRITE_ROLES)
  async updatePatient(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("patientId") patientId: string,
    @Body() input: UpdatePatientDto,
  ): Promise<PatientSummaryResponse> {
    return this.patientsService.updatePatient(actor, patientId, input);
  }

  @Patch(":patientId/contacts/:contactId/automated-messaging")
  @Roles(...PATIENTS_WRITE_ROLES)
  async updateContactAutomatedMessagingPreference(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("patientId") patientId: string,
    @Param("contactId") contactId: string,
    @Body() input: UpdatePatientContactAutomatedMessagingDto,
  ): Promise<PatientContactAutomatedMessagingPreferenceResponse> {
    return this.patientsService.updateContactAutomatedMessagingPreference(
      actor,
      patientId,
      contactId,
      input,
    );
  }

  @Post("find-or-merge")
  @Roles(...PATIENTS_WRITE_ROLES)
  async findOrMergePatient(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: FindOrMergePatientDto,
  ): Promise<PatientSummaryResponse> {
    return this.patientsService.findOrMergePatient(actor, input);
  }
}
