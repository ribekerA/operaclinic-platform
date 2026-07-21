import { Module } from "@nestjs/common";
import { MessagingModule } from "../messaging/messaging.module";
import { DemoController } from "./demo.controller";
import { DemoVitalisResetService } from "./demo-vitalis-reset.service";
import { DemoMultiController } from "./demo-multi.controller";
import { DemoCleanupCronController } from "./demo-cleanup-cron.controller";
import { DemoMultiTenantService } from "./demo-multi-tenant.service";
import { DemoFounderNotificationService } from "./demo-founder-notification.service";
import { DemoAbuseProtectionService } from "./demo-abuse-protection.service";

@Module({
  imports: [MessagingModule],
  controllers: [DemoController, DemoMultiController, DemoCleanupCronController],
  providers: [
    DemoVitalisResetService,
    DemoMultiTenantService,
    DemoFounderNotificationService,
    DemoAbuseProtectionService,
  ],
})
export class DemoModule {}
