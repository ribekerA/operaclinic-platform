import { IsString, IsUUID } from "class-validator";

export class StartCommercialOnboardingDto {
  @IsUUID("4", { message: "planId must be a valid UUID." })
  planId!: string;
}
