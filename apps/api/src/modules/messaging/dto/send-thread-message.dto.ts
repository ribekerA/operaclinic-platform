import { Transform } from "class-transformer";
import { IsString, MaxLength } from "class-validator";

export class SendThreadMessageDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(2000)
  text!: string;
}
