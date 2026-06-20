import { CommercialCheckoutWorkspace } from "@/components/public/commercial-checkout-workspace";

interface CheckoutPageProps {
  searchParams?: Promise<{
    token?: string;
    success?: string;
    cancelled?: string;
    session_id?: string;
  }>;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const onboardingToken = resolvedSearchParams.token?.trim() || null;
  const checkoutSessionId = resolvedSearchParams.session_id?.trim() || null;
  const checkoutSucceeded = resolvedSearchParams.success === "true";
  const checkoutCancelled = resolvedSearchParams.cancelled === "true";

  return (
    <div className="space-y-12 pb-8">
      <CommercialCheckoutWorkspace
        onboardingToken={onboardingToken}
        checkoutSessionId={checkoutSessionId}
        checkoutSucceeded={checkoutSucceeded}
        checkoutCancelled={checkoutCancelled}
      />
    </div>
  );
}
