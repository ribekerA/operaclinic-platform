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
import { ConfigService } from "@nestjs/config";
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
    private readonly configService: ConfigService,
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

  async completeEmbeddedSignup(
    actor: AuthenticatedUser,
    code: string,
  ): Promise<CreateMessagingIntegrationConnectionResponsePayload> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const appId = this.configService.get<string>("messaging.metaAppId", "");
    const appSecret = this.configService.get<string>("messaging.metaAppSecret", "");
    const apiBase = this.configService.get<string>(
      "messaging.metaApiBaseUrl",
      "https://graph.facebook.com",
    );
    const apiVersion = this.configService.get<string>("messaging.metaApiVersion", "v21.0");

    if (!appId || !appSecret) {
      throw new BadRequestException(
        "Meta App ID and App Secret must be configured before using Embedded Signup.",
      );
    }

    // 1. Exchange the short-lived code for a user access token
    const tokenUrl =
      `${apiBase}/${apiVersion}/oauth/access_token` +
      `?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`;

    const tokenRes = await fetch(tokenUrl);
    const tokenData = (await tokenRes.json()) as Record<string, unknown>;

    if (!tokenRes.ok || typeof tokenData.access_token !== "string") {
      throw new BadRequestException(
        `Meta token exchange failed: ${String(tokenData.error_description ?? tokenData.error ?? "unknown error")}`,
      );
    }

    const userAccessToken = tokenData.access_token;

    // 2. Resolve WABA → phone number (takes the first available)
    const { wabaId, phoneNumberId, displayPhone, verifiedName } =
      await this.resolveFirstWabaPhoneNumber(userAccessToken, apiBase, apiVersion);

    // 3. Create the integration connection
    const verifyToken = this.generateVerifyToken();
    const normalizedPhoneNumber = displayPhone
      ? this.normalizePhoneNumber(displayPhone)
      : null;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const connection = await tx.integrationConnection.create({
          data: {
            tenantId,
            channel: MessagingChannel.WHATSAPP,
            provider: IntegrationProvider.WHATSAPP_META,
            status: IntegrationConnectionStatus.ACTIVE,
            displayName: verifiedName || displayPhone || "WhatsApp Business",
            phoneNumber: displayPhone || null,
            normalizedPhoneNumber,
            externalAccountId: phoneNumberId,
            webhookVerifyTokenHash: this.hashVerifyToken(verifyToken),
            config: {
              accessToken: userAccessToken,
              wabaId,
              phoneNumberId,
              apiVersion,
              apiBaseUrl: apiBase,
            } as Prisma.InputJsonValue,
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
              source: "embedded_signup",
              wabaId,
              phoneNumberId,
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
          "This clinic already has a WhatsApp connection or this phone number is already in use.",
        );
      }
      throw error;
    }
  }

  private async resolveFirstWabaPhoneNumber(
    userAccessToken: string,
    apiBase: string,
    apiVersion: string,
  ): Promise<{
    wabaId: string;
    phoneNumberId: string;
    displayPhone: string;
    verifiedName: string;
  }> {
    // Get businesses for this user
    const bizRes = await fetch(
      `${apiBase}/${apiVersion}/me/businesses?access_token=${userAccessToken}&fields=id,name`,
    );
    const bizData = (await bizRes.json()) as { data?: Array<{ id: string; name: string }> };
    const businesses = bizData.data ?? [];

    if (businesses.length === 0) {
      throw new BadRequestException(
        "No Meta Business accounts found for this user. Make sure the account has a WhatsApp Business setup.",
      );
    }

    // Use the first business to get WABAs
    const businessId = businesses[0].id;
    const wabaRes = await fetch(
      `${apiBase}/${apiVersion}/${businessId}/whatsapp_business_accounts` +
        `?access_token=${userAccessToken}&fields=id,name`,
    );
    const wabaData = (await wabaRes.json()) as { data?: Array<{ id: string; name: string }> };
    const wabas = wabaData.data ?? [];

    if (wabas.length === 0) {
      throw new BadRequestException(
        "No WhatsApp Business Account (WABA) found for this Meta Business. Make sure WhatsApp is set up.",
      );
    }

    const wabaId = wabas[0].id;

    // Get phone numbers for this WABA
    const phoneRes = await fetch(
      `${apiBase}/${apiVersion}/${wabaId}/phone_numbers` +
        `?access_token=${userAccessToken}&fields=id,display_phone_number,verified_name,status`,
    );
    const phoneData = (await phoneRes.json()) as {
      data?: Array<{
        id: string;
        display_phone_number: string;
        verified_name: string;
        status: string;
      }>;
    };
    const phones = phoneData.data ?? [];

    if (phones.length === 0) {
      throw new BadRequestException(
        "No phone numbers registered in the WhatsApp Business Account. Add a phone number in Meta Business Manager first.",
      );
    }

    const phone = phones[0];

    return {
      wabaId,
      phoneNumberId: phone.id,
      displayPhone: phone.display_phone_number,
      verifiedName: phone.verified_name,
    };
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
