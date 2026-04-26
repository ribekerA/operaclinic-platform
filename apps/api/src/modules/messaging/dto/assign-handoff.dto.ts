import { Transform } from "class-transformer";
import { IsOptional, IsUUID } from "class-validator";

export class AssignHandoffDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim();
    return normalized || null;
  })
  @IsUUID()
  assignedToUserId?: string | null;
}
