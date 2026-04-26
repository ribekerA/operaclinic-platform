import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class ResolveThreadDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  note?: string;
}
