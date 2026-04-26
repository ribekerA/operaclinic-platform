import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreateMessagingIntegrationConnectionResponsePayload,
  MessagingIntegrationConnectionPayload,
} from "@operaclinic/shared";
import { createHash, randomBytes } from "crypto";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  MessagingChannel,
  Prisma,
} from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { CreateIntegrationConnectionDto } from "./dto/create-integration-connection.dto";
import { MessagingAccessService } from "./messaging-access.service";

type ConnectionWithTenant = Prisma.IntegrationConnectionGetPayload<{
  include: {
    tenant: {
      select: {
        id: true;
      };
    };
  };
}>;

@Injectable()
export class IntegrationConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: MessagingAccessService,
    private readonly auditService: AuditService,
  ) {}

  async listConnections(
    actor: AuthenticatedUser,
  ): Promise<MessagingIntegrationConnectionPayload[]> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const connections = await this.prisma.integrationConnection.findMany({
      where: {
        tenantId,
      },
      orderBy: { createdAt: "desc" },
    });

    return connections.map((connection) => this.mapConnection(connection));
  }

  async createConnection(
    actor: AuthenticatedUser,
    input: CreateIntegrationConnectionDto,
  ): Promise<CreateMessagingIntegrationConnectionResponsePayload> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const channel = input.channel ?? MessagingChannel.WHATSAPP;
    const verifyToken = input.webhookVerifyToken?.trim() || this.generateVerifyToken();

    const existingConnection = await this.prisma.integrationConnection.findFirst({
      where: {
        tenantId,
        channel,
      },
      select: {
        id: true,
        displayName: true,
        status: true,
      },
    });

    if (existingConnection) {
      throw new ConflictException(
        `This clinic already has a WhatsApp connection configured (${existingConnection.displayName}). Update the existing connection instead of creating a new one.`,
      );
    }

    if (verifyToken.length < 24) {
      throw new BadRequestException(
        "webhookVerifyToken must have at least 24 characters.",
      );
    }

    const normalizedPhoneNumber = input.phoneNumber
      ? this.normalizePhoneNumber(input.phoneNumber)
      : null;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const connection = await tx.integrationConnection.create({
          data: {
            tenantId,
            channel,
            provider: input.provider,
            status: IntegrationConnectionStatus.ACTIVE,
            displayName: input.displayName.trim(),
            phoneNumber: input.phoneNumber?.trim() || null,
            normalizedPhoneNumber,
            externalAccountId: input.externalAccountId?.trim() || null,
            webhookVerifyTokenHash: this.hashVerifyToken(verifyToken),
            config: input.config
              ? (input.config as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.MESSAGING_INTEGRATION_CREATED,
            actor,
            tenantId,
            targetType: "integration_connection",
            targetId: connection.id,
            metadata: {
              provider: connection.provider,
              channel: connection.channel,
            },
          },
          tx,
        );

        return connection;
      });

      return {
        connection: this.mapConnection(created),
        webhook: {
          path: "/api/v1/webhooks/whatsapp",
          verifyToken,
        },
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "This clinic already has a WhatsApp connection configured or the provider account is already in use.",
        );
      }

      throw error;
    }
  }

  async findConnectionForTenantOrThrow(
    tenantId: string,
    connectionId: string,
  ): Promise<ConnectionWithTenant> {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        id: connectionId,
        tenantId,
      },
      include: {
        tenant: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException("Messaging integration connection not found.");
    }

    return connection;
  }

  async resolveConnectionForWebhook(
    input: {
      connectionId?: string;
      providerAccountId?: string;
      verifyToken?: string;
    },
  ): Promise<ConnectionWithTenant> {
    if (input.connectionId) {
      const connection = await this.prisma.integrationConnection.findUnique({
        where: {
          id: input.connectionId,
        },
        include: {
          tenant: {
            select: {
              id: true,
            },
          },
        },
      });

      if (connection) {
        return this.ensureConnectionIsActive(connection);
      }
    }

    if (input.providerAccountId) {
      const connection = await this.prisma.integrationConnection.findFirst({
        where: {
          channel: MessagingChannel.WHATSAPP,
          externalAccountId: input.providerAccountId,
        },
        include: {
          tenant: {
            select: {
              id: true,
            },
          },
        },
      });

      if (connection) {
        return this.ensureConnectionIsActive(connection);
      }
    }

    if (input.verifyToken) {
      const connection = await this.prisma.integrationConnection.findFirst({
        where: {
          channel: MessagingChannel.WHATSAPP,
          webhookVerifyTokenHash: this.hashVerifyToken(input.verifyToken),
        },
        include: {
          tenant: {
            select: {
              id: true,
            },
          },
        },
      });

      if (connection) {
        return this.ensureConnectionIsActive(connection);
      }
    }

    throw new NotFoundException("Matching WhatsApp integration connection not found.");
  }

  private ensureConnectionIsActive(
    connection: ConnectionWithTenant,
  ): ConnectionWithTenant {
    if (connection.status !== IntegrationConnectionStatus.ACTIVE) {
      throw new BadRequestException("Messaging integration connection is inactive.");
    }

    return connection;
  }

  private generateVerifyToken(): string {
    return randomBytes(24).toString("hex");
  }

  private hashVerifyToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private normalizePhoneNumber(rawPhoneNumber: string): string {
    const normalized = rawPhoneNumber.replace(/\D/g, "");

    if (normalized.length < 8 || normalized.length > 20) {
      throw new BadRequestException("phoneNumber is invalid.");
    }

    return normalized;
  }

  private mapConnection(
    connection: {
      id: string;
      tenantId: string;
      channel: MessagingChannel;
      provider: IntegrationProvider;
      status: IntegrationConnectionStatus;
      displayName: string;
      phoneNumber: string | null;
      normalizedPhoneNumber: string | null;
      externalAccountId: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
  ): MessagingIntegrationConnectionPayload {
    return {
      id: connection.id,
      tenantId: connection.tenantId,
      channel: connection.channel,
      provider: connection.provider,
      status: connection.status,
      displayName: connection.displayName,
      phoneNumber: connection.phoneNumber,
      normalizedPhoneNumber: connection.normalizedPhoneNumber,
      externalAccountId: connection.externalAccountId,
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    };
  }
}
