export class CreatePlanDto {
  code!: string;
  name!: string;
  description?: string;
  priceCents!: number;
  currency?: string;
  isPublic?: boolean;
  isActive?: boolean;
}
