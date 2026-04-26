import { IsOptional, IsString } from "class-validator";

export class ListProcedureProtocolsQueryDto {
  @IsOptional()
  @IsString()
  consultationTypeId?: string;

  @IsOptional()
  @IsString()
  isActive?: string;
}
