import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelAgentAppointmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
