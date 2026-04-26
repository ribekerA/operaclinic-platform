import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { hash } from "bcryptjs";
import {
  Prisma,
  RoleCode,
  TenantStatus,
  UserStatus,
} from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { PLATFORM_ROLE_CODES } from "../../auth/constants/auth.constants";
import { AUDIT_ACTIONS, type AuditAction } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";
import { UpdateUserRolesDto } from "./dto/update-user-roles.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { RolesService } from "./roles.service";
import { UserSummaryResponse } from "./interfaces/user-summary.response";

const userInclude = {
  userRoles: {
    include: {
      role: true,
    },
  },
  professionalProfile: {
    select: {
      id: true,
      fullName: true,
      displayName: true,
      professionalRegister: true,
      isActive: true,
      tenantId: true,
    },
  },
} satisfies Prisma.UserInclude;

type UserWithRelations = Prisma.UserGetPayload<{
  include: typeof userInclude;
}>;

type UserTransactionClient = Prisma.TransactionClient;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
    private readonly auditService: AuditService,
  ) {}

  async listUsers(
    actor: AuthenticatedUser,
    query: ListUsersQueryDto,
  ): Promise<UserSummaryResponse[]> {
    const scopedTenantId = this.resolveTenantScopeForRead(actor, query.tenantId);

    const where: Prisma.UserWhereInput = {};

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { fullName: { contains: search, mode: "insensitive" } },
      ];
    }

    if (query.status) {
      where.status = this.parseUserStatus(query.status);
    }

    const roleFilters: Prisma.UserRoleWhereInput[] = [];

    if (scopedTenantId) {
      roleFilters.push({ tenantId: scopedTenantId });
    }

    if (query.roleCode) {
      roleFilters.push({ role: { code: this.parseRoleCode(query.roleCode) } });
    }

    if (roleFilters.length > 0) {
      where.userRoles = {
        some: roleFilters.length === 1 ? roleFilters[0] : { AND: roleFilters },
      };
    }

    const users = await this.prisma.user.findMany({
      where,
      include: userInclude,
      orderBy: { createdAt: "desc" },
    });

    return users.map((user) => this.mapUserSummary(user, scopedTenantId));
  }

  async createUser(
    actor: AuthenticatedUser,
    input: CreateUserDto,
  ): Promise<UserSummaryResponse> {
    const tenantId = await this.resolveTenantScopeForWrite(actor, input.tenantId);
    await this.ensureTenantIsActive(tenantId);

    const email = input.email?.trim().toLowerCase();
    const fullName = input.fullName?.trim();
    const password = input.password?.trim();

    if (!email || !fullName || !password) {
      throw new BadRequestException("email, fullName and password are required.");
    }

    this.assertPasswordPolicy(password);

    const status = input.status ? this.parseUserStatus(input.status) : UserStatus.ACTIVE;
    const roleCodes = this.rolesService.ensureClinicRoleCodes(input.roleCodes, {
      allowEmpty: false,
    });
    const linkedProfessionalId = this.normalizeLinkedProfessionalId(
      input.linkedProfessionalId,
    );

    if (linkedProfessionalId && !roleCodes.includes(RoleCode.PROFESSIONAL)) {
      throw new BadRequestException(
        "linkedProfessionalId requires the PROFESSIONAL role.",
      );
    }

    const roleIdMap = await this.rolesService.resolveRoleIdsByCodes(roleCodes);
    const passwordHash = await hash(password, 10);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            fullName,
            passwordHash,
            passwordChangedAt: new Date(),
            status,
          },
        });

        await tx.userRole.createMany({
          data: roleCodes.map((roleCode) => ({
            userId: user.id,
            roleId: roleIdMap.get(roleCode) as string,
            tenantId,
          })),
          skipDuplicates: true,
        });

        if (linkedProfessionalId) {
          await this.syncProfessionalLink(
            tx,
            tenantId,
            user.id,
            linkedProfessionalId,
          );

          await this.auditService.record(
            {
              action: AUDIT_ACTIONS.USER_PROFESSIONAL_LINK_UPDATED,
              actor,
              tenantId,
              targetType: "user",
              targetId: user.id,
              metadata: {
                linkedProfessionalId,
                source: "create_user",
              },
            },
            tx,
          );
        }

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.USER_CREATED,
            actor,
            tenantId,
            targetType: "user",
            targetId: user.id,
            metadata: {
              email: user.email,
              status: user.status,
              roleCodes,
              linkedProfessionalId,
            },
          },
          tx,
        );

        return tx.user.findUniqueOrThrow({
          where: { id: user.id },
          include: userInclude,
        });
      });

      return this.mapUserSummary(created, actor.profile === "clinic" ? tenantId : null);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("User email already exists.");
      }

      throw error;
    }
  }

  async updateUser(
    actor: AuthenticatedUser,
    userId: string,
    input: UpdateUserDto,
  ): Promise<UserSummaryResponse> {
    const targetUser = await this.findUserOrThrow(userId);
    const scopedTenantId =
      actor.profile === "clinic"
        ? this.resolveTenantScopeForRead(actor, actor.activeTenantId)
        : null;

    if (actor.profile === "clinic") {
      if (!scopedTenantId) {
        throw new ForbiddenException("Active tenant context is required.");
      }

      this.ensureClinicCanManageUser(actor, targetUser, scopedTenantId);
    }

    const updateData: Prisma.UserUpdateInput = {};
    const updatedFields: string[] = [];
    const nextLinkedProfessionalId = this.normalizeLinkedProfessionalId(
      input.linkedProfessionalId,
    );
    let shouldIncrementSession = false;

    if (typeof input.fullName === "string") {
      const fullName = input.fullName.trim();

      if (!fullName) {
        throw new BadRequestException("fullName cannot be empty.");
      }

      updateData.fullName = fullName;
      updatedFields.push("fullName");
    }

    if (input.status) {
      const status = this.parseUserStatus(input.status);

      if (status !== UserStatus.ACTIVE && actor.id === userId) {
        throw new ForbiddenException("You cannot deactivate your own user.");
      }

      updateData.status = status;
      updatedFields.push("status");
      shouldIncrementSession = true;
    }

    if (typeof input.password === "string") {
      const password = input.password.trim();

      if (!password) {
        throw new BadRequestException("password cannot be empty.");
      }

      this.assertPasswordPolicy(password);

      updateData.passwordHash = await hash(password, 10);
      updateData.passwordChangedAt = new Date();
      updateData.passwordResetTokenHash = null;
      updateData.passwordResetExpiresAt = null;
      updatedFields.push("password");
      shouldIncrementSession = true;
    }

    const scopeTenantIdForLink =
      scopedTenantId ?? this.resolveLinkTenantId(targetUser, actor, input);

    if (
      scopeTenantIdForLink &&
      nextLinkedProfessionalId !== undefined &&
      nextLinkedProfessionalId !== null
    ) {
      this.ensureProfessionalRoleForLink(targetUser, scopeTenantIdForLink);
      updatedFields.push("linkedProfessionalId");
      shouldIncrementSession = true;
    } else if (scopeTenantIdForLink && nextLinkedProfessionalId === null) {
      updatedFields.push("linkedProfessionalId");
      shouldIncrementSession = true;
    }

    if (Object.keys(updateData).length === 0 && nextLinkedProfessionalId === undefined) {
      throw new BadRequestException("No valid fields were provided for update.");
    }

    if (shouldIncrementSession) {
      updateData.sessionVersion = {
        increment: 1,
      };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.user.update({
          where: { id: userId },
          data: updateData,
        });
      }

      if (scopeTenantIdForLink && nextLinkedProfessionalId !== undefined) {
        await this.syncProfessionalLink(
          tx,
          scopeTenantIdForLink,
          userId,
          nextLinkedProfessionalId,
        );

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.USER_PROFESSIONAL_LINK_UPDATED,
            actor,
            tenantId: scopeTenantIdForLink,
            targetType: "user",
            targetId: userId,
            metadata: {
              linkedProfessionalId: nextLinkedProfessionalId,
              source: "update_user",
            },
          },
          tx,
        );
      }

      await this.auditService.record(
        {
          action: AUDIT_ACTIONS.USER_UPDATED,
          actor,
          tenantId: scopedTenantId,
          targetType: "user",
          targetId: userId,
          metadata: {
            updatedFields,
          },
        },
        tx,
      );

      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: userInclude,
      });
    });

    return this.mapUserSummary(updated, scopedTenantId);
  }

  async updateUserRoles(
    actor: AuthenticatedUser,
    userId: string,
    input: UpdateUserRolesDto,
  ): Promise<UserSummaryResponse> {
    const tenantId = await this.resolveTenantScopeForWrite(actor, input.tenantId);
    await this.ensureTenantIsActive(tenantId);

    const targetUser = await this.findUserOrThrow(userId);

    if (actor.profile === "clinic") {
      this.ensureClinicCanManageUser(actor, targetUser, tenantId);
    }

    const roleCodes = this.rolesService.ensureClinicRoleCodes(input.roleCodes, {
      allowEmpty: true,
    });

    if (
      !roleCodes.includes(RoleCode.PROFESSIONAL) &&
      targetUser.professionalProfile?.tenantId === tenantId
    ) {
      throw new BadRequestException(
        "Unlink the professional profile before removing the PROFESSIONAL role.",
      );
    }

    if (
      actor.profile === "clinic" &&
      actor.id === userId &&
      actor.roles.includes(RoleCode.TENANT_ADMIN) &&
      !roleCodes.includes(RoleCode.TENANT_ADMIN)
    ) {
      throw new ForbiddenException("You cannot remove your own clinic admin role.");
    }

    const roleIdMap = await this.rolesService.resolveRoleIdsByCodes(roleCodes);
    const clinicRoleCodes = this.rolesService.getClinicRoleCodes();

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: {
          userId,
          tenantId,
          role: {
            code: {
              in: clinicRoleCodes,
            },
          },
        },
      });

      if (roleCodes.length > 0) {
        await tx.userRole.createMany({
          data: roleCodes.map((roleCode) => ({
            userId,
            tenantId,
            roleId: roleIdMap.get(roleCode) as string,
          })),
          skipDuplicates: true,
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          sessionVersion: {
            increment: 1,
          },
        },
      });

      await this.auditService.record(
        {
          action: AUDIT_ACTIONS.USER_ROLES_UPDATED,
          actor,
          tenantId,
          targetType: "user",
          targetId: userId,
          metadata: {
            roleCodes,
          },
        },
        tx,
      );

      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: userInclude,
      });
    });

    return this.mapUserSummary(updated, actor.profile === "clinic" ? tenantId : null);
  }

  async deactivateUser(
    actor: AuthenticatedUser,
    userId: string,
  ): Promise<UserSummaryResponse> {
    if (actor.id === userId) {
      throw new ForbiddenException("You cannot deactivate your own user.");
    }

    return this.updateUserStatus(actor, userId, UserStatus.INACTIVE, AUDIT_ACTIONS.USER_DEACTIVATED);
  }

  async reactivateUser(
    actor: AuthenticatedUser,
    userId: string,
  ): Promise<UserSummaryResponse> {
    return this.updateUserStatus(actor, userId, UserStatus.ACTIVE, AUDIT_ACTIONS.USER_REACTIVATED);
  }

  async getUserById(
    actor: AuthenticatedUser,
    userId: string,
  ): Promise<UserSummaryResponse> {
    const scopedTenantId = this.resolveTenantScopeForRead(actor, actor.activeTenantId);
    const user = await this.findUserOrThrow(userId);

    if (actor.profile === "clinic") {
      this.ensureClinicCanManageUser(actor, user, scopedTenantId as string);
    }

    return this.mapUserSummary(user, scopedTenantId);
  }

  private async updateUserStatus(
    actor: AuthenticatedUser,
    userId: string,
    status: UserStatus,
    action: AuditAction,
  ): Promise<UserSummaryResponse> {
    const targetUser = await this.findUserOrThrow(userId);
    const tenantId =
      actor.profile === "clinic"
        ? this.resolveTenantScopeForRead(actor, actor.activeTenantId)
        : null;

    if (actor.profile === "clinic") {
      this.ensureClinicCanManageUser(actor, targetUser, tenantId as string);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          status,
          sessionVersion: {
            increment: 1,
          },
        },
        include: userInclude,
      });

      await this.auditService.record(
        {
          action,
          actor,
          tenantId,
          targetType: "user",
          targetId: userId,
          metadata: {
            status,
          },
        },
        tx,
      );

      return user;
    });

    return this.mapUserSummary(updated, tenantId);
  }

  private resolveTenantScopeForRead(
    actor: AuthenticatedUser,
    requestedTenantId?: string | null,
  ): string | null {
    const normalizedTenantId = requestedTenantId?.trim();

    if (actor.profile === "platform") {
      return normalizedTenantId || null;
    }

    const activeTenantId = actor.activeTenantId;

    if (!activeTenantId) {
      throw new ForbiddenException("Active tenant context is required.");
    }

    if (normalizedTenantId && normalizedTenantId !== activeTenantId) {
      throw new ForbiddenException(
        "Clinic administrators can only access users from their active tenant.",
      );
    }

    return activeTenantId;
  }

  private async resolveTenantScopeForWrite(
    actor: AuthenticatedUser,
    requestedTenantId?: string | null,
  ): Promise<string> {
    const normalizedTenantId = requestedTenantId?.trim();

    if (actor.profile === "platform") {
      if (!normalizedTenantId) {
        throw new BadRequestException(
          "tenantId is required for platform administrators in this operation.",
        );
      }

      return normalizedTenantId;
    }

    const activeTenantId = actor.activeTenantId;

    if (!activeTenantId) {
      throw new ForbiddenException("Active tenant context is required.");
    }

    if (normalizedTenantId && normalizedTenantId !== activeTenantId) {
      throw new ForbiddenException(
        "Clinic administrators can only operate inside their active tenant.",
      );
    }

    return activeTenantId;
  }

  private ensureClinicCanManageUser(
    actor: AuthenticatedUser,
    targetUser: UserWithRelations,
    tenantId: string,
  ): void {
    const targetHasPlatformRole = targetUser.userRoles.some((assignment) =>
      PLATFORM_ROLE_CODES.includes(assignment.role.code),
    );

    if (targetHasPlatformRole) {
      throw new ForbiddenException(
        "Clinic administrators cannot manage platform-level users.",
      );
    }

    const hasTenantMembership = targetUser.userRoles.some(
      (assignment) => assignment.tenantId === tenantId,
    );

    if (!hasTenantMembership && actor.id !== targetUser.id) {
      throw new ForbiddenException(
        "Clinic administrators can only manage users from their active tenant.",
      );
    }
  }

  private async ensureTenantIsActive(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException("Tenant not found.");
    }

    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new BadRequestException("Tenant must be ACTIVE for this operation.");
    }
  }

  private async findUserOrThrow(userId: string): Promise<UserWithRelations> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: userInclude,
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    return user;
  }

  private normalizeLinkedProfessionalId(
    value: string | null | undefined,
  ): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private resolveLinkTenantId(
    targetUser: UserWithRelations,
    actor: AuthenticatedUser,
    input: UpdateUserDto,
  ): string | null {
    const nextLinkedProfessionalId = this.normalizeLinkedProfessionalId(
      input.linkedProfessionalId,
    );

    if (nextLinkedProfessionalId === undefined) {
      return null;
    }

    if (actor.profile === "clinic") {
      return actor.activeTenantId;
    }

    return (
      targetUser.professionalProfile?.tenantId ??
      targetUser.userRoles.find((assignment) => assignment.tenantId)?.tenantId ??
      null
    );
  }

  private ensureProfessionalRoleForLink(
    targetUser: UserWithRelations,
    tenantId: string,
  ): void {
    const hasProfessionalRole = targetUser.userRoles.some(
      (assignment) =>
        assignment.tenantId === tenantId &&
        assignment.role.code === RoleCode.PROFESSIONAL,
    );

    if (!hasProfessionalRole) {
      throw new BadRequestException(
        "The target user must have the PROFESSIONAL role before linking a professional profile.",
      );
    }
  }

  private async syncProfessionalLink(
    tx: UserTransactionClient,
    tenantId: string,
    userId: string,
    linkedProfessionalId: string | null,
  ): Promise<void> {
    const currentProfessional = await tx.professional.findFirst({
      where: {
        tenantId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (linkedProfessionalId === null) {
      if (currentProfessional) {
        await tx.professional.update({
          where: { id: currentProfessional.id },
          data: {
            userId: null,
          },
        });
      }

      return;
    }

    const targetProfessional = await tx.professional.findFirst({
      where: {
        id: linkedProfessionalId,
        tenantId,
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!targetProfessional) {
      throw new NotFoundException("Professional not found for this clinic.");
    }

    if (targetProfessional.userId && targetProfessional.userId !== userId) {
      throw new ConflictException("Professional already has a linked user.");
    }

    if (currentProfessional && currentProfessional.id !== targetProfessional.id) {
      await tx.professional.update({
        where: { id: currentProfessional.id },
        data: {
          userId: null,
        },
      });
    }

    await tx.professional.update({
      where: { id: targetProfessional.id },
      data: {
        userId,
      },
    });
  }

  private assertPasswordPolicy(password: string): void {
    if (password.length < 8) {
      throw new BadRequestException(
        "Password must have at least 8 characters.",
      );
    }

    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      throw new BadRequestException(
        "Password must include uppercase, lowercase and numeric characters.",
      );
    }
  }

  private parseUserStatus(value: string): UserStatus {
    if ((Object.values(UserStatus) as string[]).includes(value)) {
      return value as UserStatus;
    }

    throw new BadRequestException("Invalid user status.");
  }

  private parseRoleCode(value: string): RoleCode {
    if ((Object.values(RoleCode) as string[]).includes(value)) {
      return value as RoleCode;
    }

    throw new BadRequestException("Invalid roleCode.");
  }

  private mapUserSummary(
    user: UserWithRelations,
    scopeTenantId: string | null,
  ): UserSummaryResponse {
    const filteredAssignments =
      scopeTenantId === null
        ? user.userRoles
        : user.userRoles.filter((assignment) => assignment.tenantId === scopeTenantId);

    const tenantIds = [
      ...new Set(
        filteredAssignments
          .map((assignment) => assignment.tenantId)
          .filter((tenantId): tenantId is string => Boolean(tenantId)),
      ),
    ];

    const scopedRoles = filteredAssignments.map((assignment) => assignment.role.code);
    const requiresProfessionalLink =
      scopedRoles.includes(RoleCode.PROFESSIONAL) && !user.professionalProfile;

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roleAssignments: filteredAssignments.map((assignment) => ({
        roleCode: assignment.role.code,
        tenantId: assignment.tenantId,
      })),
      tenantIds,
      linkedProfessional: user.professionalProfile
        ? {
            id: user.professionalProfile.id,
            fullName: user.professionalProfile.fullName,
            displayName: user.professionalProfile.displayName,
            professionalRegister: user.professionalProfile.professionalRegister,
            isActive: user.professionalProfile.isActive,
          }
        : null,
      requiresProfessionalLink,
    };
  }
}
