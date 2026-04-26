import { IsOptional, IsString, MaxLength } from "class-validator";

export class ReceptionPatientSearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactValue?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
