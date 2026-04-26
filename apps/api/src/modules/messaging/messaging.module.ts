import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { AgentModule } from "../agent/agent.module";
import { HandoffsController } from "./handoffs.controller";
import { HandoffRequestsService } from "./handoff-requests.service";
import { IntegrationConnectionsService } from "./integration-connections.service";
import { IntegrationsController } from "./integrations.controller";
import { MessageTemplatesController } from "./message-templates.controller";
import { MessageTemplatesService } from "./message-templates.service";
import { MessageThreadsController } from "./message-threads.controller";
import { MessageThreadsService } from "./message-threads.service";
import { MessagingAccessService } from "./messaging-access.service";
import { MessagingPatientLinkService } from "./messaging-patient-link.service";
import { MessagingWebhookAbuseProtectionService } from "./messaging-webhook-abuse-protection.service";
import { WhatsappWebhooksController } from "./whatsapp-webhooks.controller";
import { WhatsappWebhooksService } from "./whatsapp-webhooks.service";
import { MessagingProviderFactory } from "./adapters/messaging-provider.factory";
import { MessagingGateway } from "./gateways/messaging.gateway";
import { MetaWhatsAppAdapter } from "./adapters/meta-whatsapp.adapter";
import { MockWhatsAppAdapter } from "./adapters/mock-whatsapp.adapter";

@Module({
  imports: [AuthModule, forwardRef(() => AgentModule)],
  controllers: [
    MessageThreadsController,
    HandoffsController,
    MessageTemplatesController,
    IntegrationsController,
    WhatsappWebhooksController,
  ],
  providers: [
    MessagingAccessService,
    MessagingPatientLinkService,
    MessagingWebhookAbuseProtectionService,
    MessageThreadsService,
    HandoffRequestsService,
    MessageTemplatesService,
    IntegrationConnectionsService,
    WhatsappWebhooksService,
    MockWhatsAppAdapter,
    MetaWhatsAppAdapter,
    MessagingProviderFactory,
    MessagingGateway,
  ],
  exports: [
    HandoffRequestsService,
    MessageThreadsService,
  ],
})
export class MessagingModule {}
