import { IsIn } from "class-validator";

export class CreateCommercialCheckoutDto {
  @IsIn(["trial_card", "pay_now"], {
    message: "paymentPreference must be either 'trial_card' or 'pay_now'.",
  })
  paymentPreference!: "trial_card" | "pay_now";
}
