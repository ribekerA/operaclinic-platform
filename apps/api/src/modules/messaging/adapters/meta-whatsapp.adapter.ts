import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IntegrationProvider } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import type { Request as ExpressRequest } from "express";
import type {
  MessagingProviderAdapter,
  NormalizedInboundMessageEvent,
  OutboundMessageDispatchInput,
  OutboundMessageDispatchResult,
  ProviderInboundWebhookInput,
  ProviderWebhookLookup,
  ProviderWebhookVerificationInput,
} from "./messaging-provider.adapter";

interface MetaResolvedConfig {
  apiBaseUrl: string;
  apiVersion: string;
  accessToken: string;
  appSecret: string;
  phoneNumberId: string;
}

@Injectable()
export class MetaWhatsAppAdapter implements MessagingProviderAdapter {
  private readonly logger = new Logger(MetaWhatsAppAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  supports(provider: IntegrationProvider): boolean {
    return provider === IntegrationProvider.WHATSAPP_META;
  }

  extractWebhookLookup(payload: Record<string, unknown>): ProviderWebhookLookup | null {
    if (typeof payload.providerAccountId === "string") {
      return {
        providerAccountId: payload.providerAccountId.trim(),
      };
    }

    if (payload.object !== "whatsapp_business_account") {
      return null;
    }

    const entries = this.asArray(payload.entry);

    for (const entry of entries) {
      const entryRecord = this.asRecord(entry);
      const changes = this.asArray(entryRecord?.changes);

      for (const change of changes) {
        const changeRecord = this.asRecord(change);
        const value = this.asRecord(changeRecord?.value);
        const metadata = this.asRecord(value?.metadata);
        const phoneNumberId = this.asString(metadata?.phone_number_id);

        if (phoneNumberId) {
          return {
            providerAccountId: phoneNumberId,
          };
        }
      }
    }

    return null;
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
      throw new BadRequestException("Invalid WhatsApp verification payload.");
    }

    return challenge;
  }

  async verifyInboundWebhook(input: ProviderInboundWebhookInput): Promise<void> {
    const config = this.resolveConfig(input.connection);

    if (!config.appSecret) {
      this.logger.warn(
        `Skipping Meta webhook signature validation for connection ${input.connection.connectionId} because no app secret is configured.`,
      );
      return;
    }

    const signatureHeader = this.readSignatureHeader(input.request);

    if (!signatureHeader) {
      throw new BadRequestException(
        "Missing Meta webhook signature header.",
      );
    }

    const rawBody = this.resolveRawBody(input.request, input.body);
    const expectedSignature = this.computeSignature(rawBody, config.appSecret);

    if (!this.signaturesMatch(expectedSignature, signatureHeader)) {
      throw new BadRequestException("Invalid Meta webhook signature.");
    }
  }

  async parseInboundWebhook(
    input: ProviderInboundWebhookInput,
  ): Promise<NormalizedInboundMessageEvent[]> {
    if (input.body.object !== "whatsapp_business_account") {
      return [];
    }

    const normalizedEvents: NormalizedInboundMessageEvent[] = [];
    const entries = this.asArray(input.body.entry);

    for (const entry of entries) {
      const entryRecord = this.asRecord(entry);
      const entryId = this.asString(entryRecord?.id);
      const changes = this.asArray(entryRecord?.changes);

      for (const change of changes) {
        const changeRecord = this.asRecord(change);
        const field = this.asString(changeRecord?.field) || "messages";
        const value = this.asRecord(changeRecord?.value);

        normalizedEvents.push(
          ...this.extractMessageEvents(entryId, field, value),
          ...this.extractStatusEvents(entryId, field, value),
        );
      }
    }

    return normalizedEvents;
  }

  async sendTextMessage(
    input: OutboundMessageDispatchInput,
  ): Promise<OutboundMessageDispatchResult> {
    const config = this.resolveConfig(input.connection);
    const endpoint = `${config.apiBaseUrl.replace(/\/$/, "")}/${config.apiVersion}/${config.phoneNumberId}/messages`;
    const body = {
      messaging_product: "whatsapp",
      to: input.recipientPhoneNumber,
      type: "text",
      text: {
        body: input.text,
        preview_url: false,
      },
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    const responseJson = this.safeParseJson(responseText);

    if (!response.ok) {
      this.logger.warn(
        `Meta outbound failed for connection ${input.connectionId}: ${response.status}`,
      );
      throw new BadGatewayException(
        `Meta WhatsApp outbound failed with status ${response.status}.`,
      );
    }

    const providerMessageId = this.asString(
      this.asArray(responseJson?.messages)?.[0]
        ? this.asRecord(this.asArray(responseJson?.messages)[0])?.id
        : undefined,
    );

    if (!providerMessageId) {
      throw new BadGatewayException(
        "Meta WhatsApp outbound response did not return a provider message id.",
      );
    }

    return {
      providerMessageId,
      externalThreadId:
        this.asString(
          this.asArray(responseJson?.contacts)?.[0]
            ? this.asRecord(this.asArray(responseJson?.contacts)[0])?.wa_id
            : undefined,
        ) ?? input.recipientPhoneNumber,
      metadata: {
        provider: "meta",
        phoneNumberId: config.phoneNumberId,
      },
    };
  }

  private extractMessageEvents(
    entryId: string | null,
    field: string,
    value: Record<string, unknown> | null,
  ): NormalizedInboundMessageEvent[] {
    const messages = this.asArray(value?.messages);
    const contacts = this.asArray(value?.contacts);
    const events: NormalizedInboundMessageEvent[] = [];

    for (const message of messages) {
      const messageRecord = this.asRecord(message);

      if (!messageRecord) {
        continue;
      }

      const senderPhoneNumber = this.asString(messageRecord.from);
      const providerMessageId = this.asString(messageRecord.id);

      if (!senderPhoneNumber || !providerMessageId) {
        continue;
      }

      const messageText = this.extractTextBody(messageRecord);
      const senderDisplayName = this.resolveContactDisplayName(
        contacts,
        senderPhoneNumber,
      );
      const occurredAt = this.parseMetaTimestamp(messageRecord.timestamp);

      events.push({
        providerEventId: providerMessageId,
        providerMessageId,
        eventType: "message.received",
        senderPhoneNumber,
        senderDisplayName,
        messageText,
        occurredAt,
        payload: {
          entryId,
          field,
          message: messageRecord,
        },
      });
    }

    return events;
  }

  private extractStatusEvents(
    entryId: string | null,
    field: string,
    value: Record<string, unknown> | null,
  ): NormalizedInboundMessageEvent[] {
    const statuses = this.asArray(value?.statuses);
    const events: NormalizedInboundMessageEvent[] = [];

    for (const status of statuses) {
      const statusRecord = this.asRecord(status);

      if (!statusRecord) {
        continue;
      }

      const providerMessageId = this.asString(statusRecord.id);

      events.push({
        providerEventId:
          providerMessageId ||
          `${entryId ?? "meta"}:${field}:status:${Date.now()}`,
        providerMessageId,
        eventType: "message.status",
        senderPhoneNumber: this.asString(statusRecord.recipient_id),
        senderDisplayName: null,
        messageText: null,
        occurredAt: this.parseMetaTimestamp(statusRecord.timestamp),
        payload: {
          entryId,
          field,
          status: statusRecord,
        },
      });
    }

    return events;
  }

  private resolveContactDisplayName(
    contacts: unknown[],
    senderPhoneNumber: string,
  ): string | null {
    const match = contacts
      .map((contact) => this.asRecord(contact))
      .find((contact) => this.asString(contact?.wa_id) === senderPhoneNumber);
    const profile = this.asRecord(match?.profile);

    return this.asString(profile?.name);
  }

  private extractTextBody(message: Record<string, unknown>): string | null {
    const text = this.asRecord(message.text);
    const interactive = this.asRecord(message.interactive);
    const button = this.asRecord(message.button);

    return (
      this.asString(text?.body) ||
      this.asString(interactive?.body) ||
      this.asString(button?.text) ||
      this.asString(message.type) ||
      null
    );
  }

  private parseMetaTimestamp(rawTimestamp: unknown): Date {
    const timestamp = this.asString(rawTimestamp);

    if (!timestamp) {
      return new Date();
    }

    if (/^\d+$/.test(timestamp)) {
      return new Date(Number(timestamp) * 1000);
    }

    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private resolveConfig(
    connection: OutboundMessageDispatchInput["connection"],
  ): MetaResolvedConfig {
    const config = this.asRecord(connection.config);
    const apiBaseUrl =
      this.asString(config?.apiBaseUrl) ||
      this.configService.get<string>(
        "messaging.metaApiBaseUrl",
        "https://graph.facebook.com",
      ) ||
      "https://graph.facebook.com";
    const apiVersion =
      this.asString(config?.apiVersion) ||
      this.configService.get<string>("messaging.metaApiVersion", "v21.0") ||
      "v21.0";
    const accessToken =
      this.asString(config?.accessToken) ||
      this.configService.get<string>("messaging.metaAccessToken", "") ||
      "";
    const appSecret =
      this.asString(config?.appSecret) ||
      this.configService.get<string>("messaging.metaAppSecret", "") ||
      "";
    const phoneNumberId =
      connection.externalAccountId ||
      this.asString(config?.phoneNumberId) ||
      "";

    if (!accessToken.trim()) {
      throw new ServiceUnavailableException(
        "Meta WhatsApp access token is not configured for this integration.",
      );
    }

    if (!phoneNumberId.trim()) {
      throw new ServiceUnavailableException(
        "Meta WhatsApp phone number id is not configured for this integration.",
      );
    }

    return {
      apiBaseUrl,
      apiVersion,
      accessToken,
      appSecret,
      phoneNumberId,
    };
  }

  private readSignatureHeader(request: ExpressRequest): string | null {
    const header = request.headers["x-hub-signature-256"];

    if (typeof header === "string") {
      return header.trim();
    }

    if (Array.isArray(header) && typeof header[0] === "string") {
      return header[0].trim();
    }

    return null;
  }

  private resolveRawBody(
    request: ExpressRequest,
    body: Record<string, unknown>,
  ): Buffer {
    const rawBody = (request as ExpressRequest & { rawBody?: Buffer }).rawBody;

    if (rawBody?.length) {
      return rawBody;
    }

    return Buffer.from(JSON.stringify(body));
  }

  private computeSignature(body: Buffer, appSecret: string): string {
    return `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;
  }

  private signaturesMatch(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, actualBuffer);
  }

  private safeParseJson(value: string): Record<string, unknown> | null {
    if (!value.trim()) {
      return null;
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      return this.asRecord(parsed);
    } catch {
      return null;
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private asString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}
