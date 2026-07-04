import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAgentAppointmentDto {
  @IsUUID()
  professional_id!: string;

  @IsUUID()
  service_id!: string;

  @IsISO8601()
  starts_at!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  patient_name!: string;

  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'patient_phone must be in E.164 format (e.g. +5511999998888)',
  })
  patient_phone!: string;

  @IsOptional()
  @IsUUID()
  unit_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
