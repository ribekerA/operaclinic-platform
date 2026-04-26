import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PaymentAdapter } from "./payment.adapter";
import { MockPaymentAdapter } from "./mock-payment.adapter";
import { StripePaymentAdapter } from "./stripe-payment.adapter";

type PaymentProvider = "mock" | "stripe";

/**
 * Factory that creates the appropriate payment adapter
 * based on environment configuration
 */
@Injectable()
export class PaymentAdapterFactory {
  private readonly logger = new Logger(PaymentAdapterFactory.name);
  private adapter: PaymentAdapter | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly mockAdapter: MockPaymentAdapter,
    private readonly stripeAdapter: StripePaymentAdapter,
  ) {}

  /**
   * Get the configured payment adapter
   */
  getAdapter(): PaymentAdapter {
    if (this.adapter) {
      return this.adapter;
    }

    const provider = this.getProvider();

    if (provider === "stripe") {
      this.logger.log("Using Stripe payment adapter");
      this.adapter = this.stripeAdapter;
    } else {
      this.logger.warn("Using Mock payment adapter (development only)");
      this.adapter = this.mockAdapter;
    }

    return this.adapter;
  }

  /**
   * Determine which provider to use
   */
  private getProvider(): PaymentProvider {
    const nodeEnv = this.configService.get<string>("app.environment", "development");
    const stripeKey = this.configService.get<string>("stripe.secretKey", "");
    const forceProvider = this.configService.get<PaymentProvider>(
      "payment.provider",
    );

    // Force override if set
    if (forceProvider) {
      return forceProvider;
    }

    // Production requires Stripe
    if (nodeEnv === "production") {
      if (!stripeKey) {
        throw new Error(
          "STRIPE_SECRET_KEY must be set in production environment",
        );
      }
      return "stripe";
    }

    // Development: use Stripe if configured, otherwise mock
    if (stripeKey) {
      return "stripe";
    }

    return "mock";
  }

  /**
   * Reset adapter (useful for tests)
   */
  resetAdapter(): void {
    this.adapter = null;
  }
}
