import { registerAs } from "@nestjs/config";

export default registerAs("messaging", () => ({
  metaEnabled: process.env.MESSAGING_WHATSAPP_META_ENABLED === "true",
  metaApiBaseUrl:
    process.env.MESSAGING_WHATSAPP_META_API_BASE_URL ||
    "https://graph.facebook.com",
  metaApiVersion: process.env.MESSAGING_WHATSAPP_META_API_VERSION || "v21.0",
  metaAccessToken: process.env.MESSAGING_WHATSAPP_META_ACCESS_TOKEN || "",
  metaAppSecret: process.env.MESSAGING_WHATSAPP_META_APP_SECRET || "",
}));
