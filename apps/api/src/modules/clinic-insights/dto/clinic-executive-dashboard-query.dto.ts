import { IsOptional, IsString, MaxLength } from "class-validator";

export class AestheticClinicExecutiveDashboardQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(3)
  periodDays?: string;
}
