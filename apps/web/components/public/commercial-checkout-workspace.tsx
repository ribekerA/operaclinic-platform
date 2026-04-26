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
  Sparkles,
} from "lucide-react";
import type { CommercialOnboardingSummaryPayload } from "@operaclinic/shared";
import { CommercialPlanGrid } from "@/components/public/commercial-plan-grid";
import { mapCommercialPlanToPublicPlan } from "@/components/public/public-content";
import { Card } from "@/components/ui/card";
import { toErrorMessage } from "@/lib/client/http";
import {
  confirmCommercialCheckout,
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

type CheckoutAction = "confirm" | "finalize" | "setup_access" | null;

const statusCopy: Record<
  CommercialOnboardingSummaryPayload["status"],
  {
    label: string;
    description: string;
  }
> = {
  INITIATED: {
    label: "Cadastro pendente",
    description:
      "O plano ja foi escolhido. Agora faltam os dados da clinica estetica e do admin para seguir.",
  },
  AWAITING_PAYMENT: {
    label: "Checkout aguardando confirmacao",
    description:
      "Os dados da clinica estetica ja foram gravados. Falta confirmar a etapa comercial desta demonstracao.",
  },
  PAID: {
    label: "Pronto para criar o ambiente",
    description:
      "O checkout ja foi marcado como pago neste ambiente. Agora o onboarding pode criar tenant, clinica e admin.",
  },
  ONBOARDING_STARTED: {
    label: "Onboarding em andamento",
    description:
      "A criacao inicial da clinica estetica ja foi iniciada. Aguarde a finalizacao do ambiente.",
  },
  ONBOARDING_COMPLETED: {
    label: "Ambiente inicial pronto",
    description:
      "A clinica estetica ja tem tenant, unidade inicial, admin convidado e caminho seguro para ativar a senha antes do login.",
  },
  ESCALATED_TO_STAFF: {
    label: "Solicitação escalada para suporte",
    description:
      "Sua solicitação foi direcionada para nosso time de suporte. Entraremos em contato em breve.",
  },
  EXPIRED: {
    label: "Onboarding expirado",
    description:
      "A jornada comercial passou do prazo seguro e precisa ser reiniciada a partir da escolha do plano.",
  },
};

function buildClinicLoginHref(
  onboarding: CommercialOnboardingSummaryPayload,
): string {
  const params = new URLSearchParams({
    source: "checkout",
  });

  if (onboarding.login.email) {
    params.set("email", onboarding.login.email);
  }

  if (onboarding.clinic.displayName) {
    params.set("clinic", onboarding.clinic.displayName);
  }

  if (onboarding.clinic.contactEmail) {
    params.set("clinicEmail", onboarding.clinic.contactEmail);
  }

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
          "Nao foi possivel carregar o checkout comercial agora.",
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
  }, [
    onboardingToken,
    checkoutSucceeded,
    checkoutSessionId,
    checkoutCancelled,
  ]);

  async function handleConfirmCheckout(sessionId?: string): Promise<void> {
    if (!onboardingToken) {
      return;
    }

    setAction("confirm");
    setError(null);
    setAccessMessage(null);
    setAccessPreviewUrl(null);

    try {
      const response = await confirmCommercialCheckout(onboardingToken, sessionId);
      setOnboarding(response);
    } catch (actionError) {
      setError(
        toErrorMessage(
          actionError,
          "Nao foi possivel confirmar a etapa comercial agora.",
        ),
      );
    } finally {
      setAction(null);
    }
  }

  async function handleFinalizeOnboarding(): Promise<void> {
    if (!onboardingToken) {
      return;
    }

    setAction("finalize");
    setError(null);
    setAccessMessage(null);
    setAccessPreviewUrl(null);

    try {
      const response = await finalizeCommercialOnboarding(onboardingToken);
      setOnboarding(response);
    } catch (actionError) {
      setError(
        toErrorMessage(
          actionError,
          "Nao foi possivel finalizar o onboarding inicial agora.",
        ),
      );
    } finally {
      setAction(null);
    }
  }

  async function handlePrepareAccess(): Promise<void> {
    if (!onboarding?.admin.email) {
      setError("O email do admin ainda nao esta disponivel para ativacao do acesso.");
      return;
    }

    setAction("setup_access");
    setError(null);
    setAccessMessage(null);
    setAccessPreviewUrl(null);

    try {
      const response = await requestPasswordReset({
        email: onboarding.admin.email,
      });

      setAccessMessage(
        response.resetUrlPreview
          ? "A ativacao da senha foi preparada. Neste ambiente, o link seguro aparece abaixo."
          : "A ativacao da senha foi preparada. O proximo passo e concluir a definicao da senha pelo fluxo seguro de recuperacao.",
      );
      setAccessPreviewUrl(response.resetUrlPreview ?? null);
    } catch (requestError) {
      setError(
        toErrorMessage(
          requestError,
          "Nao foi possivel preparar a ativacao de acesso agora.",
        ),
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
              O checkout comercial precisa nascer de um plano publico real.
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-muted">
              Escolha o plano que melhor encaixa a operacao da sua clinica
              estetica. O OperaClinic cria um onboarding comercial proprio para
              esse contexto e segue com o fluxo ate o acesso.
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
            Checkout indisponivel
          </p>
          <h2 className="text-3xl font-semibold leading-tight text-ink">
            Nao encontramos este onboarding comercial.
          </h2>
          <p className="text-sm leading-7 text-muted">
            O link pode ter expirado ou a jornada comercial ainda nao foi
            iniciada corretamente. Escolha um plano publico para recomecar.
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

  return (
    <div className="space-y-6">
      {checkoutCancelled ? (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              O checkout foi cancelado antes da confirmacao. Quando quiser, voce pode retomar a cobranca com seguranca por esta mesma jornada.
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
                Definir senha do admin agora
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
                    Checkout comercial real
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
                  Estado atual
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
                    Proximo passo
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {onboarding.nextStep === "complete_registration"
                      ? "Completar os dados da clinica estetica e do admin."
                      : onboarding.nextStep === "confirm_checkout"
                        ? "Confirmar a etapa comercial neste ambiente."
                        : onboarding.nextStep === "finalize_onboarding"
                          ? "Criar tenant, clinica estetica, unidade inicial e admin."
                          : onboarding.nextStep === "restart_onboarding"
                            ? "Reiniciar a jornada comercial com um novo onboarding."
                            : "Seguir para o login da clinica estetica com o admin criado."}
                  </p>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Dados da clinica
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {onboarding.clinic.displayName
                      ? `${onboarding.clinic.displayName} · ${onboarding.clinic.contactEmail ?? "email pendente"}`
                      : "A clinica estetica ainda nao teve os dados principais preenchidos."}
                  </p>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Admin responsavel
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {onboarding.admin.email
                      ? `${onboarding.admin.fullName ?? "Responsavel"} · ${onboarding.admin.email}`
                      : "O responsavel pela clinica estetica ainda nao foi definido."}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card tone="dark" className="rounded-[30px] border-slate-200 p-7 shadow-[0_30px_100px_-56px_rgba(15,23,42,0.92)]">
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-200">
                    Acao principal
                  </p>
                  <h3 className="mt-3 text-3xl font-semibold leading-tight">
                    Continue a jornada comercial da clinica estetica.
                  </h3>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-white/10">
                  <CreditCard className="h-6 w-6 text-teal-200" />
                </div>
              </div>

              {onboarding.nextStep === "complete_registration" ? (
                <>
                  <p className="text-sm leading-7 text-slate-300">
                    O plano ja esta reservado neste onboarding. Agora faltam os
                    dados da clinica estetica, da unidade inicial e do admin.
                  </p>
                  <Link
                    href={`/cadastro?token=${encodeURIComponent(onboardingToken)}`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100"
                  >
                    Ir para cadastro da clinica estetica
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              ) : null}

              {onboarding.nextStep === "confirm_checkout" ? (
                <>
                  <p className="text-sm leading-7 text-slate-300">
                    Neste ambiente, a etapa comercial continua simulada. O backend
                    segue registrando o estado real do onboarding, sem misturar
                    isso com o login ou com a operacao autenticada.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleConfirmCheckout()}
                    disabled={isConfirming || !onboarding.payment.mockConfirmationAvailable}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isConfirming ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : null}
                    {isConfirming
                      ? "Confirmando checkout..."
                      : onboarding.payment.mockConfirmationAvailable
                        ? "Confirmar checkout de demonstracao"
                        : "Aguardando confirmacao externa"}
                  </button>
                </>
              ) : null}

              {onboarding.nextStep === "finalize_onboarding" ? (
                <>
                  <p className="text-sm leading-7 text-slate-300">
                    Agora o backend pode criar tenant, clinica estetica, unidade inicial,
                    usuario admin e vinculo do plano escolhido em uma unica
                    operacao transacional.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleFinalizeOnboarding()}
                    disabled={isFinalizing}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isFinalizing ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : null}
                    {isFinalizing
                      ? "Criando ambiente inicial..."
                      : "Criar ambiente inicial da clinica estetica"}
                  </button>
                </>
              ) : null}

              {onboarding.nextStep === "login_clinic" ? (
                <>
                  <div className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-slate-300">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-teal-200" />
                      <div>
                        <p className="font-semibold text-white">
                          Tenant, clinica estetica, unidade inicial e admin criados.
                        </p>
                        <p className="mt-1">
                          O proximo passo agora e ativar a senha do admin em um
                          fluxo separado. So depois disso o login da clinica
                          estetica fica liberado.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-slate-300">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-200">
                      Dados consolidados da clinica
                    </p>
                    <p className="mt-2">
                      Clinica: {onboarding.clinic.displayName ?? "nao informada"}
                    </p>
                    <p>
                      Email da clinica: {onboarding.clinic.contactEmail ?? "nao informado"}
                    </p>
                    <p>
                      Email do admin: {onboarding.admin.email ?? "nao informado"}
                    </p>
                  </div>

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
                      ? "Preparando ativacao..."
                      : "Preparar ativacao da senha do admin"}
                  </button>

                  <Link
                    href={buildClinicLoginHref(onboarding)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Ir para o login da clinica estetica
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              ) : null}

              {onboarding.nextStep === "restart_onboarding" ? (
                <>
                  <p className="text-sm leading-7 text-slate-300">
                    Este onboarding expirou para reduzir risco de abuso e
                    evitar reaproveitamento indefinido do token publico. Escolha
                    novamente o plano para gerar um novo fluxo comercial.
                  </p>
                  <Link
                    href="/planos"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100"
                  >
                    Reiniciar pelos planos
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
                    Separacao correta
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold leading-tight text-ink">
                    Checkout publico, acesso autenticado separado.
                  </h3>
                </div>
              </div>
              <p className="text-sm leading-7 text-muted">
                Esta etapa continua na camada publica/comercial. O login da
                clinica estetica so entra em cena depois que o backend conclui o
                onboarding inicial.
              </p>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-700">
                {onboarding.payment.reference
                  ? `Referencia atual do checkout: ${onboarding.payment.reference}.`
                  : "Ainda nao existe referencia de pagamento registrada para este onboarding."}
              </div>
            </div>
          </Card>

          <Card className="rounded-[30px] border-slate-200 bg-gradient-to-b from-white to-slate-50 p-7">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accentSoft">
                  <Sparkles className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                    Jornada comercial
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold leading-tight text-ink">
                    O backend continua dono do estado do onboarding.
                  </h3>
                </div>
              </div>
              <p className="text-sm leading-7 text-muted">
                O frontend nao simula status. Ele le o onboarding comercial real,
                persiste os dados da clinica estetica e acompanha a transicao ate o login.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
