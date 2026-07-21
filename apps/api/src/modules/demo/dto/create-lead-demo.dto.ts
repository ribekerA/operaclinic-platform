import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateLeadDemoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  clinicName!: string;
}
