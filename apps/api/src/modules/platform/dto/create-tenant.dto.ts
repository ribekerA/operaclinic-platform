export class CreateTenantDto {
  slug!: string;
  name!: string;
  timezone?: string;
  settings?: Record<string, string>;
}
