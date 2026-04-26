import { IsOptional, IsString, MaxLength } from "class-validator";

export class ProfessionalAppointmentNotesDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
