import { IsOptional, IsString, MaxLength } from "class-validator";

export class ExecuteCaptacaoAgentDto {
  @IsString()
  @MaxLength(64)
  threadId!: string;

  @IsString()
  @MaxLength(4000)
  messageText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  patientPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  patientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  correlationId?: string;
}
