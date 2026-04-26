import { CommercialCheckoutWorkspace } from "@/components/public/commercial-checkout-workspace";
import { PublicSectionHeading } from "@/components/public/public-section-heading";

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
      <section className="space-y-5">
        <PublicSectionHeading
          eyebrow="Checkout comercial"
          title="A jornada comercial agora le o onboarding real da sua clinica estetica"
          description="O checkout nao depende mais de query string de placeholder. Ele acompanha o plano escolhido, o estado do onboarding e a transicao segura ate o acesso da clinica estetica."
        />
      </section>

      <CommercialCheckoutWorkspace
        onboardingToken={onboardingToken}
        checkoutSessionId={checkoutSessionId}
        checkoutSucceeded={checkoutSucceeded}
        checkoutCancelled={checkoutCancelled}
      />
    </div>
  );
}
