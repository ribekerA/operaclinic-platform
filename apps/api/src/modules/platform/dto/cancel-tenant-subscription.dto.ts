import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class CancelTenantSubscriptionDto {
  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
