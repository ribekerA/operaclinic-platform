import { BadRequestException, Injectable } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { CLINIC_ROLE_CODES } from "./identity.constants";

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  ensureClinicRoleCodes(
    incoming: RoleCode[] | undefined,
    options: { allowEmpty: boolean },
  ): RoleCode[] {
    if (!Array.isArray(incoming)) {
      throw new BadRequestException("roleCodes must be an array.");
    }

    const uniqueRoleCodes = [...new Set(incoming)];

    if (!options.allowEmpty && uniqueRoleCodes.length === 0) {
      throw new BadRequestException("roleCodes cannot be empty.");
    }

    const invalidRoleCodes = uniqueRoleCodes.filter(
      (roleCode) => !CLINIC_ROLE_CODES.includes(roleCode),
    );

    if (invalidRoleCodes.length > 0) {
      throw new BadRequestException(
        `Only clinic role codes are allowed: ${CLINIC_ROLE_CODES.join(", ")}. Invalid: ${invalidRoleCodes.join(", ")}`,
      );
    }

    return uniqueRoleCodes;
  }

  async resolveRoleIdsByCodes(codes: RoleCode[]): Promise<Map<RoleCode, string>> {
    const uniqueCodes = [...new Set(codes)];

    if (uniqueCodes.length === 0) {
      return new Map<RoleCode, string>();
    }

    const roles = await this.prisma.role.findMany({
      where: {
        code: {
          in: uniqueCodes,
        },
      },
      select: {
        id: true,
        code: true,
      },
    });

    if (roles.length !== uniqueCodes.length) {
      const foundCodes = new Set(roles.map((role) => role.code));
      const missing = uniqueCodes.filter((code) => !foundCodes.has(code));

      throw new BadRequestException(
        `Missing role definitions for: ${missing.join(", ")}. Run seed before this operation.`,
      );
    }

    return roles.reduce((acc, role) => {
      acc.set(role.code, role.id);
      return acc;
    }, new Map<RoleCode, string>());
  }

  getClinicRoleCodes(): RoleCode[] {
    return [...CLINIC_ROLE_CODES];
  }
}
