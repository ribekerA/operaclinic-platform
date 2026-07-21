import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetaWhatsAppAdapter } from "../../src/modules/messaging/adapters/meta-whatsapp.adapter";

describe("MetaWhatsAppAdapter", () => {
  const configService = {
    get: vi.fn((key: string, fallback?: unknown) => fallback),
  };

  beforeEach(() => {
    configService.get.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("normalizes inbound Cloud API audio messages with null text and populated media", async () => {
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
                      id: "wamid-2",
                      from: "5511998880000",
                      timestamp: "1710600000",
                      type: "audio",
                      audio: {
                        id: "media-abc-123",
                        mime_type: "audio/ogg; codecs=opus",
                      },
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
        providerEventId: "wamid-2",
        providerMessageId: "wamid-2",
        eventType: "message.received",
        senderPhoneNumber: "5511998880000",
        senderDisplayName: "Cliente Aurora",
        messageText: null,
        media: {
          mediaId: "media-abc-123",
          mimeType: "audio/ogg; codecs=opus",
        },
      }),
    );
  });

  it("[contract] parses a full Meta Cloud API v21 audio webhook payload, including fields the adapter ignores (messaging_product, display_phone_number, sha256, voice)", async () => {
    // Shape mirrors Meta's documented Cloud API v21 webhook sample for an
    // inbound audio/voice message (developers.facebook.com/docs/whatsapp/
    // cloud-api/webhooks/payload-examples#audio-messages), anonymized.
    const adapter = new MetaWhatsAppAdapter(configService as never);

    const events = await adapter.parseInboundWebhook({
      request: { headers: {} } as never,
      connection: {
        provider: "WHATSAPP_META",
        connectionId: "connection-1",
        displayName: "Meta WhatsApp",
        externalAccountId: "123456123",
        config: null,
      },
      body: {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "16505551111",
                    phone_number_id: "123456123",
                  },
                  contacts: [
                    {
                      profile: { name: "Kerry Fisher" },
                      wa_id: "16315551234",
                    },
                  ],
                  messages: [
                    {
                      from: "16315551234",
                      id: "wamid.HBgLMTY1MDUwNzY1MjAVAgARGBI1QkNENUU2N0ZDNkYyRTBBMkYA",
                      timestamp: "1710600000",
                      type: "audio",
                      audio: {
                        mime_type: "audio/ogg; codecs=opus",
                        sha256: "R2JhVHNMbUEwWDRoQmxUOFdyRWpQTHRHZ1E9",
                        id: "1349679449387574",
                        voice: true,
                      },
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
        providerEventId:
          "wamid.HBgLMTY1MDUwNzY1MjAVAgARGBI1QkNENUU2N0ZDNkYyRTBBMkYA",
        senderPhoneNumber: "16315551234",
        senderDisplayName: "Kerry Fisher",
        messageText: null,
        media: {
          mediaId: "1349679449387574",
          mimeType: "audio/ogg; codecs=opus",
        },
      }),
    );
  });

  it("ignores an audio message with no media id", async () => {
    const adapter = new MetaWhatsAppAdapter(configService as never);

    const events = await adapter.parseInboundWebhook({
      request: { headers: {} } as never,
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
                  messages: [
                    {
                      id: "wamid-3",
                      from: "5511998880000",
                      timestamp: "1710600000",
                      type: "audio",
                      audio: {},
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });

    expect(events[0].media).toBeNull();
  });

  it("downloads media by resolving the temporary URL and fetching the binary, forwarding the bearer token to both requests", async () => {
    const adapter = new MetaWhatsAppAdapter(configService as never);
    const connection = {
      provider: "WHATSAPP_META",
      connectionId: "connection-1",
      displayName: "Meta WhatsApp",
      externalAccountId: "phone-number-id-1",
      config: { accessToken: "token-123" },
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            url: "https://cdn.example.com/media-abc-123",
            mime_type: "audio/ogg",
            file_size: 4096,
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        // Buffer.from(string).buffer can point at Node's shared, larger
        // pooled ArrayBuffer — use TextEncoder for an exactly-sized one.
        arrayBuffer: async () => new TextEncoder().encode("fake-audio-bytes").buffer,
      });
    vi.stubGlobal("fetch", fetchMock);

    const media = await adapter.downloadMedia("media-abc-123", connection as never);

    expect(media).toEqual({
      buffer: Buffer.from("fake-audio-bytes"),
      mimeType: "audio/ogg",
      sizeBytes: Buffer.from("fake-audio-bytes").length,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("media-abc-123");
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        headers: { Authorization: "Bearer token-123" },
      }),
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://cdn.example.com/media-abc-123",
    );
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        headers: { Authorization: "Bearer token-123" },
      }),
    );
  });

  it("returns media metadata (mimeType and sizeBytes) without downloading the binary", async () => {
    const adapter = new MetaWhatsAppAdapter(configService as never);
    const connection = {
      provider: "WHATSAPP_META",
      connectionId: "connection-1",
      displayName: "Meta WhatsApp",
      externalAccountId: "phone-number-id-1",
      config: { accessToken: "token-123" },
    };

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          url: "https://cdn.example.com/media-abc-123",
          mime_type: "audio/ogg",
          file_size: 999999,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const metadata = await adapter.getMediaMetadata("media-abc-123", connection as never);

    expect(metadata).toEqual({ mimeType: "audio/ogg", sizeBytes: 999999 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the integration connection has no access token configured", async () => {
    const adapter = new MetaWhatsAppAdapter(configService as never);
    const connection = {
      provider: "WHATSAPP_META",
      connectionId: "connection-1",
      displayName: "Meta WhatsApp",
      externalAccountId: "phone-number-id-1",
      config: null,
    };

    await expect(
      adapter.downloadMedia("media-abc-123", connection as never),
    ).rejects.toThrow();
  });
});
