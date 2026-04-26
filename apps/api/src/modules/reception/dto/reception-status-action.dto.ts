import { IsOptional, IsString, MaxLength } from "class-validator";

export class ReceptionStatusActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
