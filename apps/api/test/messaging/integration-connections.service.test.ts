import { ConflictException } from "@nestjs/common";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  MessagingChannel,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationConnectionsService } from "../../src/modules/messaging/integration-connections.service";

describe("IntegrationConnectionsService", () => {
  const prisma = {
    integrationConnection: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const accessService = {
    resolveActiveTenantId: vi.fn(),
  };

  const auditService = {
    record: vi.fn(),
  };

  beforeEach(() => {
    prisma.integrationConnection.findFirst.mockReset();
    prisma.$transaction.mockReset();
    accessService.resolveActiveTenantId.mockReset();
    auditService.record.mockReset();

    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");
  });

  it("blocks a second WhatsApp connection for the same clinic", async () => {
    prisma.integrationConnection.findFirst.mockResolvedValue({
      id: "connection-1",
      displayName: "Meta principal",
      status: IntegrationConnectionStatus.ACTIVE,
    });

    const service = new IntegrationConnectionsService(
      prisma as never,
      accessService as never,
      auditService as never,
    );

    await expect(
      service.createConnection(
        {
          id: "user-1",
          activeTenantId: "tenant-1",
        } as never,
        {
          provider: IntegrationProvider.WHATSAPP_META,
          channel: MessagingChannel.WHATSAPP,
          displayName: "Segundo numero",
          phoneNumber: "+5511998888777",
          externalAccountId: "meta-phone-id-2",
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.integrationConnection.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        channel: MessagingChannel.WHATSAPP,
      },
      select: {
        id: true,
        displayName: true,
        status: true,
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates the first WhatsApp connection for the clinic", async () => {
    prisma.integrationConnection.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        integrationConnection: {
          create: vi.fn().mockResolvedValue({
            id: "connection-1",
            tenantId: "tenant-1",
            channel: MessagingChannel.WHATSAPP,
            provider: IntegrationProvider.WHATSAPP_META,
            status: IntegrationConnectionStatus.ACTIVE,
            displayName: "Meta principal",
            phoneNumber: "+5511999999999",
            normalizedPhoneNumber: "5511999999999",
            externalAccountId: "meta-phone-id-1",
            createdAt: new Date("2026-04-26T10:30:00.000Z"),
            updatedAt: new Date("2026-04-26T10:30:00.000Z"),
          }),
        },
      }),
    );

    const service = new IntegrationConnectionsService(
      prisma as never,
      accessService as never,
      auditService as never,
    );

    const result = await service.createConnection(
      {
        id: "user-1",
        activeTenantId: "tenant-1",
      } as never,
      {
        provider: IntegrationProvider.WHATSAPP_META,
        channel: MessagingChannel.WHATSAPP,
        displayName: "Meta principal",
        phoneNumber: "+5511999999999",
        externalAccountId: "meta-phone-id-1",
      },
    );

    expect(result.connection.tenantId).toBe("tenant-1");
    expect(result.connection.channel).toBe(MessagingChannel.WHATSAPP);
    expect(result.connection.externalAccountId).toBe("meta-phone-id-1");
    expect(auditService.record).toHaveBeenCalled();
  });
});
