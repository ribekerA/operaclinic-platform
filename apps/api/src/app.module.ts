import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import appConfig from "./config/app.config";
import databaseConfig from "./config/database.config";
import authConfig from "./config/auth.config";
import commercialConfig from "./config/commercial.config";
import messagingConfig from "./config/messaging.config";
import paymentConfig from "./config/payment.config";
import stripeConfig from "./config/stripe.config";
import agentConfig from "./config/agent.config";
import { getEnvFilePaths } from "./config/env";
import { validateEnv } from "./config/env.validation";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./auth/auth.module";
import { AuditModule } from "./common/audit/audit.module";
import { ObservabilityModule } from "./common/observability/observability.module";
import { ModulesModule } from "./modules/modules.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: getEnvFilePaths(),
      load: [
        appConfig,
        databaseConfig,
        authConfig,
        commercialConfig,
        messagingConfig,
        paymentConfig,
        stripeConfig,
        agentConfig,
      ],
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ([{
        ttl: config.get<number>("THROTTLE_TTL_MS") ?? 60_000,
        limit: config.get<number>("THROTTLE_LIMIT") ?? 300,
      }]),
    }),
    DatabaseModule,
    AuditModule,
    ObservabilityModule,
    AuthModule,
    ModulesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
