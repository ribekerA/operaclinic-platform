import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, RoleCode, UserStatus } from "@prisma/client";
import { ProfessionalsService } from "../../src/modules/clinic-structure/professionals.service";

function buildProfessionalRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "professional-1",
    tenantId: "tenant-1",
    userId: null,
    fullName: "Dr. Carlos Demo",
    displayName: "Dr. Carlos",
    professionalRegister: "CRM-123",
    visibleForSelfBooking: false,
    isActive: true,
    createdAt: new Date("2026-03-15T12:00:00.000Z"),
    updatedAt: new Date("2026-03-15T12:00:00.000Z"),
    professionalSpecialties: [],
    professionalUnits: [],
    user: null,
    ...overrides,
  };
}

describe("ProfessionalsService", () => {
  const auditService = {
    record: vi.fn(),
  };

  const accessService = {
    resolveActiveTenantId: vi.fn(),
    ensureAdminAccess: vi.fn(),
  };

  const rolesService = {
    resolveRoleIdsByCodes: vi.fn(),
  };

  const prisma = {
    professional: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  beforeEach(() => {
    auditService.record.mockReset();
    accessService.resolveActiveTenantId.mockReset();
    accessService.ensureAdminAccess.mockReset();
    rolesService.resolveRoleIdsByCodes.mockReset();
    prisma.professional.findFirst.mockReset();
    prisma.$transaction.mockReset();
  });

  it("creates a professional already linked to a professional login", async () => {
    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");
    rolesService.resolveRoleIdsByCodes.mockResolvedValue(
      new Map([[RoleCode.PROFESSIONAL, "role-professional"]]),
    );

    const txMock = {
      specialty: {
        count: vi.fn().mockResolvedValue(0),
      },
      unit: {
        count: vi.fn().mockResolvedValue(0),
      },
      user: {
        create: vi.fn().mockResolvedValue({
          id: "user-1",
          email: "dr.carlos@clinica-demo.local",
          status: UserStatus.ACTIVE,
        }),
      },
      userRole: {
        create: vi.fn().mockResolvedValue({
          id: "user-role-1",
        }),
      },
      professional: {
        create: vi.fn().mockResolvedValue({
          id: "professional-1",
          visibleForSelfBooking: false,
        }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(
          buildProfessionalRecord({
            userId: "user-1",
            user: {
              id: "user-1",
              email: "dr.carlos@clinica-demo.local",
              fullName: "Dr. Carlos Demo",
              status: UserStatus.ACTIVE,
            },
          }),
        ),
      },
      professionalSpecialty: {
        createMany: vi.fn(),
      },
      professionalUnit: {
        createMany: vi.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: (tx: never) => unknown) =>
      callback(txMock as never),
    );

    const service = new ProfessionalsService(
      prisma as never,
      accessService as never,
      rolesService as never,
      auditService as never,
    );

    const result = await service.createProfessional(
      {
        id: "user-1",
        email: "admin@clinica-demo.local",
        profile: "clinic",
        roles: ["TENANT_ADMIN"],
        tenantIds: ["tenant-1"],
        activeTenantId: "tenant-1",
      },
      {
        fullName: "Dr. Carlos Demo",
        displayName: "Dr. Carlos",
        professionalRegister: "CRM-123",
        accessEmail: "dr.carlos@clinica-demo.local",
        accessPassword: "Demo@123",
      },
    );

    expect(txMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "dr.carlos@clinica-demo.local",
          fullName: "Dr. Carlos Demo",
          status: UserStatus.ACTIVE,
        }),
      }),
    );
    expect(txMock.userRole.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          roleId: "role-professional",
          tenantId: "tenant-1",
        }),
      }),
    );
    expect(txMock.professional.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          professionalRegister: "CRM-123",
        }),
      }),
    );
    expect(result.linkedUser?.email).toBe("dr.carlos@clinica-demo.local");
    expect(auditService.record).toHaveBeenCalledTimes(3);
  });

  it("requires login and password when creating a professional", async () => {
    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");
    rolesService.resolveRoleIdsByCodes.mockResolvedValue(
      new Map([[RoleCode.PROFESSIONAL, "role-professional"]]),
    );

    const service = new ProfessionalsService(
      prisma as never,
      accessService as never,
      rolesService as never,
      auditService as never,
    );

    await expect(
      service.createProfessional(
        {
          id: "user-1",
          email: "admin@clinica-demo.local",
          profile: "clinic",
          roles: ["TENANT_ADMIN"],
          tenantIds: ["tenant-1"],
          activeTenantId: "tenant-1",
        },
        {
          fullName: "Dr. Carlos Demo",
          displayName: "Dr. Carlos",
          professionalRegister: "CRM-123",
          accessEmail: "",
          accessPassword: "",
        },
      ),
    ).rejects.toThrow(
      "fullName, displayName, professionalRegister, accessEmail and accessPassword are required.",
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects duplicate login or register during professional creation", async () => {
    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");
    rolesService.resolveRoleIdsByCodes.mockResolvedValue(
      new Map([[RoleCode.PROFESSIONAL, "role-professional"]]),
    );

    const duplicateError = Object.create(
      Prisma.PrismaClientKnownRequestError.prototype,
    ) as Prisma.PrismaClientKnownRequestError;
    duplicateError.code = "P2002";

    prisma.$transaction.mockRejectedValue(duplicateError);

    const service = new ProfessionalsService(
      prisma as never,
      accessService as never,
      rolesService as never,
      auditService as never,
    );

    await expect(
      service.createProfessional(
        {
          id: "user-1",
          email: "admin@clinica-demo.local",
          profile: "clinic",
          roles: ["TENANT_ADMIN"],
          tenantIds: ["tenant-1"],
          activeTenantId: "tenant-1",
        },
        {
          fullName: "Dr. Carlos Demo",
          displayName: "Dr. Carlos",
          professionalRegister: "CRM-123",
          accessEmail: "dr.carlos@clinica-demo.local",
          accessPassword: "Demo@123",
        },
      ),
    ).rejects.toThrow("Professional register or login already exists.");
  });
});
