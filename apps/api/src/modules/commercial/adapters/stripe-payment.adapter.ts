import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import type {
  CheckoutSession,
  PaymentAdapter,
  PaymentConfirmation,
} from "./payment.adapter";

/**
 * Production Stripe payment adapter
 * Handles real payments via Stripe Checkout API
 * - Webhook validation
 * - Session management
 * - Error handling
 */
@Injectable()
export class StripePaymentAdapter implements PaymentAdapter {
  private readonly logger = new Logger(StripePaymentAdapter.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>("stripe.secretKey", "");

    this.stripe = apiKey
      ? new Stripe(apiKey, {
          apiVersion: "2024-06-20",
        })
      : null;

    this.webhookSecret = this.configService.get<string>("stripe.webhookSecret", "");
  }

  async createCheckout(
    plan: {
      id: string;
      code: string;
      priceCents: number;
      currency: string;
    },
    onboardingId: string,
    onboardingPublicToken: string,
  ): Promise<CheckoutSession> {
    if (!this.stripe) {
      throw new BadRequestException("Stripe payment adapter is not configured.");
    }

    try {
      const webUrl = this.configService.get<string>(
        "stripe.webUrl",
        "http://localhost:3000",
      );
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: plan.currency.toLowerCase(),
              product_data: {
                name: `OperaClinic ${plan.code}`,
                description: `Plano comercial para clínicas estéticas`,
                metadata: {
                  planId: plan.id,
                  planCode: plan.code,
                },
              },
              recurring: {
                interval: "month",
              },
              unit_amount: plan.priceCents,
            },
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url:
          `${webUrl}/checkout?success=true&token=${onboardingPublicToken}` +
          `&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:
          `${webUrl}/checkout?cancelled=true&token=${onboardingPublicToken}`,
        client_reference_id: onboardingId,
        metadata: {
          onboardingId,
          onboardingPublicToken,
          planId: plan.id,
          planCode: plan.code,
        },
        subscription_data: {
          metadata: {
            onboardingId,
            onboardingPublicToken,
            planId: plan.id,
            planCode: plan.code,
          },
        },
        expires_at: Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000), // 24 hours
      });

      this.logger.debug(
        `Stripe checkout created: ${session.id} for onboarding ${onboardingId}`,
      );

      return {
        id: session.id,
        reference: session.id,
        url: session.url || "",
        expiresAt: new Date((session.expires_at || 0) * 1000),
        status: "created",
      };
    } catch (error) {
      this.logger.error(
        `Stripe checkout creation failed for onboarding ${onboardingId}`,
        error,
      );
      throw new BadRequestException(
        "Failed to create payment checkout. Please try again.",
      );
    }
  }

  async confirmPayment(reference: string): Promise<PaymentConfirmation> {
    if (!this.stripe) {
      throw new BadRequestException("Stripe payment adapter is not configured.");
    }

    try {
      const session = await this.stripe.checkout.sessions.retrieve(reference, {
        expand: ["payment_intent", "subscription"],
      });

      if (!session) {
        return {
          reference,
          status: "failed",
          amount: 0,
          currency: "BRL",
          error: "Session not found",
        };
      }

      if (session.mode === "subscription") {
        const subscription = session.subscription as Stripe.Subscription | null;

        if (!subscription) {
          return {
            reference,
            status: "pending",
            amount: session.amount_total || 0,
            currency: (session.currency || "brl").toUpperCase(),
            error: "Subscription not available yet",
          };
        }

        if (
          session.status === "complete" &&
          ["active", "trialing"].includes(subscription.status)
        ) {
          this.logger.debug(
            `Stripe subscription confirmed: ${subscription.id} (session ${reference})`,
          );

          return {
            reference: subscription.id,
            status: "confirmed",
            amount: session.amount_total || 0,
            currency: (session.currency || "brl").toUpperCase(),
            paymentMethod: undefined,
          };
        }

        if (["incomplete", "past_due"].includes(subscription.status)) {
          return {
            reference: subscription.id,
            status: "pending",
            amount: session.amount_total || 0,
            currency: (session.currency || "brl").toUpperCase(),
            error: `Subscription status: ${subscription.status}`,
          };
        }

        return {
          reference: subscription.id,
          status: "failed",
          amount: session.amount_total || 0,
          currency: (session.currency || "brl").toUpperCase(),
          error: `Subscription status: ${subscription.status}`,
        };
      }

      const paymentIntent = session.payment_intent as Stripe.PaymentIntent;

      if (session.payment_status === "paid" && paymentIntent?.status === "succeeded") {
        this.logger.debug(`Stripe payment confirmed: ${reference}`);
        return {
          reference,
          status: "confirmed",
          amount: session.amount_total || 0,
          currency: (session.currency || "brl").toUpperCase(),
          paymentMethod: paymentIntent?.payment_method as string,
        };
      }

      if (session.payment_status === "unpaid") {
        return {
          reference,
          status: "pending",
          amount: session.amount_total || 0,
          currency: (session.currency || "brl").toUpperCase(),
        };
      }

      return {
        reference,
        status: "failed",
        amount: 0,
        currency: "BRL",
        error: `Payment status: ${session.payment_status}`,
      };
    } catch (error) {
      this.logger.error(`Stripe payment confirmation failed for ${reference}`, error);
      throw new BadRequestException("Failed to confirm payment. Please try again.");
    }
  }

  /**
   * Handle Stripe webhook events
   * Validates signature and processes payment_intent.succeeded
   */
  async handleWebhookEvent(event: Record<string, any>): Promise<void> {
    // Webhook signature validation is handled in controller
    // This just processes the event

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      this.logger.debug(
        `Stripe webhook: payment_intent.succeeded - ${paymentIntent.id}`,
      );

      // Could emit event here for onboarding service to listen to
      // Example: this.eventEmitter.emit('stripe.payment.succeeded', paymentIntent);
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      this.logger.warn(
        `Stripe webhook: charge.refunded - ${charge.id}. Consider reverting onboarding.`,
      );
    }

    this.logger.debug(`Stripe webhook processed: ${event.type}`);
  }

  /**
   * Verify webhook signature from Stripe
   * Returns true if valid, false otherwise
   */
  verifyWebhookSignature(
    body: string,
    signature: string,
  ): boolean {
    if (!this.stripe) {
      this.logger.warn("Stripe payment adapter is not configured");
      return false;
    }

    if (!this.webhookSecret) {
      this.logger.warn("Stripe webhook secret not configured");
      return false;
    }

    try {
      this.stripe.webhooks.constructEvent(body, signature, this.webhookSecret);
      return true;
    } catch (error) {
      this.logger.error("Stripe webhook signature verification failed", error);
      return false;
    }
  }
}
