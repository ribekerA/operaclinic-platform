import {
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { MessagingWhatsappWebhookResponsePayload } from "@operaclinic/shared";
import {
  MessageEventDirection,
  MessageEventType,
  MessageThreadStatus,
  MessagingChannel,
  Prisma,
  WebhookEventStatus,
} from "@prisma/client";
import type { Request } from "express";
import { PrismaService } from "../../database/prisma.service";
import { AgentMessageBridgeService } from "../agent/agent-message-bridge.service";
import { MessagingProviderFactory } from "./adapters/messaging-provider.factory";
import type {
  NormalizedInboundMessageEvent,
  ProviderConnectionContext,
} from "./adapters/messaging-provider.adapter";
import { HandoffRequestsService } from "./handoff-requests.service";
import { IntegrationConnectionsService } from "./integration-connections.service";
import { MessagingGateway } from "./gateways/messaging.gateway";
import { MessagingPatientLinkService } from "./messaging-patient-link.service";
import { MessagingWebhookAbuseProtectionService } from "./messaging-webhook-abuse-protection.service";

@Injectable()
export class WhatsappWebhooksService {
  private readonly logger = new Logger(WhatsappWebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: MessagingProviderFactory,
    private readonly connectionsService: IntegrationConnectionsService,
    private readonly patientLinkService: MessagingPatientLinkService,
    private readonly abuseProtectionService: MessagingWebhookAbuseProtectionService,
    private readonly handoffsService: HandoffRequestsService,
    private readonly agentBridge: AgentMessageBridgeService,
    private readonly messagingGateway: MessagingGateway,
  ) {}

  async verifyWebhook(
    request: Request,
    query: Record<string, unknown>,
  ): Promise<string | { ok: true; channel: "WHATSAPP" }> {
    this.abuseProtectionService.assertWithinLimit(
      request,
      "verify_whatsapp_webhook",
    );

    const verifyToken =
      typeof query["hub.verify_token"] === "string"
        ? query["hub.verify_token"].trim()
        : "";

    if (!verifyToken) {
      return {
        ok: true,
        channel: "WHATSAPP",
      };
    }

    const connection = await this.connectionsService.resolveConnectionForWebhook({
      verifyToken,
    });
    const adapter = this.providerFactory.getAdapter(connection.provider);

    if (!adapter.verifyWebhookChallenge) {
      return {
        ok: true,
        channel: "WHATSAPP",
      };
    }

    return adapter.verifyWebhookChallenge({
      request,
      connection: this.buildProviderConnectionContext(connection),
      query,
    });
  }

  async handleInboundWebhook(
    request: Request,
    payload: Record<string, unknown>,
  ): Promise<MessagingWhatsappWebhookResponsePayload> {
    this.abuseProtectionService.assertWithinLimit(
      request,
      "receive_whatsapp_webhook",
    );

    const lookup = this.providerFactory.extractWebhookLookup(payload);

    if (!lookup) {
      throw new BadRequestException(
        "Unable to resolve the WhatsApp integration connection for this webhook.",
      );
    }

    const connection = await this.connectionsService.resolveConnectionForWebhook(lookup);
    const adapter = this.providerFactory.getAdapter(connection.provider);
    const providerConnection = this.buildProviderConnectionContext(connection);

    try {
      await adapter.verifyInboundWebhook?.({
        request,
        connection: providerConnection,
        body: payload,
      });

      const normalizedEvents = await adapter.parseInboundWebhook({
        request,
        connection: providerConnection,
        body: payload,
      });

      if (normalizedEvents.length === 0) {
        const ignoredWebhook = await this.prisma.webhookEvent.create({
          data: {
            tenantId: connection.tenantId,
            integrationConnectionId: connection.id,
            channel: MessagingChannel.WHATSAPP,
            provider: connection.provider,
            eventType: "provider.ignored",
            status: WebhookEventStatus.IGNORED,
            payload: payload as Prisma.InputJsonValue,
            processedAt: new Date(),
          },
        });

        return {
          ok: true,
          eventId: ignoredWebhook.id,
        };
      }

      let firstThreadId: string | undefined;
      let firstEventId: string | undefined;

      for (const event of normalizedEvents) {
        const processed = await this.processNormalizedEvent(connection, event);

        if (!firstThreadId && processed.threadId) {
          firstThreadId = processed.threadId;
        }

        if (!firstEventId && processed.eventId) {
          firstEventId = processed.eventId;
        }
      }

      return {
        ok: true,
        threadId: firstThreadId,
        eventId: firstEventId,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to process inbound WhatsApp webhook for connection ${connection.id}: ${error instanceof Error ? error.message : "unknown error"}`,
      );

      await this.prisma.webhookEvent.create({
        data: {
          tenantId: connection.tenantId,
          integrationConnectionId: connection.id,
          channel: MessagingChannel.WHATSAPP,
          provider: connection.provider,
          eventType: "provider.failed",
          status: WebhookEventStatus.FAILED,
          payload: payload as Prisma.InputJsonValue,
          errorMessage:
            error instanceof Error ? error.message.slice(0, 255) : "unknown error",
          processedAt: new Date(),
        },
      });

      throw error;
    }
  }

  private async processNormalizedEvent(
    connection: Awaited<
      ReturnType<IntegrationConnectionsService["resolveConnectionForWebhook"]>
    >,
    event: NormalizedInboundMessageEvent,
  ): Promise<MessagingWhatsappWebhookResponsePayload> {
    if (event.providerEventId) {
      // Dedup check: read first, then rely on unique constraint for race-condition safety.
      // findFirst is the fast path (already processed); the unique index on
      // (integrationConnectionId, providerEventId) guarantees at-most-once even under
      // concurrent delivery — the second request will hit P2002 on create and recover below.
      const existingWebhook = await this.prisma.webhookEvent.findFirst({
        where: {
          integrationConnectionId: connection.id,
          providerEventId: event.providerEventId,
        },
        select: {
          id: true,
          threadId: true,
        },
      });

      if (existingWebhook) {
        this.logger.debug(
          `Messaging webhook deduplicated: providerEventId=${event.providerEventId} connection=${connection.id}`,
        );
        return {
          ok: true,
          threadId: existingWebhook.threadId ?? undefined,
          eventId: existingWebhook.id,
        };
      }
    }

    if (event.eventType !== "message.received" && event.eventType !== "message.inbound") {
      const ignoredWebhook = await this.prisma.webhookEvent.create({
        data: {
          tenantId: connection.tenantId,
          integrationConnectionId: connection.id,
          channel: MessagingChannel.WHATSAPP,
          provider: connection.provider,
          providerEventId: event.providerEventId ?? null,
          eventType: event.eventType,
          status: WebhookEventStatus.IGNORED,
          payload: event.payload as Prisma.InputJsonValue,
          processedAt: new Date(),
        },
      });

      return {
        ok: true,
        eventId: ignoredWebhook.id,
      };
    }

    if (!event.senderPhoneNumber) {
      throw new BadRequestException(
        "senderPhoneNumber is required for inbound message events.",
      );
    }

    const senderPhoneNumber = event.senderPhoneNumber;

    const patientLink = await this.resolvePatientLink(
      connection.tenantId,
      senderPhoneNumber,
    );

    let createdWebhook: Awaited<ReturnType<typeof this.prisma.webhookEvent.create>>;

    try {
      createdWebhook = await this.prisma.webhookEvent.create({
        data: {
          tenantId: connection.tenantId,
          integrationConnectionId: connection.id,
          channel: MessagingChannel.WHATSAPP,
          provider: connection.provider,
          providerEventId: event.providerEventId ?? null,
          eventType: event.eventType,
          status: WebhookEventStatus.RECEIVED,
          payload: event.payload as Prisma.InputJsonValue,
        },
      });
    } catch (createError: unknown) {
      // P2002 = unique constraint violation: concurrent request already created this event
      const isConcurrentDuplicate =
        createError instanceof Prisma.PrismaClientKnownRequestError &&
        createError.code === "P2002";
      if (isConcurrentDuplicate && event.providerEventId) {
        const deduped = await this.prisma.webhookEvent.findFirst({
          where: {
            integrationConnectionId: connection.id,
            providerEventId: event.providerEventId,
          },
          select: { id: true, threadId: true },
        });
        if (deduped) {
          this.logger.debug(
            `Messaging webhook race-condition dedup: providerEventId=${event.providerEventId}`,
          );
          return {
            ok: true,
            threadId: deduped.threadId ?? undefined,
            eventId: deduped.id,
          };
        }
      }
      throw createError;
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const existingThread = await tx.messageThread.findUnique({
          where: {
            tenantId_integrationConnectionId_channel_normalizedContactValue: {
              tenantId: connection.tenantId,
              integrationConnectionId: connection.id,
              channel: MessagingChannel.WHATSAPP,
              normalizedContactValue: patientLink.normalizedContactValue,
            },
          },
        });

        const nextThreadStatus =
          existingThread?.status === MessageThreadStatus.CLOSED
            ? MessageThreadStatus.OPEN
            : existingThread?.status ?? MessageThreadStatus.OPEN;
        const resolvedPatientId = existingThread?.patientId ?? patientLink.patientId;
        const resolvedPatientDisplayName =
          existingThread?.patientDisplayName ||
          patientLink.patientDisplayName ||
          event.senderDisplayName ||
          null;

        const thread = existingThread
          ? await tx.messageThread.update({
              where: {
                id: existingThread.id,
              },
              data: {
                patientId: resolvedPatientId ?? undefined,
                patientDisplayName: resolvedPatientDisplayName,
                status: nextThreadStatus,
                contactDisplayValue: senderPhoneNumber,
                lastMessagePreview: this.truncatePreview(event.messageText ?? ""),
                lastMessageAt: event.occurredAt,
                lastInboundAt: event.occurredAt,
              },
            })
          : await tx.messageThread.create({
              data: {
                tenantId: connection.tenantId,
                patientId: patientLink.patientId,
                integrationConnectionId: connection.id,
                channel: MessagingChannel.WHATSAPP,
                status: MessageThreadStatus.OPEN,
                contactDisplayValue: senderPhoneNumber,
                normalizedContactValue: patientLink.normalizedContactValue,
                patientDisplayName:
                  patientLink.patientDisplayName || event.senderDisplayName || null,
                externalThreadId: event.providerMessageId ?? null,
                lastMessagePreview: this.truncatePreview(event.messageText ?? ""),
                lastMessageAt: event.occurredAt,
                lastInboundAt: event.occurredAt,
              },
            });

        if (!existingThread) {
          await tx.messageEvent.create({
            data: {
              tenantId: connection.tenantId,
              threadId: thread.id,
              patientId: thread.patientId,
              integrationConnectionId: connection.id,
              webhookEventId: createdWebhook.id,
              direction: MessageEventDirection.SYSTEM,
              eventType: MessageEventType.THREAD_CREATED,
              metadata: {
                source: connection.provider,
              },
              occurredAt: event.occurredAt,
            },
          });
        }

        const messageEvent = await tx.messageEvent.create({
          data: {
            tenantId: connection.tenantId,
            threadId: thread.id,
            patientId: thread.patientId,
            integrationConnectionId: connection.id,
            webhookEventId: createdWebhook.id,
            direction: MessageEventDirection.INBOUND,
            eventType: MessageEventType.MESSAGE_RECEIVED,
            providerMessageId: event.providerMessageId ?? null,
            contentText: event.messageText ?? null,
            metadata: {
              senderDisplayName: event.senderDisplayName ?? null,
            },
            occurredAt: event.occurredAt,
          },
        });

        await tx.webhookEvent.update({
          where: {
            id: createdWebhook.id,
          },
          data: {
            tenantId: connection.tenantId,
            threadId: thread.id,
            status: WebhookEventStatus.PROCESSED,
            processedAt: new Date(),
          },
        });

        return {
          threadId: thread.id,
          eventId: messageEvent.id,
          threadStatus: thread.status,
          lastMessagePreview: thread.lastMessagePreview,
          lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
        };
      });

      if (event.handoffRequest && result.threadId) {
        try {
          await this.handoffsService.ensureAutomaticHandoffForThread({
            tenantId: connection.tenantId,
            threadId: result.threadId,
            reason: event.handoffRequest.reason,
            note: event.handoffRequest.note,
          });
        } catch (handoffError) {
          this.logger.warn(
            `Failed to open automatic handoff for thread ${result.threadId}: ${handoffError instanceof Error ? handoffError.message : "unknown error"}`,
          );
        }
      }

      // Trigger agent bridge asynchronously — non-blocking, errors are suppressed
      void this.agentBridge.routeInboundMessage({
        tenantId: connection.tenantId,
        threadId: result.threadId,
        messageText: event.messageText ?? null,
        senderPhoneNumber,
        senderDisplayName: event.senderDisplayName ?? null,
        patientId: patientLink.patientId,
        correlationId: result.eventId,
      });

      this.messagingGateway.emitThreadActivity(connection.tenantId, {
        threadId: result.threadId,
        direction: "INBOUND",
        eventType: "MESSAGE_RECEIVED",
        occurredAt: event.occurredAt.toISOString(),
      });
      this.messagingGateway.emitThreadUpdated(connection.tenantId, {
        threadId: result.threadId,
        status: result.threadStatus,
        lastMessagePreview: result.lastMessagePreview,
        lastMessageAt: result.lastMessageAt,
      });

      return {
        ok: true,
        threadId: result.threadId,
        eventId: result.eventId,
      };
    } catch (error) {
      await this.prisma.webhookEvent.update({
        where: {
          id: createdWebhook.id,
        },
        data: {
          status: WebhookEventStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message.slice(0, 255) : "unknown error",
          processedAt: new Date(),
        },
      });

      throw error;
    }
  }

  private buildProviderConnectionContext(
    connection: Awaited<
      ReturnType<IntegrationConnectionsService["resolveConnectionForWebhook"]>
    >,
  ): ProviderConnectionContext {
    return {
      provider: connection.provider,
      connectionId: connection.id,
      displayName: connection.displayName,
      externalAccountId: connection.externalAccountId,
      config: this.mapJsonRecord(connection.config),
    };
  }

  private async resolvePatientLink(
    tenantId: string,
    senderPhoneNumber: string,
  ): Promise<Awaited<ReturnType<MessagingPatientLinkService["resolveByContactValue"]>>> {
    try {
      return await this.patientLinkService.resolveByContactValue(
        tenantId,
        senderPhoneNumber,
      );
    } catch (_error) {
      throw new BadRequestException("senderPhoneNumber is invalid.");
    }
  }

  private truncatePreview(text: string): string | null {
    const normalized = text.trim();

    if (!normalized) {
      return null;
    }

    return normalized.length <= 255
      ? normalized
      : `${normalized.slice(0, 252)}...`;
  }

  private mapJsonRecord(
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> | null {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      return null;
    }

    return value as Record<string, unknown>;
  }
}
