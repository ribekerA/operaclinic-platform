import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
  name: process.env.APP_NAME ?? "OperaClinic API",
  environment: process.env.NODE_ENV ?? "development",
  port: Number(process.env.API_PORT ?? 3001),
  prefix: process.env.API_PREFIX ?? "api/v1",
}));
