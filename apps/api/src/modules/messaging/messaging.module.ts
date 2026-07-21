import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { CronGuard } from "../../auth/guards/cron.guard";
import { AgentModule } from "../agent/agent.module";
import { PlatformModule } from "../platform/platform.module";
import { AudioTranscriptionService } from "./audio-transcription.service";
import { AudioTranscriptionSweepCronController } from "./audio-transcription-sweep-cron.controller";
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
import { EvolutionWhatsAppAdapter } from "./adapters/evolution-whatsapp.adapter";
import { MetaWhatsAppAdapter } from "./adapters/meta-whatsapp.adapter";
import { MockWhatsAppAdapter } from "./adapters/mock-whatsapp.adapter";
import { MessageDebounceService } from "./message-debounce.service";
import { MockTranscriptionProvider } from "./transcription/mock-transcription.provider";
import { TranscriptionProviderFactory } from "./transcription/transcription-provider.factory";

@Module({
  imports: [AuthModule, forwardRef(() => AgentModule), PlatformModule],
  controllers: [
    MessageThreadsController,
    HandoffsController,
    MessageTemplatesController,
    IntegrationsController,
    WhatsappWebhooksController,
    AudioTranscriptionSweepCronController,
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
    EvolutionWhatsAppAdapter,
    MessagingProviderFactory,
    MessageDebounceService,
    MessagingGateway,
    MockTranscriptionProvider,
    TranscriptionProviderFactory,
    AudioTranscriptionService,
    CronGuard,
  ],
  exports: [
    HandoffRequestsService,
    MessageThreadsService,
    EvolutionWhatsAppAdapter,
  ],
})
export class MessagingModule {}
