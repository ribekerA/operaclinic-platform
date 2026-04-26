import { TenantStatus } from "@prisma/client";
import { IsBooleanString, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class ListTenantsQueryDto {
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  // Legacy compatibility: older UI/routes may still send these query params.
  @IsOptional()
  @IsBooleanString()
  isActive?: string;

  @IsOptional()
  @IsBooleanString()
  isPublic?: string;
}
