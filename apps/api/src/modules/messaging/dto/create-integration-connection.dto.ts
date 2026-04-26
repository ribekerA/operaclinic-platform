import { IntegrationProvider, MessagingChannel } from "@prisma/client";
import { Transform } from "class-transformer";
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateIntegrationConnectionDto {
  @IsOptional()
  @IsEnum(MessagingChannel)
  channel?: MessagingChannel;

  @IsEnum(IntegrationProvider)
  provider!: IntegrationProvider;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(120)
  displayName!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(40)
  phoneNumber?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(120)
  externalAccountId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(120)
  webhookVerifyToken?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
