import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class RescheduleAgentAppointmentDto {
  @IsISO8601()
  starts_at!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
