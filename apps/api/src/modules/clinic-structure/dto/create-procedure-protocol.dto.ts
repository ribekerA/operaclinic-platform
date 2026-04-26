import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateProcedureProtocolDto {
  @IsString()
  consultationTypeId!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsInt()
  @Min(1)
  totalSessions!: number;

  @IsInt()
  @Min(1)
  intervalBetweenSessionsDays!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
