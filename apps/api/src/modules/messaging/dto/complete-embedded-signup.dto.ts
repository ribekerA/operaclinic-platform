import { IsString, MinLength } from "class-validator";
import { Transform } from "class-transformer";

export class CompleteEmbeddedSignupDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(10)
  code!: string;
}
