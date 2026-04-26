import {
  IsBooleanString,
  IsOptional,
  IsString,
  IsNumberString,
  MaxLength,
} from "class-validator";

export class ListPatientsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsBooleanString()
  isActive?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactValue?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
