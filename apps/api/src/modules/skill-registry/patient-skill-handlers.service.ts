import type {
  FindOrMergePatientSkillInput,
  ReceptionPatientSummary,
} from "@operaclinic/shared";
import { Injectable } from "@nestjs/common";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { PatientsService } from "../patients/patients.service";

@Injectable()
export class PatientSkillHandlersService {
  constructor(private readonly patientsService: PatientsService) {}

  async findOrMergePatient(
    actor: AuthenticatedUser,
    input: FindOrMergePatientSkillInput,
  ): Promise<ReceptionPatientSummary> {
    const patient = await this.patientsService.findOrMergePatient(actor, input);

    return {
      id: patient.id,
      fullName: patient.fullName,
      birthDate: patient.birthDate ? patient.birthDate.toISOString() : null,
      documentNumber: patient.documentNumber,
      notes: patient.notes,
      isActive: patient.isActive,
      contacts: patient.contacts.map((contact) => ({
        id: contact.id,
        type: contact.type,
        value: contact.value,
        normalizedValue: contact.normalizedValue,
        isPrimary: contact.isPrimary,
      })),
    };
  }
}
