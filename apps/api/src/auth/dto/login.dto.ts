import { IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import type { AuthProfile } from "../interfaces/authenticated-user.interface";

export class LoginDto {
  @IsOptional()
  @IsIn(["platform", "clinic"])
  profile?: AuthProfile;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}
