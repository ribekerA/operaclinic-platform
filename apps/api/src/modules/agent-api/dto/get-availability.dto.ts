import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class GetAvailabilityDto {
  @IsDateString()
  date_from!: string;

  @IsDateString()
  date_to!: string;

  @IsOptional()
  @IsUUID()
  professional_id?: string;

  @IsUUID()
  service_id!: string;
}
