import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SkillActorResolverService } from "../../src/modules/skill-registry/skill-actor-resolver.service";

describe("SkillActorResolverService", () => {
  const prisma = {
    user: {
      findFirst: vi.fn(),
    },
  };

  beforeEach(() => {
    prisma.user.findFirst.mockReset();
  });

  it("builds a clinic actor only when the user belongs to the tenant with an allowed role", async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      email: "recepcao@tenant.local",
      fullName: "Recepcao Aurora",
      status: "ACTIVE",
      professionalProfile: null,
      userRoles: [
        {
          role: {
            code: "RECEPTION",
          },
        },
      ],
    });

    const resolver = new SkillActorResolverService(prisma as never);

    await expect(
      resolver.resolve(
        {
          tenantId: "tenant-1",
          actorUserId: "user-1",
          source: "MESSAGING",
          threadId: "thread-1",
        },
        ["RECEPTION", "CLINIC_MANAGER"],
      ),
    ).resolves.toEqual({
      id: "user-1",
      email: "recepcao@tenant.local",
      fullName: "Recepcao Aurora",
      status: "ACTIVE",
      profile: "clinic",
      roles: ["RECEPTION"],
      tenantIds: ["tenant-1"],
      activeTenantId: "tenant-1",
      linkedProfessionalId: null,
    });
  });

  it("rejects missing tenant context before touching the registry", async () => {
    const resolver = new SkillActorResolverService(prisma as never);

    await expect(
      resolver.resolve(
        {
          tenantId: "",
          actorUserId: "user-1",
          source: "MESSAGING",
        },
        ["RECEPTION"],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects users that do not have an allowed role in the tenant", async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      email: "profissional@tenant.local",
      fullName: "Profissional Aurora",
      status: "ACTIVE",
      professionalProfile: null,
      userRoles: [
        {
          role: {
            code: "PROFESSIONAL",
          },
        },
      ],
    });

    const resolver = new SkillActorResolverService(prisma as never);

    await expect(
      resolver.resolve(
        {
          tenantId: "tenant-1",
          actorUserId: "user-1",
          source: "AGENT",
        },
        ["RECEPTION", "CLINIC_MANAGER"],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("CRITICAL: prevents tenant mismatch - rejects when user belongs to different tenant", async () => {
    // User belongs to tenant-2 but tries to execute skill for tenant-1
    prisma.user.findFirst.mockResolvedValue(null);

    const resolver = new SkillActorResolverService(prisma as never);

    await expect(
      resolver.resolve(
        {
          tenantId: "tenant-1", // Agent context wants tenant-1
          actorUserId: "user-from-tenant-2", // But user only belongs to tenant-2
          source: "MESSAGING",
          threadId: "thread-1",
        },
        ["RECEPTION", "CLINIC_MANAGER"],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Verify that Prisma was called with correct conditions
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "user-from-tenant-2",
          userRoles: {
            some: {
              tenantId: "tenant-1", // Must explicitly validate tenant match
            },
          },
        }),
      }),
    );
  });
});
