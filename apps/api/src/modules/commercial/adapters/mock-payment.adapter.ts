import { Injectable, Logger } from "@nestjs/common";
import type {
  CheckoutSession,
  PaymentAdapter,
  PaymentConfirmation,
} from "./payment.adapter";

/**
 * Mock payment adapter for development and testing
 * Simulates Stripe behavior without actual charges
 * Always confirms payments immediately
 */
@Injectable()
export class MockPaymentAdapter implements PaymentAdapter {
  private readonly logger = new Logger(MockPaymentAdapter.name);
  private readonly sessions = new Map<string, CheckoutSession>();

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
    const reference = `mock_${Date.now()}_${onboardingId}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const session: CheckoutSession = {
      id: `session_mock_${onboardingId}`,
      reference,
      url:
        `${process.env.WEB_URL || "http://localhost:3000"}/checkout?token=${onboardingPublicToken}` +
        `&session_id=${reference}`,
      expiresAt,
      status: "created",
    };

    this.sessions.set(reference, session);
    this.logger.debug(
      `Mock checkout created: ${reference} for plan ${plan.code}`,
    );

    return session;
  }

  async confirmPayment(reference: string): Promise<PaymentConfirmation> {
    const session = this.sessions.get(reference);

    if (!session) {
      this.logger.warn(`Mock payment not found: ${reference}`);
      return {
        reference,
        status: "failed",
        amount: 0,
        currency: "BRL",
        error: "Payment session not found in mock",
      };
    }

    if (session.expiresAt < new Date()) {
      this.logger.warn(`Mock payment expired: ${reference}`);
      return {
        reference,
        status: "failed",
        amount: 0,
        currency: "BRL",
        error: "Payment session expired",
      };
    }

    // Always confirm in mock (simulates instant payment)
    session.status = "completed";
    this.logger.debug(`Mock payment confirmed: ${reference}`);

    return {
      reference,
      status: "confirmed",
      amount: 34900, // Mock amount for ESTETICA_FLOW
      currency: "BRL",
      paymentMethod: "mock_card",
    };
  }

  async handleWebhookEvent(
    event: Record<string, any>,
  ): Promise<void> {
    this.logger.debug(`Mock webhook received: ${event.type}`);
    // No-op for mock
  }

  verifyWebhookSignature(body: string, signature: string): boolean {
    this.logger.debug(`Mock webhook signature verification (always true)`);
    // Mock always accepts webhooks
    return true;
  }
}
