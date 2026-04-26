import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateReceptionAppointmentStatusDto {
  @IsString()
  @IsIn(["CONFIRMED", "CHECKED_IN", "NO_SHOW", "CANCELED", "COMPLETED"])
  status!: "CONFIRMED" | "CHECKED_IN" | "NO_SHOW" | "CANCELED" | "COMPLETED";

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
