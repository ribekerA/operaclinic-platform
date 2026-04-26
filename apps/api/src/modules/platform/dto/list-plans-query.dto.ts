import { IsBooleanString, IsOptional, IsString, MaxLength } from "class-validator";

export class ListPlansQueryDto {
  @IsOptional()
  @IsBooleanString()
  isActive?: string;

  @IsOptional()
  @IsBooleanString()
  isPublic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
