import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IntegrationProvider } from "@prisma/client";
import { EvolutionWhatsAppAdapter } from "../messaging/adapters/evolution-whatsapp.adapter";
import type { ProviderConnectionContext } from "../messaging/adapters/messaging-provider.adapter";

export interface NotifyFounderInput {
  leadClinicName: string;
  patientName: string;
  serviceName: string;
  startsAt: Date;
}

@Injectable()
export class DemoFounderNotificationService {
  private readonly logger = new Logger(DemoFounderNotificationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly evolutionAdapter: EvolutionWhatsAppAdapter,
  ) {}

  async notifyFounderOfDemoBooking(input: NotifyFounderInput): Promise<void> {
    const recipientPhoneNumber = this.configService.get<string>(
      "DEMO_FOUNDER_WHATSAPP_NUMBER",
      "",
    );
    const instanceName = this.configService.get<string>(
      "EVOLUTION_DEMO_INSTANCE_NAME",
      "",
    );

    if (!recipientPhoneNumber.trim() || !instanceName.trim()) {
      this.logger.warn(
        "DEMO_FOUNDER_WHATSAPP_NUMBER or EVOLUTION_DEMO_INSTANCE_NAME not configured, skipping founder notification.",
      );
      return;
    }

    const connection: ProviderConnectionContext = {
      provider: IntegrationProvider.WHATSAPP_EVOLUTION,
      connectionId: "demo-founder-bridge",
      displayName: "Demo Founder Bridge",
      externalAccountId: instanceName,
      config: null,
    };

    const formattedDate = input.startsAt.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });

    const text = [
      `Novo agendamento na demo — ${input.leadClinicName}`,
      `${input.patientName} agendou ${input.serviceName} em ${formattedDate}.`,
    ].join("\n");

    try {
      await this.evolutionAdapter.sendTextMessage({
        connection,
        connectionId: connection.connectionId,
        recipientPhoneNumber,
        text,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to notify founder of demo booking for "${input.leadClinicName}": ${message}`,
      );
    }
  }
}
