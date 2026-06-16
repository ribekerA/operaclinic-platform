import { IsISO8601, IsOptional, IsUUID } from "class-validator";

export class PublicAvailabilityQueryDto {
  @IsUUID()
  professionalId!: string;

  @IsUUID()
  consultationTypeId!: string;

  @IsISO8601()
  date!: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;
}
