import { IsOptional, IsString, MaxLength } from "class-validator";

export class ReceptionDateQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  date?: string;

  @IsOptional()
  @IsString()
  professionalId?: string;

  @IsOptional()
  @IsString()
  unitId?: string;
}
