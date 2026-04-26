import { beforeEach, describe, expect, it, vi } from "vitest";
import { MetaWhatsAppAdapter } from "../../src/modules/messaging/adapters/meta-whatsapp.adapter";

describe("MetaWhatsAppAdapter", () => {
  const configService = {
    get: vi.fn((key: string, fallback?: unknown) => fallback),
  };

  beforeEach(() => {
    configService.get.mockClear();
  });

  it("extracts providerAccountId from a Cloud API webhook payload", () => {
    const adapter = new MetaWhatsAppAdapter(configService as never);

    const lookup = adapter.extractWebhookLookup({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry-1",
          changes: [
            {
              field: "messages",
              value: {
                metadata: {
                  phone_number_id: "phone-number-id-1",
                },
              },
            },
          ],
        },
      ],
    });

    expect(lookup).toEqual({
      providerAccountId: "phone-number-id-1",
    });
  });

  it("normalizes inbound Cloud API text messages for the core", async () => {
    const adapter = new MetaWhatsAppAdapter(configService as never);

    const events = await adapter.parseInboundWebhook({
      request: {
        headers: {},
      } as never,
      connection: {
        provider: "WHATSAPP_META",
        connectionId: "connection-1",
        displayName: "Meta WhatsApp",
        externalAccountId: "phone-number-id-1",
        config: null,
      },
      body: {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "entry-1",
            changes: [
              {
                field: "messages",
                value: {
                  metadata: {
                    phone_number_id: "phone-number-id-1",
                  },
                  contacts: [
                    {
                      wa_id: "5511998880000",
                      profile: {
                        name: "Cliente Aurora",
                      },
                    },
                  ],
                  messages: [
                    {
                      id: "wamid-1",
                      from: "5511998880000",
                      timestamp: "1710600000",
                      text: {
                        body: "Oi, quero agendar",
                      },
                      type: "text",
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        providerEventId: "wamid-1",
        providerMessageId: "wamid-1",
        eventType: "message.received",
        senderPhoneNumber: "5511998880000",
        senderDisplayName: "Cliente Aurora",
        messageText: "Oi, quero agendar",
      }),
    );
  });
});
