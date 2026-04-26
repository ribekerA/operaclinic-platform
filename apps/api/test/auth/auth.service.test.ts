import { hash } from "bcryptjs";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { RoleCode, TenantStatus, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../../src/auth/auth.service";

function buildAuthUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "reception@clinic.local",
    fullName: "Reception User",
    passwordHash: "hash",
    status: UserStatus.ACTIVE,
    sessionVersion: 0,
    passwordResetTokenHash: null,
    passwordResetExpiresAt: null,
    professionalProfile: null,
    userRoles: [
      {
        tenantId: "tenant-1",
        role: {
          code: RoleCode.RECEPTION,
        },
        tenant: {
          id: "tenant-1",
          slug: "clinic-demo",
          name: "Clinic Demo",
          status: TenantStatus.ACTIVE,
        },
      },
    ],
    ...overrides,
  };
}

describe("AuthService", () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const jwtService = {
    signAsync: vi.fn(),
    verifyAsync: vi.fn(),
  };
  const configService = {
    get: vi.fn(),
  };

  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.user.findFirst.mockReset();
    prisma.$transaction.mockReset();
    jwtService.signAsync.mockReset();
    jwtService.verifyAsync.mockReset();
    configService.get.mockImplementation((key: string, fallback?: string) => {
      const values: Record<string, string> = {
        "auth.accessSecret": "access-secret",
        "auth.refreshSecret": "refresh-secret",
        "auth.accessTtl": "15m",
        "auth.refreshTtl": "7d",
      };

      return values[key] ?? fallback;
    });
    jwtService.signAsync.mockImplementation(
      async (payload: { tokenType: string; sub: string }) =>
        `${payload.tokenType}-${payload.sub}`,
    );
  });

  it("logs in a clinic user with tenant context and role list", async () => {
    const passwordHash = await hash("strong-password", 4);

    prisma.user.findUnique.mockResolvedValue(
      buildAuthUser({
        passwordHash,
        userRoles: [
          {
            tenantId: "tenant-1",
            role: {
              code: RoleCode.TENANT_ADMIN,
            },
            tenant: {
              id: "tenant-1",
              slug: "clinic-demo",
              name: "Clinic Demo",
              status: TenantStatus.ACTIVE,
            },
          },
        ],
      }),
    );

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );

    const result = await service.login({
      email: "  reception@clinic.local ",
      password: "strong-password",
      tenantId: undefined,
    });

    expect(result.accessToken).toBe("access-user-1");
    expect(result.refreshToken).toBe("refresh-user-1");
    expect(result.user.profile).toBe("clinic");
    expect(result.user.roles).toEqual([RoleCode.TENANT_ADMIN]);
    expect(result.user.activeTenantId).toBe("tenant-1");
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: "reception@clinic.local",
        },
      }),
    );
  });

  it("refreshes an authenticated session preserving tenant context", async () => {
    const passwordHash = await hash("another-password", 4);

    jwtService.verifyAsync.mockResolvedValue({
      sub: "user-2",
      tokenType: "refresh",
      tenantId: "tenant-9",
      sessionVersion: 2,
    });
    prisma.user.findUnique.mockResolvedValue(
      buildAuthUser({
        id: "user-2",
        email: "manager@clinic.local",
        fullName: "Clinic Manager",
        passwordHash,
        sessionVersion: 2,
        userRoles: [
          {
            tenantId: "tenant-9",
            role: {
              code: RoleCode.CLINIC_MANAGER,
            },
            tenant: {
              id: "tenant-9",
              slug: "clinic-nine",
              name: "Clinic Nine",
              status: TenantStatus.ACTIVE,
            },
          },
        ],
      }),
    );

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );

    const result = await service.refresh({
      refreshToken: "refresh-token",
    });

    expect(jwtService.verifyAsync).toHaveBeenCalledWith("refresh-token", {
      secret: "refresh-secret",
    });
    expect(result.user.activeTenantId).toBe("tenant-9");
    expect(result.user.roles).toEqual([RoleCode.CLINIC_MANAGER]);
    expect(result.accessToken).toBe("access-user-2");
  });

  it("returns the authenticated user context for auth/me", async () => {
    const passwordHash = await hash("current-password", 4);

    prisma.user.findUnique.mockResolvedValue(
      buildAuthUser({
        id: "user-3",
        email: "doctor@clinic.local",
        fullName: "Doctor User",
        passwordHash,
        sessionVersion: 4,
        professionalProfile: {
          id: "professional-1",
        },
        userRoles: [
          {
            tenantId: "tenant-4",
            role: {
              code: RoleCode.PROFESSIONAL,
            },
            tenant: {
              id: "tenant-4",
              slug: "clinic-four",
              name: "Clinic Four",
              status: TenantStatus.ACTIVE,
            },
          },
        ],
      }),
    );

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );

    const result = await service.getMe({
      id: "user-3",
      email: "doctor@clinic.local",
      fullName: "Doctor User",
      status: UserStatus.ACTIVE,
      profile: "clinic",
      roles: [RoleCode.PROFESSIONAL],
      tenantIds: ["tenant-4"],
      activeTenantId: "tenant-4",
      sessionVersion: 4,
    });

    expect(result.id).toBe("user-3");
    expect(result.roles).toEqual([RoleCode.PROFESSIONAL]);
    expect(result.activeTenantId).toBe("tenant-4");
    expect(result.linkedProfessionalId).toBe("professional-1");
  });

  it("resolves the clinic tenant options for a multi-tenant clinic user", async () => {
    const passwordHash = await hash("strong-password", 4);

    prisma.user.findUnique.mockResolvedValue(
      buildAuthUser({
        id: "user-10",
        passwordHash,
        userRoles: [
          {
            tenantId: "tenant-b",
            role: {
              code: RoleCode.RECEPTION,
            },
            tenant: {
              id: "tenant-b",
              slug: "clinic-b",
              name: "Clinic B",
              status: TenantStatus.ACTIVE,
            },
          },
          {
            tenantId: "tenant-a",
            role: {
              code: RoleCode.RECEPTION,
            },
            tenant: {
              id: "tenant-a",
              slug: "clinic-a",
              name: "Clinic A",
              status: TenantStatus.ACTIVE,
            },
          },
        ],
      }),
    );

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );

    const result = await service.resolveClinicTenants({
      email: "reception@clinic.local",
      password: "strong-password",
    });

    expect(result.tenants).toEqual([
      {
        id: "tenant-a",
        slug: "clinic-a",
        name: "Clinic A",
      },
      {
        id: "tenant-b",
        slug: "clinic-b",
        name: "Clinic B",
      },
    ]);
  });

  it("rejects clinic login when requested tenant is not assigned to the user", async () => {
    const passwordHash = await hash("strong-password", 4);

    prisma.user.findUnique.mockResolvedValue(
      buildAuthUser({
        passwordHash,
      }),
    );

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );

    await expect(
      service.login({
        email: "reception@clinic.local",
        password: "strong-password",
        tenantId: "tenant-2",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("requires tenant selection for clinic users assigned to multiple tenants", async () => {
    const passwordHash = await hash("strong-password", 4);

    prisma.user.findUnique.mockResolvedValue(
      buildAuthUser({
        passwordHash,
        userRoles: [
          {
            tenantId: "tenant-1",
            role: {
              code: RoleCode.RECEPTION,
            },
            tenant: {
              id: "tenant-1",
              slug: "clinic-one",
              name: "Clinic One",
              status: TenantStatus.ACTIVE,
            },
          },
          {
            tenantId: "tenant-2",
            role: {
              code: RoleCode.RECEPTION,
            },
            tenant: {
              id: "tenant-2",
              slug: "clinic-two",
              name: "Clinic Two",
              status: TenantStatus.ACTIVE,
            },
          },
        ],
      }),
    );

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );

    await expect(
      service.login({
        email: "reception@clinic.local",
        password: "strong-password",
        tenantId: undefined,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("scopes clinic roles to the selected tenant context", async () => {
    const passwordHash = await hash("strong-password", 4);

    prisma.user.findUnique.mockResolvedValue(
      buildAuthUser({
        id: "user-12",
        passwordHash,
        userRoles: [
          {
            tenantId: "tenant-a",
            role: {
              code: RoleCode.RECEPTION,
            },
            tenant: {
              id: "tenant-a",
              slug: "clinic-a",
              name: "Clinic A",
              status: TenantStatus.ACTIVE,
            },
          },
          {
            tenantId: "tenant-b",
            role: {
              code: RoleCode.TENANT_ADMIN,
            },
            tenant: {
              id: "tenant-b",
              slug: "clinic-b",
              name: "Clinic B",
              status: TenantStatus.ACTIVE,
            },
          },
        ],
      }),
    );

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );

    const result = await service.login({
      email: "reception@clinic.local",
      password: "strong-password",
      tenantId: "tenant-a",
    });

    expect(result.user.activeTenantId).toBe("tenant-a");
    expect(result.user.roles).toEqual([RoleCode.RECEPTION]);
    expect(result.user.availableClinics).toEqual([
      {
        id: "tenant-a",
        slug: "clinic-a",
        name: "Clinic A",
      },
      {
        id: "tenant-b",
        slug: "clinic-b",
        name: "Clinic B",
      },
    ]);
    expect(result.user.activeClinic).toEqual({
      id: "tenant-a",
      slug: "clinic-a",
      name: "Clinic A",
    });
  });

  it("returns a local preview when password reset is requested outside production", async () => {
    prisma.user.findUnique.mockResolvedValue(
      buildAuthUser({
        email: "admin@clinic.local",
      }),
    );

    const txMock = {
      user: {
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: (tx: never) => unknown) =>
      callback(txMock as never),
    );

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );

    const response = await service.requestPasswordReset({
      email: "admin@clinic.local",
    });

    expect(response.accepted).toBe(true);
    expect(response.resetTokenPreview).toBeTruthy();
    expect(response.resetUrlPreview).toContain("/clinic/reset-password?token=");
    expect(txMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordResetTokenHash: expect.any(String),
          passwordResetExpiresAt: expect.any(Date),
        }),
      }),
    );
  });

  it("resets the password by token, activates invited users and invalidates sessions", async () => {
    const invitedUser = buildAuthUser({
      id: "user-reset-1",
      status: UserStatus.INVITED,
      sessionVersion: 5,
      passwordResetTokenHash: "hash-value",
      passwordResetExpiresAt: new Date(Date.now() + 60_000),
    });

    prisma.user.findFirst.mockResolvedValue(invitedUser);

    const txMock = {
      user: {
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: (tx: never) => unknown) =>
      callback(txMock as never),
    );

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );

    const response = await service.resetPassword({
      token: "token-preview",
      newPassword: "NewDemo123",
    });

    expect(response.success).toBe(true);
    expect(response.requiresReauthentication).toBe(true);
    expect(txMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-reset-1" },
        data: expect.objectContaining({
          status: UserStatus.ACTIVE,
          passwordHash: expect.any(String),
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          sessionVersion: {
            increment: 1,
          },
        }),
      }),
    );
  });

  it("changes the current password and forces reauthentication", async () => {
    const currentHash = await hash("Current123", 4);

    prisma.user.findUnique.mockResolvedValue(
      buildAuthUser({
        id: "user-change-1",
        email: "manager@clinic.local",
        passwordHash: currentHash,
        sessionVersion: 3,
      }),
    );

    const txMock = {
      user: {
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: (tx: never) => unknown) =>
      callback(txMock as never),
    );

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );

    const response = await service.changePassword(
      {
        id: "user-change-1",
        email: "manager@clinic.local",
        profile: "clinic",
        roles: [RoleCode.CLINIC_MANAGER],
        tenantIds: ["tenant-1"],
        activeTenantId: "tenant-1",
      },
      {
        currentPassword: "Current123",
        newPassword: "Updated123",
      },
    );

    expect(response.success).toBe(true);
    expect(response.requiresReauthentication).toBe(true);
    expect(txMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-change-1" },
        data: expect.objectContaining({
          passwordHash: expect.any(String),
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          sessionVersion: {
            increment: 1,
          },
        }),
      }),
    );
  });

  it("switches the clinic context without changing credentials", async () => {
    prisma.user.findUnique.mockResolvedValue(
      buildAuthUser({
        id: "user-switch-1",
        sessionVersion: 7,
        userRoles: [
          {
            tenantId: "tenant-a",
            role: {
              code: RoleCode.RECEPTION,
            },
            tenant: {
              id: "tenant-a",
              slug: "clinic-a",
              name: "Clinic A",
              status: TenantStatus.ACTIVE,
            },
          },
          {
            tenantId: "tenant-b",
            role: {
              code: RoleCode.CLINIC_MANAGER,
            },
            tenant: {
              id: "tenant-b",
              slug: "clinic-b",
              name: "Clinic B",
              status: TenantStatus.ACTIVE,
            },
          },
        ],
      }),
    );

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );

    const result = await service.switchClinic(
      {
        id: "user-switch-1",
        email: "reception@clinic.local",
        profile: "clinic",
        roles: [RoleCode.RECEPTION],
        tenantIds: ["tenant-a", "tenant-b"],
        activeTenantId: "tenant-a",
        sessionVersion: 7,
      },
      {
        tenantId: "tenant-b",
      },
    );

    expect(result.user.activeTenantId).toBe("tenant-b");
    expect(result.user.roles).toEqual([RoleCode.CLINIC_MANAGER]);
    expect(result.accessToken).toBe("access-user-switch-1");
    expect(result.refreshToken).toBe("refresh-user-switch-1");
  });

  it("rejects clinic switching when the target tenant is not assigned", async () => {
    prisma.user.findUnique.mockResolvedValue(buildAuthUser());

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );

    await expect(
      service.switchClinic(
        {
          id: "user-1",
          email: "reception@clinic.local",
          profile: "clinic",
          roles: [RoleCode.RECEPTION],
          tenantIds: ["tenant-1"],
          activeTenantId: "tenant-1",
          sessionVersion: 0,
        },
        {
          tenantId: "tenant-9",
        },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects refresh when the token session version is stale", async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: "user-20",
      tokenType: "refresh",
      tenantId: "tenant-1",
      sessionVersion: 2,
    });

    prisma.user.findUnique.mockResolvedValue(
      buildAuthUser({
        id: "user-20",
        sessionVersion: 3,
      }),
    );

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );

    await expect(
      service.refresh({
        refreshToken: "refresh-token",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
