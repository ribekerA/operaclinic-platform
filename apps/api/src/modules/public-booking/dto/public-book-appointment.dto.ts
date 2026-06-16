import { IsEmail, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { Transform } from "class-transformer";

enum ContactType {
  PHONE = "PHONE",
  WHATSAPP = "WHATSAPP",
}

export class PublicBookAppointmentDto {
  @IsUUID()
  professionalId!: string;

  @IsUUID()
  consultationTypeId!: string;

  @IsISO8601()
  startsAt!: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  patientName!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(8)
  @MaxLength(30)
  patientPhone!: string;

  @IsOptional()
  @IsEnum(ContactType)
  contactType?: "PHONE" | "WHATSAPP";

  @IsOptional()
  @IsEmail()
  patientEmail?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  notes?: string;
}
