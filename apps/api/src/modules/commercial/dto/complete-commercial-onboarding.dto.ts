import {
  IsString,
  MinLength,
  MaxLength,
  IsEmail,
  IsOptional,
  Matches,
  IsTimeZone,
} from "class-validator";

export class CompleteCommercialOnboardingDto {
  @IsString()
  @MinLength(1, { message: "clinicDisplayName must have at least 1 character." })
  @MaxLength(160, { message: "clinicDisplayName must have at most 160 characters." })
  clinicDisplayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180, { message: "clinicLegalName must have at most 180 characters." })
  clinicLegalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40, { message: "clinicDocumentNumber must have at most 40 characters." })
  clinicDocumentNumber?: string;

  @IsEmail({}, { message: "clinicContactEmail must be a valid email." })
  @MaxLength(180, { message: "clinicContactEmail must have at most 180 characters." })
  clinicContactEmail!: string;

  @IsString()
  @Matches(/^\+?[\d\s()-]{10,}$/, {
    message: "clinicContactPhone must be a valid phone number (e.g., +55 11 98888-0000 or (11) 98888-0000).",
  })
  @MaxLength(40, { message: "clinicContactPhone must have at most 40 characters." })
  clinicContactPhone!: string;

  @IsOptional()
  @IsTimeZone({
    message:
      "timezone must be a valid IANA timezone (e.g., America/Sao_Paulo).",
  })
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160, { message: "initialUnitName must have at most 160 characters." })
  initialUnitName?: string;

  @IsString()
  @MinLength(1, { message: "adminFullName must have at least 1 character." })
  @MaxLength(160, { message: "adminFullName must have at most 160 characters." })
  adminFullName!: string;

  @IsEmail({}, { message: "adminEmail must be a valid email." })
  @MaxLength(180, { message: "adminEmail must have at most 180 characters." })
  adminEmail!: string;
}
