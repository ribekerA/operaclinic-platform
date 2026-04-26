import { RoleCode } from "@prisma/client";

export const ACCESS_TOKEN_TYPE = "access";
export const REFRESH_TOKEN_TYPE = "refresh";

export const PLATFORM_ROLE_CODES: readonly RoleCode[] = [
  RoleCode.SUPER_ADMIN,
  RoleCode.PLATFORM_ADMIN,
];
