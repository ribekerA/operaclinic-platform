import { requestJson } from "@/lib/client/http";
import type {
  ChangePasswordRequestPayload,
  PasswordMutationResponsePayload,
  PasswordResetRequestResponsePayload,
  PlatformDashboardResponsePayload,
  RequestPasswordResetPayload,
  ResetPasswordPayload,
} from "@operaclinic/shared";

export type TenantStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type SubscriptionStatus =
  | "TRIAL"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "EXPIRED";
export type UserStatus = "INVITED" | "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type RoleCode =
  | "SUPER_ADMIN"
  | "PLATFORM_ADMIN"
  | "TENANT_ADMIN"
  | "CLINIC_MANAGER"
  | "RECEPTION"
  | "PROFESSIONAL";

export interface TenantSummaryResponse {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  currentPlan: {
    id: string;
    code: string;
    name: string;
    status: SubscriptionStatus;
    startsAt: string;
    endsAt: string | null;
  } | null;
  settings: Record<string, string>;
}

export interface PlanSummaryResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserSummaryResponse {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  roleAssignments: Array<{
    roleCode: RoleCode;
    tenantId: string | null;
  }>;
  tenantIds: string[];
  linkedProfessional: {
    id: string;
    fullName: string;
    displayName: string;
    professionalRegister: string;
    isActive: boolean;
  } | null;
  requiresProfessionalLink: boolean;
}

export interface CreateTenantPayload {
  slug: string;
  name: string;
  timezone?: string;
  settings?: Record<string, string>;
}

export interface UpdateTenantPayload {
  name?: string;
  timezone?: string;
  status?: TenantStatus;
  settings?: Record<string, string>;
}

export interface CreatePlanPayload {
  code: string;
  name: string;
  description?: string;
  priceCents: number;
  currency?: string;
  isActive?: boolean;
}

export interface ListUsersQuery {
  tenantId?: string;
  status?: UserStatus;
  roleCode?: RoleCode;
  search?: string;
}

export interface CreateUserPayload {
  email: string;
  fullName: string;
  password: string;
  tenantId?: string;
  status?: UserStatus;
  roleCodes: RoleCode[];
  linkedProfessionalId?: string | null;
}

export interface UpdateUserPayload {
  fullName?: string;
  status?: UserStatus;
  password?: string;
  linkedProfessionalId?: string | null;
}

export interface UpdateUserRolesPayload {
  tenantId?: string;
  roleCodes: RoleCode[];
}

export interface ListTenantsQuery {
  status?: TenantStatus;
  search?: string;
}

export interface ListPlansQuery {
  isActive?: boolean;
  search?: string;
}

export const TENANT_STATUS_OPTIONS: TenantStatus[] = [
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
];
export const USER_STATUS_OPTIONS: UserStatus[] = [
  "ACTIVE",
  "INVITED",
  "INACTIVE",
  "SUSPENDED",
];
export const CLINIC_ROLE_OPTIONS: RoleCode[] = [
  "TENANT_ADMIN",
  "CLINIC_MANAGER",
  "RECEPTION",
  "PROFESSIONAL",
];

function buildQuery(query?: object): string {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }

    if (typeof value === "string" && !value.trim()) {
      continue;
    }

    params.set(key, String(value));
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

export async function listTenants(
  query?: ListTenantsQuery,
): Promise<TenantSummaryResponse[]> {
  return requestJson<TenantSummaryResponse[]>(
    `/api/platform/tenants${buildQuery(query)}`,
  );
}

export async function createTenant(
  payload: CreateTenantPayload,
): Promise<TenantSummaryResponse> {
  return requestJson<TenantSummaryResponse>("/api/platform/tenants", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTenant(
  tenantId: string,
  payload: UpdateTenantPayload,
): Promise<TenantSummaryResponse> {
  return requestJson<TenantSummaryResponse>(`/api/platform/tenants/${tenantId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function changeTenantPlan(
  tenantId: string,
  planId: string,
): Promise<TenantSummaryResponse> {
  return requestJson<TenantSummaryResponse>(
    `/api/platform/tenants/${tenantId}/plan`,
    {
      method: "PATCH",
      body: JSON.stringify({ planId }),
    },
  );
}

export async function listPlans(
  query?: ListPlansQuery,
): Promise<PlanSummaryResponse[]> {
  return requestJson<PlanSummaryResponse[]>(
    `/api/platform/plans${buildQuery(query)}`,
  );
}

export async function createPlan(
  payload: CreatePlanPayload,
): Promise<PlanSummaryResponse> {
  return requestJson<PlanSummaryResponse>("/api/platform/plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listUsers(
  query?: ListUsersQuery,
): Promise<UserSummaryResponse[]> {
  return requestJson<UserSummaryResponse[]>(`/api/users${buildQuery(query)}`);
}

export async function getPlatformDashboard(): Promise<PlatformDashboardResponsePayload> {
  return requestJson<PlatformDashboardResponsePayload>("/api/platform/dashboard");
}

export async function createUser(
  payload: CreateUserPayload,
): Promise<UserSummaryResponse> {
  return requestJson<UserSummaryResponse>("/api/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateUser(
  userId: string,
  payload: UpdateUserPayload,
): Promise<UserSummaryResponse> {
  return requestJson<UserSummaryResponse>(`/api/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getUserById(
  userId: string,
): Promise<UserSummaryResponse> {
  return requestJson<UserSummaryResponse>(`/api/users/${userId}`);
}

export async function updateUserRoles(
  userId: string,
  payload: UpdateUserRolesPayload,
): Promise<UserSummaryResponse> {
  return requestJson<UserSummaryResponse>(`/api/users/${userId}/roles`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deactivateUser(
  userId: string,
): Promise<UserSummaryResponse> {
  return requestJson<UserSummaryResponse>(`/api/users/${userId}/deactivate`, {
    method: "PATCH",
  });
}

export async function reactivateUser(
  userId: string,
): Promise<UserSummaryResponse> {
  return requestJson<UserSummaryResponse>(`/api/users/${userId}/reactivate`, {
    method: "PATCH",
  });
}

export async function changeOwnPassword(
  payload: ChangePasswordRequestPayload,
  profile: "clinic" | "platform" = "clinic",
): Promise<PasswordMutationResponsePayload> {
  return requestJson<PasswordMutationResponsePayload>(
    `/api/auth/change-password?profile=${profile}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function requestPasswordReset(
  payload: RequestPasswordResetPayload,
): Promise<PasswordResetRequestResponsePayload> {
  return requestJson<PasswordResetRequestResponsePayload>(
    "/api/auth/request-password-reset",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function resetPassword(
  payload: ResetPasswordPayload,
): Promise<PasswordMutationResponsePayload> {
  return requestJson<PasswordMutationResponsePayload>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
