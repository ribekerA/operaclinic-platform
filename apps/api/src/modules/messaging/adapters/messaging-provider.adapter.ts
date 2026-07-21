import { IntegrationProvider } from "@prisma/client";
import type { Request } from "express";

export interface ProviderConnectionContext {
  provider: IntegrationProvider;
  connectionId: string;
  displayName: string;
  externalAccountId?: string | null;
  config?: Record<string, unknown> | null;
}

export interface ProviderWebhookLookup {
  connectionId?: string;
  providerAccountId?: string;
  verifyToken?: string;
}

export interface ProviderWebhookVerificationInput {
  request: Request;
  connection: ProviderConnectionContext;
  query: Record<string, unknown>;
}

export interface ProviderInboundWebhookInput {
  request: Request;
  connection: ProviderConnectionContext;
  body: Record<string, unknown>;
}

export interface AutomaticHandoffRequest {
  reason: string;
  note?: string | null;
}

export interface NormalizedInboundMedia {
  mediaId: string;
  mimeType: string | null;
}

export interface NormalizedInboundMessageEvent {
  providerEventId?: string | null;
  providerMessageId?: string | null;
  eventType: string;
  senderPhoneNumber?: string | null;
  senderDisplayName?: string | null;
  messageText?: string | null;
  occurredAt: Date;
  handoffRequest?: AutomaticHandoffRequest | null;
  media?: NormalizedInboundMedia | null;
  payload: Record<string, unknown>;
}

export interface OutboundMessageDispatchInput {
  connection: ProviderConnectionContext;
  connectionId: string;
  externalAccountId?: string | null;
  recipientPhoneNumber: string;
  text: string;
  context?: Record<string, unknown>;
}

export interface OutboundButton {
  id: string;
  title: string;
}

export interface OutboundButtonsDispatchInput extends OutboundMessageDispatchInput {
  buttons: OutboundButton[];
}

export interface OutboundMessageDispatchResult {
  providerMessageId: string;
  externalThreadId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
}

export interface MediaMetadata {
  mimeType: string;
  sizeBytes: number | null;
}

export interface MessagingProviderAdapter {
  supports(provider: IntegrationProvider): boolean;

  extractWebhookLookup(payload: Record<string, unknown>): ProviderWebhookLookup | null;

  verifyWebhookChallenge?(
    input: ProviderWebhookVerificationInput,
  ): Promise<string>;

  verifyInboundWebhook?(input: ProviderInboundWebhookInput): Promise<void>;

  parseInboundWebhook(
    input: ProviderInboundWebhookInput,
  ): Promise<NormalizedInboundMessageEvent[]>;

  sendTextMessage(
    input: OutboundMessageDispatchInput,
  ): Promise<OutboundMessageDispatchResult>;

  sendButtons?(
    input: OutboundButtonsDispatchInput,
  ): Promise<OutboundMessageDispatchResult>;

  downloadMedia?(
    mediaId: string,
    connection: ProviderConnectionContext,
  ): Promise<DownloadedMedia>;

  getMediaMetadata?(
    mediaId: string,
    connection: ProviderConnectionContext,
  ): Promise<MediaMetadata>;
}
