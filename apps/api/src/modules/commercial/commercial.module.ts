import { Module } from "@nestjs/common";
import { CommercialController } from "./commercial.controller";
import { CommercialAdminController } from "./commercial-admin.controller";
import { CommercialAbuseProtectionService } from "./commercial-abuse-protection.service";
import { CommercialService } from "./commercial.service";
import { AuthModule } from "../../auth/auth.module";
import { PlatformModule } from "../platform/platform.module";
import { MockPaymentAdapter } from "./adapters/mock-payment.adapter";
import { StripePaymentAdapter } from "./adapters/stripe-payment.adapter";
import { PaymentAdapterFactory } from "./adapters/payment-adapter.factory";

@Module({
  imports: [PlatformModule, AuthModule],
  controllers: [CommercialController, CommercialAdminController],
  providers: [
    CommercialService,
    CommercialAbuseProtectionService,
    MockPaymentAdapter,
    StripePaymentAdapter,
    PaymentAdapterFactory,
  ],
  exports: [PaymentAdapterFactory],
})
export class CommercialModule {}
