"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  CreditCard,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import type { CommercialOnboardingSummaryPayload } from "@operaclinic/shared";
import { CommercialPlanGrid } from "@/components/public/commercial-plan-grid";
import { OnboardingProgress } from "@/components/public/onboarding-progress";
import { mapCommercialPlanToPublicPlan } from "@/components/public/public-content";
import { PublicSectionHeading } from "@/components/public/public-section-heading";
import { Card } from "@/components/ui/card";
import { toErrorMessage } from "@/lib/client/http";
import {
  confirmCommercialCheckout,
  createStripeCheckout,
  finalizeCommercialOnboarding,
  getCommercialOnboarding,
} from "@/lib/client/commercial-api";
import { requestPasswordReset } from "@/lib/client/platform-identity-api";

interface CommercialCheckoutWorkspaceProps {
  onboardingToken?: string | null;
  checkoutSessionId?: string | null;
  checkoutSucceeded?: boolean;
  checkoutCancelled?: boolean;
}

type CheckoutAction = "confirm" | "finalize" | "setup_access" | "stripe_redirect" | null;

const statusCopy: Record<
  CommercialOnboardingSummaryPayload["status"],
  { label: string; description: string }
> = {
  INITIATED: {
    label: "Plano escolhido",
    description:
      "O plano foi reservado. Preencha os dados da sua clínica estética para continuar.",
  },
  AWAITING_PAYMENT: {
    label: "Dados preenchidos",
    description:
      "Tudo certo com o cadastro. O próximo passo é confirmar o pagamento.",
  },
  PAID: {
    label: "Pagamento confirmado",
    description:
      "Perfeito! Agora vamos criar o ambiente inicial da sua clínica estética.",
  },
  ONBOARDING_STARTED: {
    label: "Criando seu ambiente",
    description:
      "Estamos configurando tudo para a sua clínica estética. Aguarde um instante.",
  },
  ONBOARDING_COMPLETED: {
    label: "Ambiente pronto",
    description:
      "Sua clínica estética está criada e pronta para o primeiro acesso.",
  },
  ESCALATED_TO_STAFF: {
    label: "Solicitação em análise",
    description:
      "Nossa equipe está verificando sua solicitação e entrará em contato em breve.",
  },
  EXPIRED: {
    label: "Link expirado",
    description:
      "Por segurança, este link expirou. Inicie novamente a partir da escolha do plano.",
  },
};

function buildClinicLoginHref(
  onboarding: CommercialOnboardingSummaryPayload,
): string {
  const params = new URLSearchParams({ source: "checkout" });

  if (onboarding.login.email) params.set("email", onboarding.login.email);
  if (onboarding.clinic.displayName) params.set("clinic", onboarding.clinic.displayName);
  if (onboarding.clinic.contactEmail) params.set("clinicEmail", onboarding.clinic.contactEmail);

  return `/login/clinic?${params.toString()}`;
}

function CheckoutSkeleton() {
  return (
    <div className="grid gap-8 xl:grid-cols-[1.02fr_0.98fr]">
      <Card className="rounded-[30px] border-slate-200 bg-white p-7">
        <div className="space-y-4 animate-pulse">
          <div className="h-4 w-36 rounded-full bg-slate-200" />
          <div className="h-10 w-3/4 rounded-full bg-slate-200" />
          <div className="h-5 w-5/6 rounded-full bg-slate-200" />
          <div className="grid gap-3">
            <div className="h-16 rounded-2xl bg-slate-100" />
            <div className="h-16 rounded-2xl bg-slate-100" />
            <div className="h-16 rounded-2xl bg-slate-100" />
          </div>
        </div>
      </Card>
      <Card className="rounded-[30px] border-slate-200 bg-white p-7">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-2/3 rounded-full bg-slate-200" />
          <div className="h-4 w-full rounded-full bg-slate-200" />
          <div className="h-4 w-5/6 rounded-full bg-slate-200" />
          <div className="h-14 rounded-2xl bg-slate-100" />
        </div>
      </Card>
    </div>
  );
}

function CelebrationBanner({ clinicName }: { clinicName: string | null }) {
  return (
    <div className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-teal-600 to-teal-800 px-7 py-8 shadow-[0_20px_60px_-20px_rgba(15,118,110,0.5)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="absolute left-[8%] top-[25%] h-3 w-3 rounded-full bg-white/30 animate-ping [animation-duration:2.2s]" />
        <span className="absolute right-[12%] top-[35%] h-2 w-2 rounded-full bg-white/20 animate-ping [animation-duration:3.1s] [animation-delay:0.4s]" />
        <span className="absolute left-[28%] bottom-[25%] h-2 w-2 rounded-full bg-white/25 animate-ping [animation-duration:2.7s] [animation-delay:0.9s]" />
        <span className="absolute right-[22%] bottom-[30%] h-4 w-4 rounded-full bg-white/10 animate-ping [animation-duration:4s] [animation-delay:0.2s]" />
        <span className="absolute left-[60%] top-[15%] h-2 w-2 rounded-full bg-white/15 animate-ping [animation-duration:3.5s] [animation-delay:0.6s]" />
        <span className="absolute left-[18%] bottom-[40%] h-1.5 w-1.5 rounded-full bg-white/20 animate-ping [animation-duration:2.9s] [animation-delay:1.2s]" />
      </div>
      <div className="relative flex items-center gap-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 ring-2 ring-white/30">
          <CheckCircle2 className="h-7 w-7 text-white" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-teal-200">
            Missão cumprida
          </p>
          <h2 className="mt-1 text-2xl font-semibold leading-tight text-white">
            {clinicName
              ? `${clinicName} está pronta!`
              : "Sua clínica estética está pronta!"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-teal-100">
            Ambiente criado. Ative a senha do responsável para acessar o painel.
          </p>
        </div>
      </div>
    </div>
  );
}

function MiniProgress({
  steps,
}: {
  steps: Array<{ label: string; status: "done" | "active" | "pending" }>;
}) {
  return (
    <div className="grid gap-2 rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
      {steps.map((step) => (
        <div key={step.label} className="flex items-center gap-2 text-xs">
          {step.status === "done" ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-teal-300" />
          ) : step.status === "active" ? (
            <span className="h-3.5 w-3.5 shrink-0 flex items-center justify-center">
              <span className="h-2 w-2 rounded-full bg-teal-300 animate-pulse" />
            </span>
          ) : (
            <span className="h-3.5 w-3.5 shrink-0 flex items-center justify-center rounded-full bg-white/10 text-[10px] text-slate-500">
              ·
            </span>
          )}
          <span
            className={
              step.status === "done"
                ? "text-slate-300"
                : step.status === "active"
                  ? "font-medium text-slate-200"
                  : "text-slate-500"
            }
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CommercialCheckoutWorkspace({
  onboardingToken,
  checkoutSessionId,
  checkoutSucceeded = false,
  checkoutCancelled = false,
}: CommercialCheckoutWorkspaceProps) {
  const [onboarding, setOnboarding] =
    useState<CommercialOnboardingSummaryPayload | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(onboardingToken));
  const [action, setAction] = useState<CheckoutAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [accessPreviewUrl, setAccessPreviewUrl] = useState<string | null>(null);
  const [paymentPreference, setPaymentPreference] = useState<
    "trial_card" | "pay_now"
  >("trial_card");
  const hasHandledStripeReturnRef = useRef(false);

  async function loadOnboarding(): Promise<void> {
    if (!onboardingToken) {
      setOnboarding(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await getCommercialOnboarding(onboardingToken);
      setOnboarding(response);
    } catch (loadError) {
      setError(
        toErrorMessage(
          loadError,
          "Não foi possível carregar o checkout agora. Tente novamente.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOnboarding();
  }, [onboardingToken]);

  useEffect(() => {
    if (
      !onboardingToken ||
      !checkoutSucceeded ||
      !checkoutSessionId ||
      checkoutCancelled ||
      hasHandledStripeReturnRef.current
    ) {
      return;
    }

    hasHandledStripeReturnRef.current = true;
    void handleConfirmCheckout(checkoutSessionId);
  }, [onboardingToken, checkoutSucceeded, checkoutSessionId, checkoutCancelled]);

  // Auto-finaliza o ambiente assim que o pagamento é confirmado
  useEffect(() => {
    if (
      onboarding?.nextStep === "finalize_onboarding" &&
      action === null &&
      !error
    ) {
      void handleFinalizeOnboarding();
    }
  }, [onboarding?.nextStep, action, error]);

  async function handleStripeRedirect(): Promise<void> {
    if (!onboardingToken) return;

    setAction("stripe_redirect");
    setError(null);

    try {
      const { checkoutUrl } = await createStripeCheckout(
        onboardingToken,
        paymentPreference,
      );
      window.location.href = checkoutUrl;
    } catch (actionError) {
      setError(
        toErrorMessage(actionError, "Não foi possível iniciar o pagamento. Tente novamente."),
      );
      setAction(null);
    }
  }

  async function handleConfirmCheckout(sessionId?: string): Promise<void> {
    if (!onboardingToken) return;

    setAction("confirm");
    setError(null);
    setAccessMessage(null);
    setAccessPreviewUrl(null);

    try {
      const response = await confirmCommercialCheckout(onboardingToken, sessionId);
      setOnboarding(response);
    } catch (actionError) {
      setError(
        toErrorMessage(actionError, "Não foi possível confirmar o pagamento agora."),
      );
    } finally {
      setAction(null);
    }
  }

  async function handleFinalizeOnboarding(): Promise<void> {
    if (!onboardingToken) return;

    setAction("finalize");
    setError(null);
    setAccessMessage(null);
    setAccessPreviewUrl(null);

    try {
      const response = await finalizeCommercialOnboarding(onboardingToken);
      setOnboarding(response);
    } catch (actionError) {
      setError(
        toErrorMessage(actionError, "Não foi possível criar o ambiente agora. Tente novamente."),
      );
    } finally {
      setAction(null);
    }
  }

  async function handlePrepareAccess(): Promise<void> {
    if (!onboarding?.admin.email) {
      setError("O e-mail do responsável ainda não está disponível para ativação do acesso.");
      return;
    }

    setAction("setup_access");
    setError(null);
    setAccessMessage(null);
    setAccessPreviewUrl(null);

    try {
      const response = await requestPasswordReset({ email: onboarding.admin.email });

      setAccessMessage(
        response.resetUrlPreview
          ? "A senha está pronta para ser ativada. Use o link abaixo para definir sua senha e acessar o painel."
          : "Um e-mail foi enviado com o link para ativar sua senha. Verifique sua caixa de entrada.",
      );
      setAccessPreviewUrl(response.resetUrlPreview ?? null);
    } catch (requestError) {
      setError(
        toErrorMessage(requestError, "Não foi possível preparar o acesso agora. Tente novamente."),
      );
    } finally {
      setAction(null);
    }
  }

  if (!onboardingToken) {
    return (
      <div className="space-y-8">
        <Card className="rounded-[30px] border-slate-200 bg-white p-8">
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              Escolha um plano primeiro
            </p>
            <h2 className="text-3xl font-semibold leading-tight text-ink">
              O checkout começa com a escolha do plano da sua clínica estética.
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-muted">
              Selecione o plano que melhor se encaixa na sua operação. O OperaClinic
              cria um onboarding exclusivo e acompanha a jornada até o acesso.
            </p>
          </div>
        </Card>

        <CommercialPlanGrid mode="detailed" />
      </div>
    );
  }

  if (isLoading && !onboarding) {
    return <CheckoutSkeleton />;
  }

  if (!onboarding) {
    return (
      <Card className="rounded-[30px] border-slate-200 bg-white p-8">
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-600">
            Checkout não encontrado
          </p>
          <h2 className="text-3xl font-semibold leading-tight text-ink">
            Não encontramos este cadastro.
          </h2>
          <p className="text-sm leading-7 text-muted">
            O link pode ter expirado ou a jornada ainda não foi iniciada. Escolha
            um plano para começar.
          </p>
          {error ? (
            <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm leading-6 text-red-700">
              {error}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Link
              href="/planos"
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Ver planos
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => void loadOnboarding()}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-ink transition hover:bg-slate-50"
            >
              <RefreshCcw className="h-4 w-4" />
              Tentar novamente
            </button>
          </div>
        </div>
      </Card>
    );
  }

  const plan = mapCommercialPlanToPublicPlan(onboarding.selectedPlan);
  const status = statusCopy[onboarding.status];
  const isConfirming = action === "confirm";
  const isFinalizing = action === "finalize";
  const isRedirecting = action === "stripe_redirect";
  const isClinicReady = onboarding.nextStep === "login_clinic";

  // Dark card dynamic header based on current step
  const cardEyebrow = (() => {
    if (isFinalizing || onboarding.nextStep === "finalize_onboarding") return "Criando seu ambiente";
    if (isClinicReady) return "Missão cumprida";
    if (onboarding.nextStep === "complete_registration") return "Etapa 1 concluída";
    if (onboarding.nextStep === "confirm_checkout") return "Quase lá";
    if (onboarding.nextStep === "restart_onboarding") return "Link expirado";
    return "Próximo passo";
  })();

  const cardTitle = (() => {
    if (isFinalizing || onboarding.nextStep === "finalize_onboarding")
      return "Estamos montando tudo para a sua clínica estética.";
    if (isClinicReady) return "Tudo pronto. Ative a senha para começar.";
    if (onboarding.nextStep === "complete_registration")
      return "Plano reservado. Complete o cadastro para avançar ao pagamento.";
    if (onboarding.nextStep === "confirm_checkout")
      return "Confirme o pagamento e sua clínica será criada.";
    if (onboarding.nextStep === "restart_onboarding")
      return "Inicie novamente para criar sua clínica estética.";
    return "Continue a jornada da sua clínica estética.";
  })();

  const pageHeading = (() => {
    if (isClinicReady) return null;
    if (onboarding.nextStep === "complete_registration") return {
      eyebrow: "Sua clínica estética",
      title: "Plano reservado. Complete o cadastro para avançar ao pagamento.",
      description: "Preencha os dados da clínica e do responsável pelo acesso. O pagamento só ocorre na próxima etapa.",
    };
    if (onboarding.nextStep === "confirm_checkout") return {
      eyebrow: "Quase lá",
      title: "Confirme o pagamento e sua clínica será criada.",
      description: "Você será redirecionado para o ambiente seguro de pagamento. Após confirmar, voltará automaticamente para continuar.",
    };
    if (onboarding.nextStep === "restart_onboarding") return {
      eyebrow: "Link expirado",
      title: "Este link não é mais válido.",
      description: "Por segurança, onboardings expiram após 48 horas. Escolha o plano novamente para iniciar uma nova jornada.",
    };
    return {
      eyebrow: "Sua clínica estética",
      title: "Complete o cadastro e ative o acesso ao painel da sua clínica.",
      description: "Acompanhe cada etapa da jornada: plano escolhido, dados da clínica, pagamento e acesso do responsável.",
    };
  })();

  return (
    <div className="space-y-8 pb-8">
      {pageHeading ? (
        <section>
          <PublicSectionHeading
            eyebrow={pageHeading.eyebrow}
            title={pageHeading.title}
            description={pageHeading.description}
          />
        </section>
      ) : null}

      <div className="space-y-6">
      <OnboardingProgress
        currentStep={
          isClinicReady
            ? 4
            : onboarding.nextStep === "complete_registration"
              ? 2
              : 3
        }
        token={onboardingToken}
      />

      {isClinicReady ? (
        <CelebrationBanner clinicName={onboarding.clinic.displayName} />
      ) : null}

      {checkoutCancelled ? (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              O pagamento foi cancelado. Quando quiser, você pode retomar por esta mesma jornada.
            </span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm leading-6 text-red-700">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      ) : null}

      {accessMessage ? (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-700">
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{accessMessage}</span>
            </div>
            {accessPreviewUrl ? (
              <Link
                href={accessPreviewUrl}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
              >
                Definir minha senha agora
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[1.02fr_0.98fr] xl:items-start">
        <div className="space-y-6">
          <Card className="rounded-[30px] border-slate-200 bg-white p-7">
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                    Plano selecionado
                  </p>
                  <h2 className="mt-3 text-4xl font-semibold leading-tight text-ink">
                    {plan.name}
                  </h2>
                </div>
                <div className="rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                  {plan.priceLabel}
                </div>
              </div>

              <p className="text-sm leading-7 text-muted">{plan.summary}</p>

              <div className="grid gap-3">
                {plan.highlights.map((highlight) => (
                  <div
                    key={highlight}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700"
                  >
                    {highlight}
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="rounded-[30px] border-slate-200 bg-white p-7">
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                  Status da jornada
                </p>
                <h3 className="mt-3 text-2xl font-semibold leading-tight text-ink">
                  {status.label}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted">
                  {status.description}
                </p>
              </div>

              <div className="grid gap-3">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Próximo passo
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {onboarding.nextStep === "complete_registration"
                      ? "Preencha os dados da sua clínica estética para continuar."
                      : onboarding.nextStep === "confirm_checkout"
                        ? "Confirme o pagamento para criar o ambiente da clínica."
                        : onboarding.nextStep === "finalize_onboarding"
                          ? "Criar o ambiente inicial da sua clínica estética."
                          : onboarding.nextStep === "restart_onboarding"
                            ? "Iniciar novamente a partir da escolha do plano."
                            : "Definir a senha e acessar o painel da sua clínica."}
                  </p>
                </div>

                {onboarding.clinic.displayName ? (
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Dados da clínica
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {onboarding.clinic.displayName}
                      {onboarding.clinic.contactEmail
                        ? ` · ${onboarding.clinic.contactEmail}`
                        : null}
                    </p>
                  </div>
                ) : null}

                {onboarding.admin.email ? (
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Responsável pelo acesso
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {onboarding.admin.fullName
                        ? `${onboarding.admin.fullName} · `
                        : null}
                      {onboarding.admin.email}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            tone="dark"
            className={`rounded-[30px] border-slate-200 p-7 shadow-[0_30px_100px_-56px_rgba(15,23,42,0.92)] ${isClinicReady ? "relative overflow-hidden" : ""}`}
          >
            {/* Sparkle orbs for clinic-ready state */}
            {isClinicReady ? (
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <span className="absolute left-[5%] top-[20%] h-3 w-3 rounded-full bg-teal-400/20 animate-ping [animation-duration:3s]" />
                <span className="absolute right-[10%] top-[40%] h-2 w-2 rounded-full bg-teal-300/15 animate-ping [animation-duration:4s] [animation-delay:0.6s]" />
                <span className="absolute left-[35%] bottom-[15%] h-2 w-2 rounded-full bg-white/10 animate-ping [animation-duration:3.5s] [animation-delay:1s]" />
                <span className="absolute right-[30%] top-[15%] h-1.5 w-1.5 rounded-full bg-teal-200/20 animate-ping [animation-duration:2.8s] [animation-delay:0.3s]" />
              </div>
            ) : null}

            <div className="relative space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-200">
                    {cardEyebrow}
                  </p>
                  <h3 className="mt-3 text-3xl font-semibold leading-tight">
                    {cardTitle}
                  </h3>
                </div>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-white/10">
                  {isClinicReady ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-300" />
                  ) : isFinalizing || onboarding.nextStep === "finalize_onboarding" ? (
                    <LoaderCircle className="h-6 w-6 animate-spin text-teal-200" />
                  ) : onboarding.nextStep === "restart_onboarding" ? (
                    <CircleAlert className="h-6 w-6 text-amber-300" />
                  ) : (
                    <CreditCard className="h-6 w-6 text-teal-200" />
                  )}
                </div>
              </div>

              {onboarding.nextStep === "complete_registration" ? (
                <>
                  <p className="text-sm leading-7 text-slate-300">
                    Seu plano está reservado. Preencha os dados da sua clínica estética
                    e do responsável pelo acesso para seguir ao pagamento.
                  </p>
                  <Link
                    href={`/cadastro?token=${encodeURIComponent(onboardingToken)}`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100"
                  >
                    Completar dados da clínica
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <MiniProgress
                    steps={[
                      { label: "Plano escolhido", status: "done" },
                      { label: "Dados da clínica", status: "active" },
                      { label: "Pagamento", status: "pending" },
                      { label: "Acesso ao painel", status: "pending" },
                    ]}
                  />
                </>
              ) : null}

              {onboarding.nextStep === "confirm_checkout" ? (
                <>
                  {onboarding.payment.mockConfirmationAvailable ? (
                    <>
                      <p className="text-sm leading-7 text-slate-300">
                        Ambiente de demonstração — confirme o pagamento simulado para
                        avançar.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleConfirmCheckout()}
                        disabled={isConfirming}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isConfirming ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : null}
                        {isConfirming ? "Confirmando..." : "Confirmar pagamento (demo)"}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm leading-7 text-slate-300">
                        Você será redirecionado para o ambiente seguro de pagamento.
                        Após confirmar, voltará automaticamente para continuar.
                      </p>
                      <div className="grid gap-2" role="radiogroup" aria-label="Forma de pagamento">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={paymentPreference === "trial_card"}
                          onClick={() => setPaymentPreference("trial_card")}
                          className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                            paymentPreference === "trial_card"
                              ? "border-teal-300 bg-teal-500/10 text-white"
                              : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                          }`}
                        >
                          <span className="block font-semibold">
                            Cartão com 7 dias grátis
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-400">
                            Cobrança automática após o período de teste. Cancele quando quiser.
                          </span>
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={paymentPreference === "pay_now"}
                          onClick={() => setPaymentPreference("pay_now")}
                          className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                            paymentPreference === "pay_now"
                              ? "border-teal-300 bg-teal-500/10 text-white"
                              : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                          }`}
                        >
                          <span className="block font-semibold">
                            Pagar agora (cartão ou boleto)
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-400">
                            Sem período de teste. Acesso liberado assim que o pagamento for confirmado.
                          </span>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleStripeRedirect()}
                        disabled={isRedirecting}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isRedirecting ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <CreditCard className="h-4 w-4" />
                        )}
                        {isRedirecting
                          ? "Redirecionando..."
                          : paymentPreference === "trial_card"
                            ? "Começar com 7 dias grátis"
                            : "Pagar agora"}
                      </button>
                    </>
                  )}
                  <MiniProgress
                    steps={[
                      { label: "Plano escolhido", status: "done" },
                      { label: "Dados da clínica", status: "done" },
                      { label: "Pagamento", status: "active" },
                      { label: "Acesso ao painel", status: "pending" },
                    ]}
                  />
                </>
              ) : null}

              {onboarding.nextStep === "finalize_onboarding" ? (
                <>
                  {isFinalizing ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-teal-200" />
                        <p className="text-sm font-semibold text-white">
                          Criando sua clínica estética...
                        </p>
                      </div>
                      <div className="grid gap-2 rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-teal-300" />
                          <span>Pagamento confirmado</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                          <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-teal-200" />
                          <span>Criando perfil e unidade da clínica</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="h-3.5 w-3.5 shrink-0 flex items-center justify-center text-base leading-none">·</span>
                          <span>Preparando acesso do responsável</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm leading-7 text-slate-300">
                        Com o pagamento confirmado, vamos criar sua clínica estética,
                        unidade inicial e usuário administrador em uma única etapa.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleFinalizeOnboarding()}
                        disabled={isFinalizing}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Criar minha clínica estética
                      </button>
                    </>
                  )}
                </>
              ) : null}

              {onboarding.nextStep === "login_clinic" ? (
                <>
                  <div className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-slate-300">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-teal-200" />
                      <div>
                        <p className="font-semibold text-white">
                          Clínica estética criada com sucesso.
                        </p>
                        <p className="mt-1">
                          Ative a senha do responsável para liberar o acesso ao
                          painel.
                        </p>
                      </div>
                    </div>
                  </div>

                  {onboarding.clinic.displayName ? (
                    <div className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-slate-300">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-200">
                        Resumo do ambiente criado
                      </p>
                      <p className="mt-2">
                        Clínica:{" "}
                        <span className="font-semibold text-white">
                          {onboarding.clinic.displayName}
                        </span>
                      </p>
                      {onboarding.clinic.contactEmail ? (
                        <p>E-mail da clínica: {onboarding.clinic.contactEmail}</p>
                      ) : null}
                      {onboarding.admin.email ? (
                        <p>Responsável: {onboarding.admin.email}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void handlePrepareAccess()}
                    disabled={action === "setup_access"}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {action === "setup_access" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : null}
                    {action === "setup_access"
                      ? "Preparando acesso..."
                      : "Ativar minha senha"}
                  </button>

                  <Link
                    href={buildClinicLoginHref(onboarding)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Ir para o login da clínica
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              ) : null}

              {onboarding.nextStep === "restart_onboarding" ? (
                <>
                  <p className="text-sm leading-7 text-slate-300">
                    Por segurança, este link expirou. Escolha o plano novamente para
                    iniciar uma nova jornada.
                  </p>
                  <Link
                    href="/planos"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100"
                  >
                    Escolher plano novamente
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              ) : null}
            </div>
          </Card>

          <Card className="rounded-[30px] border-slate-200 bg-white p-7">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accentSoft">
                  <ShieldCheck className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                    Seus dados em segurança
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold leading-tight text-ink">
                    Acesso liberado somente após o pagamento.
                  </h3>
                </div>
              </div>
              <p className="text-sm leading-7 text-muted">
                Nenhuma credencial é criada antes do pagamento ser confirmado. O
                acesso ao painel da clínica só é liberado quando o ambiente está
                completamente pronto.
              </p>
              {onboarding.payment.reference ? (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Referência do pagamento:{" "}
                  <span className="font-mono">{onboarding.payment.reference}</span>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
      </div>
    </div>
  );
}
