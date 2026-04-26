import { IsString, MaxLength, MinLength } from "class-validator";

export class CancelReceptionAppointmentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}
