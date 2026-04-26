import { MessageThreadStatus } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class ListMessageThreadsQueryDto {
  @IsOptional()
  @IsEnum(MessageThreadStatus)
  status?: MessageThreadStatus;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsUUID()
  integrationConnectionId?: string;
}
