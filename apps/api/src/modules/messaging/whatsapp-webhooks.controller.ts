import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import type { MessagingWhatsappWebhookResponsePayload } from "@operaclinic/shared";
import type { Request } from "express";
import { WhatsappWebhooksService } from "./whatsapp-webhooks.service";

@Controller("webhooks/whatsapp")
export class WhatsappWebhooksController {
  constructor(
    private readonly whatsappWebhooksService: WhatsappWebhooksService,
  ) {}

  @Get()
  async verifyWebhook(
    @Req() request: Request,
    @Query() query: Record<string, unknown>,
  ): Promise<string | { ok: true; channel: "WHATSAPP" }> {
    return this.whatsappWebhooksService.verifyWebhook(request, query);
  }

  @Post()
  async handleInboundWebhook(
    @Req() request: Request,
    @Body() payload: Record<string, unknown>,
  ): Promise<MessagingWhatsappWebhookResponsePayload> {
    return this.whatsappWebhooksService.handleInboundWebhook(request, payload);
  }
}
