import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class ProfessionalStatusActionDto {
  @IsString()
  @IsIn([
    "CALLED",
    "IN_PROGRESS",
    "AWAITING_CLOSURE",
    "AWAITING_PAYMENT",
    "COMPLETED",
    "NO_SHOW",
  ])
  status!:
    | "CALLED"
    | "IN_PROGRESS"
    | "AWAITING_CLOSURE"
    | "AWAITING_PAYMENT"
    | "COMPLETED"
    | "NO_SHOW";

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
