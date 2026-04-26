import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { ClinicSkillAllowedRole, ClinicSkillContext } from "@operaclinic/shared";
import { RoleCode, UserStatus } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class SkillActorResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    context: ClinicSkillContext,
    allowedRoles: ClinicSkillAllowedRole[],
  ): Promise<AuthenticatedUser> {
    const tenantId = context.tenantId?.trim();
    const actorUserId = context.actorUserId?.trim();

    if (!tenantId) {
      throw new BadRequestException("Skill context requires tenantId.");
    }

    if (!actorUserId) {
      throw new BadRequestException("Skill context requires actorUserId.");
    }

    const actor = await this.prisma.user.findFirst({
      where: {
        id: actorUserId,
        status: UserStatus.ACTIVE,
        userRoles: {
          some: {
            tenantId,
          },
        },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        professionalProfile: {
          select: {
            id: true,
            tenantId: true,
          },
        },
        userRoles: {
          where: {
            tenantId,
          },
          include: {
            role: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    if (!actor) {
      throw new ForbiddenException(
        "Skill actor does not have active access to this clinic.",
      );
    }

    const roleCodes = actor.userRoles.map((userRole) => userRole.role.code);
    const allowedRoleSet = new Set<RoleCode>(allowedRoles as RoleCode[]);

    if (!roleCodes.some((roleCode) => allowedRoleSet.has(roleCode))) {
      throw new ForbiddenException(
        "Skill actor is not allowed to execute this skill.",
      );
    }

    return {
      id: actor.id,
      email: actor.email,
      fullName: actor.fullName,
      status: actor.status,
      profile: "clinic",
      roles: roleCodes,
      tenantIds: [tenantId],
      activeTenantId: tenantId,
      linkedProfessionalId:
        actor.professionalProfile?.tenantId === tenantId
          ? actor.professionalProfile.id
          : null,
    };
  }
}
