import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { RequestMethod, ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";
import { RequestIdInterceptor } from "./common/interceptors/request-id.interceptor";
import { RequestLoggingInterceptor } from "./common/interceptors/request-logging.interceptor";

process.on("unhandledRejection", (reason: unknown) => {
  console.error(
    "[WARN] Unhandled promise rejection (process kept alive):",
    reason instanceof Error ? reason.stack : reason,
  );
});
process.on("uncaughtException", (err: Error) => {
  console.error("[WARN] Uncaught exception (process kept alive):", err.stack);
});

async function bootstrap(): Promise<void> {
  console.log("[STARTUP] bootstrap() called");
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const prefix = configService.get<string>("app.prefix", "api/v1");
  const port = configService.get<number>("app.port", 3001);
  const webUrl = configService.get<string>("WEB_URL", "http://localhost:3000");

  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  }));

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      const allowed = [
        webUrl,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ];
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
    maxAge: 86400,
  });

  // Exclude /api/agent/v1/* from the global api/v1 prefix so those routes
  // register at their own path without the version prefix being duplicated.
  app.setGlobalPrefix(prefix, {
    exclude: [{ path: 'api/agent/(.*)', method: RequestMethod.ALL }],
  });
  app.useGlobalFilters(new GlobalExceptionFilter());
  // Use DI-managed interceptors so TraceContextService is properly injected.
  app.useGlobalInterceptors(
    app.get(RequestIdInterceptor),
    app.get(RequestLoggingInterceptor),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(port);
  console.log(`[STARTUP] Application listening on port ${port}`);
}

bootstrap().catch((err: unknown) => {
  console.error(
    "[FATAL] Bootstrap failed — exiting:",
    err instanceof Error ? err.stack : err,
  );
  process.exit(1);
});
