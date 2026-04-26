import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";
import { RequestIdInterceptor } from "./common/interceptors/request-id.interceptor";
import { RequestLoggingInterceptor } from "./common/interceptors/request-logging.interceptor";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: true,
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const prefix = configService.get<string>("app.prefix", "api/v1");
  const port = configService.get<number>("app.port", 3001);

  app.setGlobalPrefix(prefix);
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
}

void bootstrap();
