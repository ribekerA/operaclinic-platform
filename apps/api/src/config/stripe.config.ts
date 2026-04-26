import { registerAs } from "@nestjs/config";

export default registerAs("stripe", () => ({
  secretKey: process.env.STRIPE_SECRET_KEY || "",
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  webUrl: process.env.WEB_URL || "http://localhost:3000",
}));
