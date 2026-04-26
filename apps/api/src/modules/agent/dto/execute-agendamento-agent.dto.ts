import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class ExecuteAgendamentoAgentDto {
  @IsString()
  @MaxLength(64)
  threadId!: string;

  @IsString()
  @MaxLength(64)
  patientId!: string;

  @IsString()
  @MaxLength(64)
  professionalId!: string;

  @IsString()
  @MaxLength(64)
  consultationTypeId!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  preferredDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  unitId?: string;

  @IsOptional()
  @IsISO8601()
  selectedSlotStartsAt?: string;

  @IsOptional()
  @IsBoolean()
  confirmSelectedSlot?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  correlationId?: string;
}
