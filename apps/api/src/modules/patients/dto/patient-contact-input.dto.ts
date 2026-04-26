import { PatientContactType } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class PatientContactInputDto {
  @IsEnum(PatientContactType)
  type!: PatientContactType;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(40)
  value!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
