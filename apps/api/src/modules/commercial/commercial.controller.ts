import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import type {
  CommercialOnboardingSummaryPayload,
  CommercialPlanSummaryPayload,
  CommercialStartOnboardingResponsePayload,
} from "@operaclinic/shared";
import type { Request } from "express";
import { CommercialAbuseProtectionService } from "./commercial-abuse-protection.service";
import { CommercialService } from "./commercial.service";
import { CompleteCommercialOnboardingDto } from "./dto/complete-commercial-onboarding.dto";
import { StartCommercialOnboardingDto } from "./dto/start-commercial-onboarding.dto";

@Controller("commercial")
export class CommercialController {
  constructor(
    private readonly commercialService: CommercialService,
    private readonly abuseProtectionService: CommercialAbuseProtectionService,
  ) {}

  @Get("plans")
  async listPublicPlans(): Promise<CommercialPlanSummaryPayload[]> {
    return this.commercialService.listPublicPlans();
  }

  @Post("onboarding/start")
  async startOnboarding(
    @Req() request: Request,
    @Body() input: StartCommercialOnboardingDto,
  ): Promise<CommercialStartOnboardingResponsePayload> {
    this.abuseProtectionService.assertWithinLimit(request, "start_onboarding");
    return this.commercialService.startOnboarding(input);
  }

  @Get("onboarding/:publicToken")
  async getOnboarding(
    @Req() request: Request,
    @Param("publicToken") publicToken: string,
  ): Promise<CommercialOnboardingSummaryPayload> {
    this.abuseProtectionService.assertWithinLimit(request, "get_onboarding");
    return this.commercialService.getOnboarding(publicToken);
  }

  @Post("onboarding/:publicToken/complete")
  async completeOnboarding(
    @Req() request: Request,
    @Param("publicToken") publicToken: string,
    @Body() input: CompleteCommercialOnboardingDto,
  ): Promise<CommercialOnboardingSummaryPayload> {
    this.abuseProtectionService.assertWithinLimit(request, "complete_onboarding");
    return this.commercialService.completeOnboarding(publicToken, input);
  }

  @Post("onboarding/:publicToken/create-checkout")
  async createCheckout(
    @Req() request: Request,
    @Param("publicToken") publicToken: string,
  ): Promise<{ checkoutUrl: string; sessionId: string }> {
    this.abuseProtectionService.assertWithinLimit(request, "create_checkout");
    return this.commercialService.createCheckout(publicToken);
  }

  @Post("onboarding/:publicToken/confirm-checkout")
  async confirmCheckout(
    @Req() request: Request,
    @Param("publicToken") publicToken: string,
    @Query("sessionId") sessionId?: string,
  ): Promise<CommercialOnboardingSummaryPayload> {
    this.abuseProtectionService.assertWithinLimit(request, "confirm_checkout");
    return this.commercialService.confirmCheckout(publicToken, sessionId);
  }

  @Post("onboarding/:publicToken/finalize")
  async finalizeOnboarding(
    @Req() request: Request,
    @Param("publicToken") publicToken: string,
  ): Promise<CommercialOnboardingSummaryPayload> {
    this.abuseProtectionService.assertWithinLimit(request, "finalize_onboarding");
    return this.commercialService.finalizeOnboarding(publicToken);
  }

  @Post("onboarding/:publicToken/escalate-to-staff")
  async escalateToStaff(
    @Req() request: Request,
    @Param("publicToken") publicToken: string,
    @Body() body?: { reason?: string },
  ): Promise<CommercialOnboardingSummaryPayload> {
    this.abuseProtectionService.assertWithinLimit(request, "escalate_onboarding");
    return this.commercialService.escalateToStaff(
      publicToken,
      body?.reason || "User requested manual assistance",
    );
  }

  @Post("webhook/payment")
  async handlePaymentWebhook(
    @Req() request: Request,
    @Body() body: Record<string, any>,
  ): Promise<{ received: boolean }> {
    // Webhook does not count against rate limits
    await this.commercialService.handlePaymentWebhook(body, request);
    return { received: true };
  }
}
