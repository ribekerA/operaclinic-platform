import { RoleCode } from "@prisma/client";
import { AuthProfile } from "./authenticated-user.interface";

export type TokenType = "access" | "refresh";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  profile: AuthProfile;
  roles: RoleCode[];
  tenantIds: string[];
  tenantId: string | null;
  sessionVersion: number;
  tokenType: TokenType;
}
