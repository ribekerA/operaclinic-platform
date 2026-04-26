import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoleCode, TenantStatus, UserStatus } from "@prisma/client";
import { UsersService } from "../../src/modules/identity/users.service";
import { buildClinicActor } from "../helpers/actors";

function buildUserRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "user@clinic.local",
    fullName: "User Demo",
    passwordHash: "hash",
    status: UserStatus.ACTIVE,
    sessionVersion: 0,
    createdAt: new Date("2026-03-15T12:00:00.000Z"),
    updatedAt: new Date("2026-03-15T12:00:00.000Z"),
    professionalProfile: null,
    userRoles: [
      {
        tenantId: "tenant-1",
        role: {
          code: RoleCode.RECEPTION,
        },
      },
    ],
    ...overrides,
  };
}

describe("UsersService", () => {
  const prisma = {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    professional: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const rolesService = {
    ensureClinicRoleCodes: vi.fn(),
    resolveRoleIdsByCodes: vi.fn(),
    getClinicRoleCodes: vi.fn(),
  };
  const auditService = {
    record: vi.fn(),
  };

  beforeEach(() => {
    prisma.user.findMany.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.tenant.findUnique.mockReset();
    prisma.professional.findFirst.mockReset();
    prisma.$transaction.mockReset();
    rolesService.ensureClinicRoleCodes.mockReset();
    rolesService.resolveRoleIdsByCodes.mockReset();
    rolesService.getClinicRoleCodes.mockReset();
    auditService.record.mockReset();
  });

  it("creates a clinic user already linked to a legacy professional", async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: "tenant-1",
      status: TenantStatus.ACTIVE,
    });
    rolesService.ensureClinicRoleCodes.mockReturnValue([RoleCode.PROFESSIONAL]);
    rolesService.resolveRoleIdsByCodes.mockResolvedValue(
      new Map([[RoleCode.PROFESSIONAL, "role-professional"]]),
    );

    const txMock = {
      user: {
        create: vi.fn().mockResolvedValue({
          id: "user-99",
          email: "doctor@clinic.local",
          status: UserStatus.ACTIVE,
        }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(
          buildUserRecord({
            id: "user-99",
            email: "doctor@clinic.local",
            fullName: "Doctor Demo",
            professionalProfile: {
              id: "professional-1",
              fullName: "Doctor Demo",
              displayName: "Dr. Demo",
              professionalRegister: "CRM-123",
              isActive: true,
              tenantId: "tenant-1",
            },
            userRoles: [
              {
                tenantId: "tenant-1",
                role: {
                  code: RoleCode.PROFESSIONAL,
                },
              },
            ],
          }),
        ),
      },
      userRole: {
        createMany: vi.fn(),
      },
      professional: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: "professional-1",
            userId: null,
          }),
        update: vi.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: (tx: never) => unknown) =>
      callback(txMock as never),
    );

    const service = new UsersService(
      prisma as never,
      rolesService as never,
      auditService as never,
    );

    const result = await service.createUser(buildClinicActor(), {
      email: "doctor@clinic.local",
      fullName: "Doctor Demo",
      password: "Demo1234",
      roleCodes: [RoleCode.PROFESSIONAL],
      linkedProfessionalId: "professional-1",
    });

    expect(txMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "doctor@clinic.local",
          fullName: "Doctor Demo",
          status: UserStatus.ACTIVE,
        }),
      }),
    );
    expect(txMock.userRole.createMany).toHaveBeenCalled();
    expect(txMock.professional.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "professional-1" },
        data: { userId: "user-99" },
      }),
    );
    expect(result.linkedProfessional?.id).toBe("professional-1");
    expect(result.requiresProfessionalLink).toBe(false);
  });

  it("links an existing user to a legacy professional and invalidates sessions", async () => {
    prisma.user.findUnique.mockResolvedValue(
      buildUserRecord({
        id: "user-2",
        userRoles: [
          {
            tenantId: "tenant-1",
            role: {
              code: RoleCode.PROFESSIONAL,
            },
          },
        ],
      }),
    );

    const txMock = {
      user: {
        update: vi.fn(),
        findUniqueOrThrow: vi.fn().mockResolvedValue(
          buildUserRecord({
            id: "user-2",
            professionalProfile: {
              id: "professional-legacy",
              fullName: "Doctor Legacy",
              displayName: "Dr. Legacy",
              professionalRegister: "CRM-999",
              isActive: true,
              tenantId: "tenant-1",
            },
            userRoles: [
              {
                tenantId: "tenant-1",
                role: {
                  code: RoleCode.PROFESSIONAL,
                },
              },
            ],
          }),
        ),
      },
      professional: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: "professional-legacy",
            userId: null,
          }),
        update: vi.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: (tx: never) => unknown) =>
      callback(txMock as never),
    );

    const service = new UsersService(
      prisma as never,
      rolesService as never,
      auditService as never,
    );

    const result = await service.updateUser(buildClinicActor(), "user-2", {
      linkedProfessionalId: "professional-legacy",
    });

    expect(txMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-2" },
        data: expect.objectContaining({
          sessionVersion: {
            increment: 1,
          },
        }),
      }),
    );
    expect(txMock.professional.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "professional-legacy" },
        data: { userId: "user-2" },
      }),
    );
    expect(result.linkedProfessional?.displayName).toBe("Dr. Legacy");
  });

  it("deactivates and reactivates a clinic user with session invalidation", async () => {
    prisma.user.findUnique.mockResolvedValue(buildUserRecord({
      id: "user-3",
    }));

    const txMock = {
      user: {
        update: vi
          .fn()
          .mockResolvedValueOnce(
            buildUserRecord({
              id: "user-3",
              status: UserStatus.INACTIVE,
            }),
          )
          .mockResolvedValueOnce(
            buildUserRecord({
              id: "user-3",
              status: UserStatus.ACTIVE,
            }),
          ),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: (tx: never) => unknown) =>
      callback(txMock as never),
    );

    const service = new UsersService(
      prisma as never,
      rolesService as never,
      auditService as never,
    );

    const deactivated = await service.deactivateUser(buildClinicActor(), "user-3");
    const reactivated = await service.reactivateUser(buildClinicActor(), "user-3");

    expect(deactivated.status).toBe(UserStatus.INACTIVE);
    expect(reactivated.status).toBe(UserStatus.ACTIVE);
    expect(txMock.user.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          status: UserStatus.INACTIVE,
          sessionVersion: {
            increment: 1,
          },
        }),
      }),
    );
    expect(txMock.user.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          status: UserStatus.ACTIVE,
          sessionVersion: {
            increment: 1,
          },
        }),
      }),
    );
  });

  it("rejects removing the professional role while a professional profile is still linked", async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: "tenant-1",
      status: TenantStatus.ACTIVE,
    });
    prisma.user.findUnique.mockResolvedValue(
      buildUserRecord({
        id: "user-4",
        professionalProfile: {
          id: "professional-1",
          fullName: "Doctor Demo",
          displayName: "Dr. Demo",
          professionalRegister: "CRM-123",
          isActive: true,
          tenantId: "tenant-1",
        },
        userRoles: [
          {
            tenantId: "tenant-1",
            role: {
              code: RoleCode.PROFESSIONAL,
            },
          },
        ],
      }),
    );
    rolesService.ensureClinicRoleCodes.mockReturnValue([]);

    const service = new UsersService(
      prisma as never,
      rolesService as never,
      auditService as never,
    );

    await expect(
      service.updateUserRoles(buildClinicActor(), "user-4", {
        tenantId: "tenant-1",
        roleCodes: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("prevents a clinic admin from deactivating their own user", async () => {
    const service = new UsersService(
      prisma as never,
      rolesService as never,
      auditService as never,
    );

    await expect(
      service.deactivateUser(buildClinicActor(), "user-clinic-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
