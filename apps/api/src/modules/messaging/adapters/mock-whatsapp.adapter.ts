import { Injectable, Logger } from "@nestjs/common";
import { IntegrationProvider } from "@prisma/client";
import { randomUUID } from "crypto";
import type {
  MessagingProviderAdapter,
  NormalizedInboundMessageEvent,
  OutboundMessageDispatchInput,
  OutboundMessageDispatchResult,
  ProviderInboundWebhookInput,
  ProviderWebhookLookup,
  ProviderWebhookVerificationInput,
} from "./messaging-provider.adapter";

@Injectable()
export class MockWhatsAppAdapter implements MessagingProviderAdapter {
  private readonly logger = new Logger(MockWhatsAppAdapter.name);

  supports(provider: IntegrationProvider): boolean {
    return provider === IntegrationProvider.WHATSAPP_MOCK;
  }

  extractWebhookLookup(payload: Record<string, unknown>): ProviderWebhookLookup | null {
    return {
      connectionId:
        typeof payload.connectionId === "string"
          ? payload.connectionId.trim()
          : undefined,
      providerAccountId:
        typeof payload.providerAccountId === "string"
          ? payload.providerAccountId.trim()
          : undefined,
      verifyToken:
        typeof payload.verifyToken === "string"
          ? payload.verifyToken.trim()
          : undefined,
    };
  }

  async verifyWebhookChallenge(
    input: ProviderWebhookVerificationInput,
  ): Promise<string> {
    const mode =
      typeof input.query["hub.mode"] === "string"
        ? input.query["hub.mode"].trim()
        : "";
    const challenge =
      typeof input.query["hub.challenge"] === "string"
        ? input.query["hub.challenge"]
        : "";

    if (mode !== "subscribe" || !challenge) {
      throw new Error("Invalid mock WhatsApp verification payload.");
    }

    return challenge;
  }

  async parseInboundWebhook(
    input: ProviderInboundWebhookInput,
  ): Promise<NormalizedInboundMessageEvent[]> {
    const rawEventType =
      typeof input.body.eventType === "string"
        ? input.body.eventType.trim()
        : "message.received";
    const rawOccurredAt =
      typeof input.body.occurredAt === "string"
        ? input.body.occurredAt.trim()
        : "";
    const occurredAt = rawOccurredAt ? new Date(rawOccurredAt) : new Date();

    if (Number.isNaN(occurredAt.getTime())) {
      throw new Error("Invalid mock WhatsApp occurredAt.");
    }

    const handoff =
      input.body.handoff && typeof input.body.handoff === "object"
        ? (input.body.handoff as Record<string, unknown>)
        : null;
    const requestedHandoff =
      handoff &&
      handoff.requested === true &&
      typeof handoff.reason === "string" &&
      handoff.reason.trim()
        ? {
            reason: handoff.reason.trim(),
            note:
              typeof handoff.note === "string" && handoff.note.trim()
                ? handoff.note.trim()
                : null,
          }
        : null;

    return [
      {
        providerEventId:
          typeof input.body.providerEventId === "string"
            ? input.body.providerEventId.trim()
            : null,
        providerMessageId:
          typeof input.body.providerMessageId === "string"
            ? input.body.providerMessageId.trim()
            : null,
        eventType: rawEventType.toLowerCase(),
        senderPhoneNumber:
          typeof input.body.senderPhoneNumber === "string"
            ? input.body.senderPhoneNumber.trim()
            : null,
        senderDisplayName:
          typeof input.body.senderDisplayName === "string"
            ? input.body.senderDisplayName.trim()
            : null,
        messageText:
          typeof input.body.messageText === "string"
            ? input.body.messageText.trim()
            : null,
        occurredAt,
        handoffRequest: requestedHandoff,
        payload: {
          ...input.body,
        },
      },
    ];
  }

  async sendTextMessage(
    input: OutboundMessageDispatchInput,
  ): Promise<OutboundMessageDispatchResult> {
    const providerMessageId = `mock_msg_${randomUUID()}`;

    this.logger.debug(
      `Mock outbound WhatsApp message sent to ${input.recipientPhoneNumber} via connection ${input.connectionId}.`,
    );

    return {
      providerMessageId,
      externalThreadId: input.recipientPhoneNumber,
      metadata: {
        provider: "mock",
        connectionDisplayName: input.connection.displayName,
      },
    };
  }
}
