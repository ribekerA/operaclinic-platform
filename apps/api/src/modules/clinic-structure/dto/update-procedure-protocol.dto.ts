import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpdateProcedureProtocolDto {
  @IsOptional()
  @IsString()
  consultationTypeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalSessions?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  intervalBetweenSessionsDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
