import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IntegrationProvider } from "@prisma/client";
import { randomUUID } from "crypto";
import type {
  MessagingProviderAdapter,
  NormalizedInboundMessageEvent,
  OutboundButtonsDispatchInput,
  OutboundMessageDispatchInput,
  OutboundMessageDispatchResult,
  ProviderInboundWebhookInput,
  ProviderWebhookLookup,
} from "./messaging-provider.adapter";

interface EvolutionResolvedConfig {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}

@Injectable()
export class EvolutionWhatsAppAdapter implements MessagingProviderAdapter {
  private readonly logger = new Logger(EvolutionWhatsAppAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  supports(provider: IntegrationProvider): boolean {
    return provider === IntegrationProvider.WHATSAPP_EVOLUTION;
  }

  extractWebhookLookup(payload: Record<string, unknown>): ProviderWebhookLookup | null {
    const instance = this.asString(payload.instance);

    if (!instance) {
      return null;
    }

    return { providerAccountId: instance };
  }

  async parseInboundWebhook(
    input: ProviderInboundWebhookInput,
  ): Promise<NormalizedInboundMessageEvent[]> {
    const event = this.asString(input.body.event);

    if (!event || !event.startsWith("messages.")) {
      return [];
    }

    if (event === "messages.update" || event === "messages.delete") {
      return [];
    }

    const data = this.asRecord(input.body.data);

    if (!data) {
      return [];
    }

    const messages = Array.isArray(data.messages)
      ? (data.messages as unknown[])
      : [data];

    const events: NormalizedInboundMessageEvent[] = [];

    for (const raw of messages) {
      const msg = this.asRecord(raw);

      if (!msg) continue;

      const key = this.asRecord(msg.key);

      if (!key) continue;

      const fromMe = key.fromMe === true;

      if (fromMe) continue;

      const remoteJid = this.asString(key.remoteJid);

      if (!remoteJid) continue;

      const senderPhoneNumber = remoteJid.replace(/@.*$/, "");
      const msgId = this.asString(key.id) ?? randomUUID();
      const pushName = this.asString(msg.pushName) ?? null;
      const messageText = this.extractEvolutionText(msg);
      const timestamp = this.parseEvolutionTimestamp(msg.messageTimestamp);
      const dateTime = this.asString(input.body.date_time);
      const occurredAt = dateTime ? new Date(dateTime) : timestamp;

      this.logger.log(
        `Evolution inbound message: instance=${this.asString(input.body.instance)} from=${senderPhoneNumber} msgId=${msgId}`,
      );

      events.push({
        providerEventId: msgId,
        providerMessageId: msgId,
        eventType: "message.received",
        senderPhoneNumber,
        senderDisplayName: pushName,
        messageText,
        occurredAt,
        payload: { event, instance: input.body.instance, key, message: msg },
      });
    }

    return events;
  }

  async sendTextMessage(
    input: OutboundMessageDispatchInput,
  ): Promise<OutboundMessageDispatchResult> {
    const config = this.resolveConfig(input.connection);
    const endpoint = `${config.baseUrl}/message/sendText/${config.instanceName}`;

    this.logger.log(
      `Evolution outbound text: instance=${config.instanceName} to=${input.recipientPhoneNumber}`,
    );

    return this.withRetry(async () => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.apiKey,
        },
        body: JSON.stringify({
          number: input.recipientPhoneNumber,
          text: input.text,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        this.logger.warn(
          `Evolution send failed: instance=${config.instanceName} status=${response.status} body=${body.slice(0, 200)}`,
        );
        throw new BadGatewayException(
          `Evolution API sendText failed with status ${response.status}.`,
        );
      }

      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const key = this.asRecord(data.key);
      const providerMessageId = this.asString(key?.id) ?? randomUUID();

      return {
        providerMessageId,
        externalThreadId: input.recipientPhoneNumber,
        metadata: { provider: "evolution", instanceName: config.instanceName },
      };
    });
  }

  async sendButtons(
    input: OutboundButtonsDispatchInput,
  ): Promise<OutboundMessageDispatchResult> {
    const numbered = input.buttons
      .map((b, i) => `${i + 1}. ${b.title}`)
      .join("\n");
    const textFallback = `${input.text}\n\n${numbered}`;

    this.logger.log(
      `Evolution buttons (text fallback): to=${input.recipientPhoneNumber} options=${input.buttons.length}`,
    );

    return this.sendTextMessage({ ...input, text: textFallback });
  }

  private extractEvolutionText(msg: Record<string, unknown>): string | null {
    const message = this.asRecord(msg.message);

    if (!message) return null;

    return (
      this.asString(message.conversation) ||
      this.asString(this.asRecord(message.extendedTextMessage)?.text) ||
      this.asString(this.asRecord(message.imageMessage)?.caption) ||
      this.asString(this.asRecord(message.videoMessage)?.caption) ||
      this.asString(this.asRecord(message.documentMessage)?.caption) ||
      null
    );
  }

  private parseEvolutionTimestamp(raw: unknown): Date {
    if (typeof raw === "number") {
      return new Date(raw > 1e10 ? raw : raw * 1000);
    }

    if (typeof raw === "string" && /^\d+$/.test(raw)) {
      const n = Number(raw);
      return new Date(n > 1e10 ? n : n * 1000);
    }

    return new Date();
  }

  private resolveConfig(
    connection: OutboundMessageDispatchInput["connection"],
  ): EvolutionResolvedConfig {
    const cfg = this.asRecord(connection.config);
    const baseUrl =
      this.asString(cfg?.baseUrl) ||
      this.configService.get<string>("EVOLUTION_API_BASE_URL", "") ||
      "";
    const apiKey =
      this.asString(cfg?.apiKey) ||
      this.configService.get<string>("EVOLUTION_API_KEY", "") ||
      "";
    const instanceName =
      connection.externalAccountId ||
      this.asString(cfg?.instanceName) ||
      "";

    if (!baseUrl.trim()) {
      throw new ServiceUnavailableException(
        "Evolution API base URL is not configured for this integration.",
      );
    }

    if (!apiKey.trim()) {
      throw new ServiceUnavailableException(
        "Evolution API key is not configured for this integration.",
      );
    }

    if (!instanceName.trim()) {
      throw new ServiceUnavailableException(
        "Evolution API instance name is not configured for this integration.",
      );
    }

    return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, instanceName };
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt < maxAttempts) {
          const delayMs = 2 ** (attempt - 1) * 1000;
          await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private asString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}
