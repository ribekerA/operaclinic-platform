import { SubscriptionStatus, TenantStatus } from "@prisma/client";

export interface TenantSummaryResponse {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
  currentPlan: {
    id: string;
    code: string;
    name: string;
    status: SubscriptionStatus;
    startsAt: Date;
    endsAt: Date | null;
  } | null;
  settings: Record<string, string>;
}
