import { registerAs } from "@nestjs/config";

export default registerAs("payment", () => ({
  provider: process.env.PAYMENT_PROVIDER || "",
}));
