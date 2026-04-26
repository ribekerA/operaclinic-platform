import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateReceptionAppointmentDto {
  @IsString()
  patientId!: string;

  @IsString()
  professionalId!: string;

  @IsString()
  consultationTypeId!: string;

  @IsOptional()
  @IsString()
  procedureProtocolId?: string;

  @IsOptional()
  @IsString()
  unitId?: string;

  @IsOptional()
  @IsString()
  slotHoldId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  room?: string;

  @IsString()
  startsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}
