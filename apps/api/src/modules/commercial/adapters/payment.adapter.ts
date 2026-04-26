export interface CheckoutSession {
  id: string;
  reference: string;
  url: string;
  expiresAt: Date;
  status: "created" | "expired" | "completed";
}

export interface PaymentConfirmation {
  reference: string;
  status: "confirmed" | "pending" | "failed";
  amount: number;
  currency: string;
  paymentMethod?: string;
  error?: string;
}

export interface PaymentAdapter {
  /**
   * Create a checkout session for a plan
   */
  createCheckout(
    plan: {
      id: string;
      code: string;
      priceCents: number;
      currency: string;
    },
    onboardingId: string,
    onboardingPublicToken: string,
  ): Promise<CheckoutSession>;

  /**
   * Confirm payment by reference
   */
  confirmPayment(reference: string): Promise<PaymentConfirmation>;

  /**
   * Handle webhook events from provider
   */
  handleWebhookEvent(event: Record<string, any>): Promise<void>;

  /**
   * Verify webhook signature
   * @throws if signature is invalid
   */
  verifyWebhookSignature(body: string, signature: string): boolean;
}
