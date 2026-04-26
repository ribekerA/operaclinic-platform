import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
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
    DatabaseModule,
    AuditModule,
    ObservabilityModule,
    AuthModule,
    ModulesModule,
  ],
})
export class AppModule {}
