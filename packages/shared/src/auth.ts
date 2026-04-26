export type AuthProfile = "platform" | "clinic";

export interface LoginRequestPayload {
  profile?: AuthProfile;
  email: string;
  password: string;
  tenantId?: string;
}

export interface RefreshTokenRequestPayload {
  refreshToken: string;
}

export interface ResolveClinicTenantsRequestPayload {
  email: string;
  password: string;
}

export interface ChangePasswordRequestPayload {
  currentPassword: string;
  newPassword: string;
}

export interface RequestPasswordResetPayload {
  email: string;
}

export interface SwitchClinicRequestPayload {
  tenantId: string;
}

export interface PasswordResetRequestResponsePayload {
  accepted: boolean;
  resetTokenPreview?: string | null;
  resetUrlPreview?: string | null;
  expiresAt?: string | null;
}

export interface ResetPasswordPayload {
  token: string;
  newPassword: string;
}

export interface PasswordMutationResponsePayload {
  success: boolean;
  requiresReauthentication?: boolean;
}

export interface AestheticClinicLoginTenantOption {
  id: string;
  slug: string;
  name: string;
}

export interface ResolveClinicTenantsResponsePayload {
  tenants: AestheticClinicLoginTenantOption[];
}

export interface SessionUser {
  id: string;
  email: string;
  fullName?: string;
  status?: string;
  profile: AuthProfile;
  roles: string[];
  tenantIds: string[];
  activeTenantId: string | null;
  availableClinics?: AestheticClinicLoginTenantOption[];
  activeClinic?: AestheticClinicLoginTenantOption | null;
  linkedProfessionalId?: string | null;
}

export interface AuthResponsePayload {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  accessTokenExpiresIn: string;
  refreshTokenExpiresIn: string;
  user: SessionUser;
}

export interface SessionMePayload {
  user: SessionUser;
}
