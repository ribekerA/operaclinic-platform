import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type {
  AestheticClinicLoginTenantOption,
  PasswordMutationResponsePayload,
  PasswordResetRequestResponsePayload,
  ResolveClinicTenantsResponsePayload,
} from "@operaclinic/shared";
import {
  Prisma,
  RoleCode,
  TenantStatus,
  UserStatus,
} from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import {
  ACCESS_TOKEN_TYPE,
  PLATFORM_ROLE_CODES,
  REFRESH_TOKEN_TYPE,
} from "./constants/auth.constants";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RequestPasswordResetDto } from "./dto/request-password-reset.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ResolveClinicTenantsDto } from "./dto/resolve-clinic-tenants.dto";
import { SwitchClinicDto } from "./dto/switch-clinic.dto";
import { AuthResponse } from "./interfaces/auth-response.interface";
import {
  AuthenticatedUser,
  AuthProfile,
} from "./interfaces/authenticated-user.interface";
import {
  AuthTokenPayload,
  TokenType,
} from "./interfaces/auth-token-payload.interface";
import { AUDIT_ACTIONS } from "../common/audit/audit.constants";
import { PrismaService } from "../database/prisma.service";

type UserWithRelations = Prisma.UserGetPayload<{
  include: {
    professionalProfile: {
      select: {
        id: true;
      };
    };
    userRoles: {
      include: {
        role: true;
        tenant: true;
      };
    };
  };
}>;

type AuthTransactionClient = Prisma.TransactionClient;

const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(input: LoginDto): Promise<AuthResponse> {
    const user = await this.validateCredentials(input);
    const userContext = this.buildUserContext(user, input.tenantId);

    return this.issueTokens(userContext);
  }

  async resolveClinicTenants(
    input: ResolveClinicTenantsDto,
  ): Promise<ResolveClinicTenantsResponsePayload> {
    const user = await this.validateCredentials(input);
    const activeAssignments = this.getActiveAssignments(user);
    const roles = this.uniqueRoles(activeAssignments.map((assignment) => assignment.role.code));
    const profile = this.resolveProfile(roles);

    if (profile !== "clinic") {
      throw new BadRequestException(
        "Clinic tenant selection is only available for clinic users.",
      );
    }

    const tenants = this.buildClinicTenantOptions(activeAssignments);

    if (tenants.length === 0) {
      throw new UnauthorizedException(
        "Clinic users must have at least one active tenant assignment.",
      );
    }

    return {
      tenants,
    };
  }

  async refresh(input: RefreshTokenDto): Promise<AuthResponse> {
    const refreshToken = input.refreshToken?.trim();

    if (!refreshToken) {
      throw new BadRequestException("refreshToken is required.");
    }

    const payload = await this.verifyRefreshToken(refreshToken);
    const userContext = await this.validateSessionPayload(payload);

    return this.issueTokens(userContext);
  }

  async switchClinic(
    currentUser: AuthenticatedUser,
    input: SwitchClinicDto,
  ): Promise<AuthResponse> {
    const tenantId = input.tenantId?.trim();

    if (!tenantId) {
      throw new BadRequestException("tenantId is required.");
    }

    if (currentUser.profile !== "clinic") {
      throw new BadRequestException(
        "Clinic switching is only available for clinic users.",
      );
    }

    const user = await this.findUserById(currentUser.id);

    if (!user) {
      throw new UnauthorizedException("Authenticated user was not found.");
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("User is not active.");
    }

    if (
      typeof currentUser.sessionVersion === "number" &&
      user.sessionVersion !== currentUser.sessionVersion
    ) {
      throw new UnauthorizedException("Session is no longer valid.");
    }

    const userContext = this.buildUserContext(user, tenantId);

    if (userContext.profile !== "clinic") {
      throw new BadRequestException(
        "Clinic switching is only available for clinic users.",
      );
    }

    return this.issueTokens(userContext);
  }

  async getMe(currentUser: AuthenticatedUser): Promise<AuthenticatedUser> {
    const user = await this.findUserById(currentUser.id);

    if (!user) {
      throw new UnauthorizedException("Authenticated user was not found.");
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("User is not active.");
    }

    if (
      typeof currentUser.sessionVersion === "number" &&
      user.sessionVersion !== currentUser.sessionVersion
    ) {
      throw new UnauthorizedException("Session is no longer valid.");
    }

    return this.buildUserContext(user, currentUser.activeTenantId ?? undefined);
  }

  async validateSessionPayload(
    payload: Pick<AuthTokenPayload, "sub" | "tenantId" | "sessionVersion">,
  ): Promise<AuthenticatedUser> {
    const user = await this.findUserById(payload.sub);

    if (!user) {
      throw new UnauthorizedException("Invalid token subject.");
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("User is not active.");
    }

    if (user.sessionVersion !== payload.sessionVersion) {
      throw new UnauthorizedException("Session is no longer valid.");
    }

    return this.buildUserContext(user, payload.tenantId ?? undefined);
  }

  async changePassword(
    actor: AuthenticatedUser,
    input: ChangePasswordDto,
  ): Promise<PasswordMutationResponsePayload> {
    const currentPassword = input.currentPassword?.trim();
    const newPassword = input.newPassword?.trim();

    if (!currentPassword || !newPassword) {
      throw new BadRequestException(
        "currentPassword and newPassword are required.",
      );
    }

    this.assertPasswordPolicy(newPassword);

    const user = await this.findUserById(actor.id);

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("User is not active.");
    }

    const currentPasswordMatches = await this.matchesPassword(
      currentPassword,
      user.passwordHash,
    );

    if (!currentPasswordMatches) {
      throw new UnauthorizedException("Current password is invalid.");
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException(
        "newPassword must be different from the current password.",
      );
    }

    const nextPasswordHash = await hash(newPassword, 10);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: actor.id },
        data: {
          passwordHash: nextPasswordHash,
          passwordChangedAt: now,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          sessionVersion: {
            increment: 1,
          },
        },
      });

      await this.recordAuditLog(tx, {
        action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
        actorUserId: actor.id,
        actorProfile: actor.profile,
        actorRoles: actor.roles,
        tenantId: actor.activeTenantId,
        targetType: "user",
        targetId: actor.id,
        metadata: {
          source: "change_password",
        },
      });
    });

    return {
      success: true,
      requiresReauthentication: true,
    };
  }

  async requestPasswordReset(
    input: RequestPasswordResetDto,
  ): Promise<PasswordResetRequestResponsePayload> {
    const email = this.normalizeEmail(input.email);

    if (!email) {
      throw new BadRequestException("email is required.");
    }

    const user = await this.findUserByEmail(email);

    if (!user || !this.canIssuePasswordReset(user.status)) {
      return { accepted: true };
    }

    const resetToken = this.generateResetToken();
    const resetTokenHash = this.hashResetToken(resetToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: resetTokenHash,
          passwordResetExpiresAt: expiresAt,
        },
      });

      await this.recordAuditLog(tx, {
        action: AUDIT_ACTIONS.USER_PASSWORD_RESET_REQUESTED,
        actorUserId: null,
        actorProfile: "system",
        actorRoles: [],
        tenantId: this.resolvePrimaryTenantId(user),
        targetType: "user",
        targetId: user.id,
        metadata: {
          email: user.email,
          delivery: this.shouldExposeResetPreview() ? "preview" : "out_of_band",
        },
      });
    });

    if (!this.shouldExposeResetPreview()) {
      return { accepted: true };
    }

    return {
      accepted: true,
      resetTokenPreview: resetToken,
      resetUrlPreview: `/clinic/reset-password?token=${encodeURIComponent(resetToken)}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async resetPassword(
    input: ResetPasswordDto,
  ): Promise<PasswordMutationResponsePayload> {
    const token = input.token?.trim();
    const newPassword = input.newPassword?.trim();

    if (!token || !newPassword) {
      throw new BadRequestException("token and newPassword are required.");
    }

    this.assertPasswordPolicy(newPassword);

    const tokenHash = this.hashResetToken(token);
    const now = new Date();

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: {
          gt: now,
        },
      },
      include: {
        professionalProfile: {
          select: {
            id: true,
          },
        },
        userRoles: {
          include: {
            role: true,
            tenant: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid or expired password reset token.");
    }

    const nextPasswordHash = await hash(newPassword, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: nextPasswordHash,
          passwordChangedAt: now,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          sessionVersion: {
            increment: 1,
          },
          status:
            user.status === UserStatus.INVITED ? UserStatus.ACTIVE : user.status,
        },
      });

      await this.recordAuditLog(tx, {
        action: AUDIT_ACTIONS.USER_PASSWORD_RESET_COMPLETED,
        actorUserId: null,
        actorProfile: "system",
        actorRoles: [],
        tenantId: this.resolvePrimaryTenantId(user),
        targetType: "user",
        targetId: user.id,
        metadata: {
          source: "reset_password",
        },
      });
    });

    return {
      success: true,
      requiresReauthentication: true,
    };
  }

  private async findUserByEmail(email: string): Promise<UserWithRelations | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        professionalProfile: {
          select: {
            id: true,
          },
        },
        userRoles: {
          include: {
            role: true,
            tenant: true,
          },
        },
      },
    });
  }

  private async findUserById(id: string): Promise<UserWithRelations | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        professionalProfile: {
          select: {
            id: true,
          },
        },
        userRoles: {
          include: {
            role: true,
            tenant: true,
          },
        },
      },
    });
  }

  private buildUserContext(
    user: UserWithRelations,
    requestedTenantId?: string,
  ): AuthenticatedUser {
    const activeAssignments = this.getActiveAssignments(user);
    const allRoles = this.uniqueRoles(
      activeAssignments.map((assignment) => assignment.role.code),
    );

    if (allRoles.length === 0) {
      throw new UnauthorizedException("User has no active role assignments.");
    }

    const profile = this.resolveProfile(allRoles);
    const availableClinics =
      profile === "clinic" ? this.buildClinicTenantOptions(activeAssignments) : [];
    const tenantIds = availableClinics.map((clinic) => clinic.id);

    const activeTenantId = this.resolveActiveTenantId(
      profile,
      tenantIds,
      requestedTenantId,
    );
    const roles =
      profile === "clinic"
        ? this.resolveClinicRolesForTenant(activeAssignments, activeTenantId)
        : this.resolvePlatformRoles(activeAssignments);

    if (roles.length === 0) {
      throw new UnauthorizedException("User has no active role assignments.");
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      profile,
      roles,
      tenantIds,
      activeTenantId,
      availableClinics,
      activeClinic:
        profile === "clinic"
          ? availableClinics.find((clinic) => clinic.id === activeTenantId) ?? null
          : null,
      linkedProfessionalId: user.professionalProfile?.id ?? null,
      sessionVersion: user.sessionVersion,
    };
  }

  private getActiveAssignments(user: UserWithRelations): UserWithRelations["userRoles"] {
    return user.userRoles.filter((assignment) => {
      if (!assignment.tenantId) {
        return true;
      }

      return assignment.tenant?.status === TenantStatus.ACTIVE;
    });
  }

  private resolveProfile(roles: RoleCode[]): AuthProfile {
    const isPlatformProfile = roles.some((role) =>
      PLATFORM_ROLE_CODES.includes(role),
    );

    return isPlatformProfile ? "platform" : "clinic";
  }

  private buildClinicTenantOptions(
    assignments: UserWithRelations["userRoles"],
  ): AestheticClinicLoginTenantOption[] {
    return [...new Map(
      assignments
        .filter(
          (
            assignment,
          ): assignment is typeof assignment & {
            tenantId: string;
            tenant: NonNullable<typeof assignment.tenant>;
          } => Boolean(assignment.tenantId && assignment.tenant),
        )
        .map((assignment) => [
          assignment.tenantId,
          {
            id: assignment.tenantId,
            slug: assignment.tenant.slug,
            name: assignment.tenant.name,
          },
        ]),
    ).values()].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }

  private resolveClinicRolesForTenant(
    assignments: UserWithRelations["userRoles"],
    activeTenantId: string | null,
  ): RoleCode[] {
    if (!activeTenantId) {
      return [];
    }

    return this.uniqueRoles(
      assignments
        .filter((assignment) => assignment.tenantId === activeTenantId)
        .map((assignment) => assignment.role.code),
    );
  }

  private resolvePlatformRoles(
    assignments: UserWithRelations["userRoles"],
  ): RoleCode[] {
    return this.uniqueRoles(
      assignments
        .map((assignment) => assignment.role.code)
        .filter((roleCode) => PLATFORM_ROLE_CODES.includes(roleCode)),
    );
  }

  private resolveActiveTenantId(
    profile: AuthProfile,
    tenantIds: string[],
    requestedTenantId?: string,
  ): string | null {
    if (profile === "platform") {
      return null;
    }

    if (tenantIds.length === 0) {
      throw new UnauthorizedException(
        "Clinic users must have at least one active tenant assignment.",
      );
    }

    if (requestedTenantId) {
      if (!tenantIds.includes(requestedTenantId)) {
        throw new UnauthorizedException("Requested tenant is not assigned to this user.");
      }

      return requestedTenantId;
    }

    if (tenantIds.length === 1) {
      return tenantIds[0];
    }

    throw new BadRequestException(
      "tenantId is required for clinic users assigned to multiple tenants.",
    );
  }

  private uniqueRoles(roles: RoleCode[]): RoleCode[] {
    return [...new Set(roles)];
  }

  private normalizeEmail(email: string | undefined): string {
    return (email ?? "").trim().toLowerCase();
  }

  private canIssuePasswordReset(status: UserStatus): boolean {
    return status === UserStatus.ACTIVE || status === UserStatus.INVITED;
  }

  private generateResetToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private hashResetToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private shouldExposeResetPreview(): boolean {
    return process.env.NODE_ENV !== "production";
  }

  private resolvePrimaryTenantId(user: UserWithRelations): string | null {
    return (
      user.userRoles
        .map((assignment) => assignment.tenantId)
        .find((tenantId): tenantId is string => Boolean(tenantId)) ?? null
    );
  }

  private async validateCredentials(input: {
    email?: string;
    password?: string;
  }): Promise<UserWithRelations> {
    const email = this.normalizeEmail(input.email);
    const password = input.password?.trim();

    if (!email || !password) {
      throw new BadRequestException("Email and password are required.");
    }

    const user = await this.findUserByEmail(email);

    if (!user) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("User is not active.");
    }

    const passwordMatches = await this.matchesPassword(password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    return user;
  }

  private async matchesPassword(
    plainPassword: string,
    passwordHash: string,
  ): Promise<boolean> {
    try {
      return await compare(plainPassword, passwordHash);
    } catch {
      return false;
    }
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

  private async verifyRefreshToken(token: string): Promise<AuthTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<AuthTokenPayload>(token, {
        secret: this.refreshSecret,
      });

      if (payload.tokenType !== REFRESH_TOKEN_TYPE) {
        throw new UnauthorizedException("Invalid token type.");
      }

      return payload;
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token.");
    }
  }

  private async issueTokens(user: AuthenticatedUser): Promise<AuthResponse> {
    const sessionVersion = user.sessionVersion ?? 0;
    const basePayload: Omit<AuthTokenPayload, "tokenType"> = {
      sub: user.id,
      email: user.email,
      profile: user.profile,
      roles: user.roles,
      tenantIds: user.tenantIds,
      tenantId: user.activeTenantId,
      sessionVersion,
    };

    const accessToken = await this.signToken(basePayload, ACCESS_TOKEN_TYPE);
    const refreshToken = await this.signToken(basePayload, REFRESH_TOKEN_TYPE);

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      accessTokenExpiresIn: this.accessTtlLabel,
      refreshTokenExpiresIn: this.refreshTtlLabel,
      user,
    };
  }

  private signToken(
    payload: Omit<AuthTokenPayload, "tokenType">,
    tokenType: TokenType,
  ): Promise<string> {
    const signOptions =
      tokenType === ACCESS_TOKEN_TYPE
        ? {
            secret: this.accessSecret,
            expiresIn: this.accessTtlSeconds,
          }
        : {
            secret: this.refreshSecret,
            expiresIn: this.refreshTtlSeconds,
          };

    return this.jwtService.signAsync(
      {
        ...payload,
        tokenType,
      },
      signOptions,
    );
  }

  private async recordAuditLog(
    tx: AuthTransactionClient,
    input: {
      action: string;
      actorUserId: string | null;
      actorProfile: string;
      actorRoles: string[];
      tenantId: string | null;
      targetType: string;
      targetId: string;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        action: input.action,
        actorUserId: input.actorUserId,
        actorProfile: input.actorProfile,
        actorRoles: input.actorRoles,
        tenantId: input.tenantId,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata,
      },
    });
  }

  private get accessSecret(): string {
    const secret = this.configService.get<string>("auth.accessSecret");

    if (!secret?.trim()) {
      throw new Error("JWT access secret is not configured.");
    }

    return secret;
  }

  private get refreshSecret(): string {
    const secret = this.configService.get<string>("auth.refreshSecret");

    if (!secret?.trim()) {
      throw new Error("JWT refresh secret is not configured.");
    }

    return secret;
  }

  private get accessTtlLabel(): string {
    const ttl = this.configService.get<string>("auth.accessTtl");

    if (!ttl?.trim()) {
      throw new Error("JWT access TTL is not configured.");
    }

    return ttl;
  }

  private get refreshTtlLabel(): string {
    const ttl = this.configService.get<string>("auth.refreshTtl");

    if (!ttl?.trim()) {
      throw new Error("JWT refresh TTL is not configured.");
    }

    return ttl;
  }

  private get accessTtlSeconds(): number {
    return this.parseJwtTtlToSeconds(this.accessTtlLabel);
  }

  private get refreshTtlSeconds(): number {
    return this.parseJwtTtlToSeconds(this.refreshTtlLabel);
  }

  private parseJwtTtlToSeconds(value: string): number {
    const normalized = value.trim().toLowerCase();
    const match = /^(\d+)(s|m|h|d)$/.exec(normalized);

    if (!match) {
      throw new Error(`Invalid JWT TTL value: ${value}`);
    }

    const amount = Number.parseInt(match[1], 10);
    const unit = match[2];

    if (Number.isNaN(amount) || amount <= 0) {
      throw new Error(`Invalid JWT TTL value: ${value}`);
    }

    switch (unit) {
      case "s":
        return amount;
      case "m":
        return amount * 60;
      case "h":
        return amount * 3600;
      case "d":
        return amount * 86400;
      default:
        throw new Error(`Invalid JWT TTL value: ${value}`);
    }
  }
}
