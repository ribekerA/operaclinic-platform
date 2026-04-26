import { Injectable } from "@nestjs/common";
import { IntegrationProvider } from "@prisma/client";
import { MetaWhatsAppAdapter } from "./meta-whatsapp.adapter";
import { MockWhatsAppAdapter } from "./mock-whatsapp.adapter";
import type {
  MessagingProviderAdapter,
  ProviderWebhookLookup,
} from "./messaging-provider.adapter";

@Injectable()
export class MessagingProviderFactory {
  private readonly adapters: MessagingProviderAdapter[];

  constructor(
    private readonly mockWhatsAppAdapter: MockWhatsAppAdapter,
    private readonly metaWhatsAppAdapter: MetaWhatsAppAdapter,
  ) {
    this.adapters = [this.mockWhatsAppAdapter, this.metaWhatsAppAdapter];
  }

  getAdapter(provider: IntegrationProvider): MessagingProviderAdapter {
    const adapter = this.adapters.find((candidate) =>
      candidate.supports(provider),
    );

    if (adapter) {
      return adapter;
    }

    throw new Error(`Unsupported messaging provider: ${provider}`);
  }

  extractWebhookLookup(payload: Record<string, unknown>): ProviderWebhookLookup | null {
    for (const adapter of this.adapters) {
      const lookup = adapter.extractWebhookLookup(payload);

      if (lookup?.connectionId || lookup?.providerAccountId || lookup?.verifyToken) {
        return lookup;
      }
    }

    return null;
  }
}
