import { Transform } from "class-transformer";
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { HandoffPriority } from "@prisma/client";

export class CreateHandoffDto {
  @IsUUID()
  threadId!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(120)
  reason!: string;

  @IsOptional()
  @IsEnum(HandoffPriority)
  priority?: HandoffPriority;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  note?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim();
    return normalized || undefined;
  })
  @IsUUID()
  assignedToUserId?: string;
}
