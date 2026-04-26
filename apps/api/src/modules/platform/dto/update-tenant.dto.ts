import { TenantStatus } from "@prisma/client";

export class UpdateTenantDto {
  name?: string;
  timezone?: string;
  status?: TenantStatus;
  settings?: Record<string, string>;
}
