"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CircleAlert,
  CircleCheckBig,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type {
  CommercialOnboardingSummaryPayload,
  CompleteCommercialOnboardingPayload,
} from "@operaclinic/shared";
import { CommercialPlanGrid } from "@/components/public/commercial-plan-grid";
import { OnboardingProgress } from "@/components/public/onboarding-progress";
import { mapCommercialPlanToPublicPlan } from "@/components/public/public-content";
import { Card } from "@/components/ui/card";
import { toErrorMessage } from "@/lib/client/http";
import {
  completeCommercialOnboarding,
  getCommercialOnboarding,
} from "@/lib/client/commercial-api";

interface CommercialRegistrationWorkspaceProps {
  onboardingToken?: string | null;
}

interface RegistrationFormState {
  clinicDisplayName: string;
  clinicLegalName: string;
  clinicDocumentNumber: string;
  clinicContactEmail: string;
  clinicContactPhone: string;
  timezone: string;
  initialUnitName: string;
  adminFullName: string;
  adminEmail: string;
}

const defaultFormState: RegistrationFormState = {
  clinicDisplayName: "",
  clinicLegalName: "",
  clinicDocumentNumber: "",
  clinicContactEmail: "",
  clinicContactPhone: "",
  timezone: "America/Sao_Paulo",
  initialUnitName: "Unidade Principal",
  adminFullName: "",
  adminEmail: "",
};

function buildClinicLoginHref(
  onboarding: CommercialOnboardingSummaryPayload,
): string {
  const params = new URLSearchParams({
    source: "cadastro",
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

function RegistrationSkeleton() {
  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_0.96fr] xl:items-start">
      <Card className="rounded-[30px] border-slate-200 bg-white p-7">
        <div className="space-y-4 animate-pulse">
          <div className="h-4 w-40 rounded-full bg-slate-200" />
          <div className="h-10 w-4/5 rounded-full bg-slate-200" />
          <div className="h-4 w-5/6 rounded-full bg-slate-200" />
          <div className="grid gap-3">
            <div className="h-14 rounded-2xl bg-slate-100" />
            <div className="h-14 rounded-2xl bg-slate-100" />
            <div className="h-14 rounded-2xl bg-slate-100" />
          </div>
        </div>
      </Card>
      <Card className="rounded-[30px] border-slate-200 bg-white p-7">
        <div className="space-y-4 animate-pulse">
          <div className="h-14 rounded-2xl bg-slate-100" />
          <div className="h-14 rounded-2xl bg-slate-100" />
          <div className="h-14 rounded-2xl bg-slate-100" />
          <div className="h-14 rounded-2xl bg-slate-100" />
        </div>
      </Card>
    </div>
  );
}

function toFormState(
  onboarding: CommercialOnboardingSummaryPayload,
): RegistrationFormState {
  return {
    clinicDisplayName: onboarding.clinic.displayName ?? "",
    clinicLegalName: onboarding.clinic.legalName ?? "",
    clinicDocumentNumber: onboarding.clinic.documentNumber ?? "",
    clinicContactEmail: onboarding.clinic.contactEmail ?? "",
    clinicContactPhone: onboarding.clinic.contactPhone ?? "",
    timezone: onboarding.clinic.timezone ?? "America/Sao_Paulo",
    initialUnitName: onboarding.clinic.initialUnitName ?? "Unidade Principal",
    adminFullName: onboarding.admin.fullName ?? "",
    adminEmail: onboarding.admin.email ?? "",
  };
}

export function CommercialRegistrationWorkspace({
  onboardingToken,
}: CommercialRegistrationWorkspaceProps) {
  const router = useRouter();
  const [onboarding, setOnboarding] =
    useState<CommercialOnboardingSummaryPayload | null>(null);
  const [form, setForm] = useState<RegistrationFormState>(defaultFormState);
  const [isLoading, setIsLoading] = useState(Boolean(onboardingToken));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      setForm(toFormState(response));
    } catch (loadError) {
      setError(
        toErrorMessage(
          loadError,
          "Não foi possível carregar o cadastro agora. Tente novamente.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOnboarding();
  }, [onboardingToken]);

  function updateFormField<K extends keyof RegistrationFormState>(
    field: K,
    value: RegistrationFormState[K],
  ): void {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!onboardingToken) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    const payload: CompleteCommercialOnboardingPayload = {
      clinicDisplayName: form.clinicDisplayName,
      clinicLegalName: form.clinicLegalName || undefined,
      clinicDocumentNumber: form.clinicDocumentNumber || undefined,
      clinicContactEmail: form.clinicContactEmail,
      clinicContactPhone: form.clinicContactPhone,
      timezone: form.timezone || undefined,
      initialUnitName: form.initialUnitName || undefined,
      adminFullName: form.adminFullName,
      adminEmail: form.adminEmail,
    };

    try {
      const response = await completeCommercialOnboarding(onboardingToken, payload);
      setOnboarding(response);
      setForm(toFormState(response));
      setSuccess(
        "Cadastro salvo. Redirecionando para o checkout...",
      );
      router.push(`/checkout?token=${encodeURIComponent(onboardingToken)}`);
      router.refresh();
    } catch (submitError) {
      setError(
        toErrorMessage(
          submitError,
          "Não foi possível salvar o cadastro agora. Tente novamente.",
        ),
      );
    } finally {
      setIsSubmitting(false);
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
              O cadastro começa com a escolha do plano da sua clínica estética.
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-muted">
              Selecione o plano que melhor se encaixa na sua operação. O OperaClinic
              cria um onboarding exclusivo para a sua clínica e segue com o fluxo
              até o acesso.
            </p>
          </div>
        </Card>

        <CommercialPlanGrid mode="detailed" />
      </div>
    );
  }

  if (isLoading && !onboarding) {
    return <RegistrationSkeleton />;
  }

  if (!onboarding) {
    return (
      <Card className="rounded-[30px] border-slate-200 bg-white p-8">
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-600">
            Cadastro não encontrado
          </p>
          <h2 className="text-3xl font-semibold leading-tight text-ink">
            Não encontramos este cadastro.
          </h2>
          <p className="text-sm leading-7 text-muted">
            O link pode ter expirado ou a jornada ainda não foi iniciada
            corretamente. Escolha um plano para começar.
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
  const canEditRegistration =
    onboarding.status === "INITIATED" || onboarding.status === "AWAITING_PAYMENT";
  const isExpired = onboarding.status === "EXPIRED";

  return (
    <div className="space-y-6">
      <OnboardingProgress currentStep={2} token={onboardingToken} />

      {success ? (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-700">
          <div className="flex items-start gap-2">
            <CircleCheckBig className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{success}</span>
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

      <div className="grid gap-8 xl:grid-cols-[1fr_0.96fr] xl:items-start">
        <div className="space-y-6">
          <Card className="rounded-[30px] border-slate-200 bg-white p-7">
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                  Plano selecionado
                </p>
                <h2 className="mt-3 text-4xl font-semibold leading-tight text-ink">
                  Dados da clínica
                </h2>
                <p className="mt-3 text-sm leading-7 text-muted">
                  Preencha os dados principais da sua clínica estética e do
                  responsável pelo acesso. A senha será definida após a confirmação
                  do pagamento.
                </p>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Plano escolhido
                </p>
                <p className="mt-2 text-lg font-semibold text-ink">{plan.name}</p>
                <p className="mt-1 text-sm leading-6 text-slate-700">{plan.priceLabel}</p>
              </div>
            </div>
          </Card>

          {canEditRegistration ? (
            <Card className="rounded-[30px] border-slate-200 bg-white p-7">
              <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
                <fieldset className="space-y-4">
                  <legend className="sr-only">Dados da clínica</legend>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                      Clínica
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold leading-tight text-ink">
                      Dados principais
                    </h3>
                  </div>

                  <div className="grid gap-4">
                    <div>
                      <label
                        htmlFor="clinicDisplayName"
                        className="text-xs font-semibold uppercase tracking-[0.12em] text-muted"
                      >
                        Nome da clínica
                      </label>
                      <input
                        id="clinicDisplayName"
                        type="text"
                        value={form.clinicDisplayName}
                        onChange={(event) =>
                          updateFormField("clinicDisplayName", event.target.value)
                        }
                        placeholder="Ex.: Atelier Face Jardins"
                        autoComplete="organization"
                        className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
                        required
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label
                          htmlFor="clinicContactEmail"
                          className="text-xs font-semibold uppercase tracking-[0.12em] text-muted"
                        >
                          E-mail da clínica
                        </label>
                        <input
                          id="clinicContactEmail"
                          type="email"
                          value={form.clinicContactEmail}
                          onChange={(event) =>
                            updateFormField("clinicContactEmail", event.target.value)
                          }
                          placeholder="contato@suaclinica.com"
                          autoComplete="email"
                          className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
                          required
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="clinicContactPhone"
                          className="text-xs font-semibold uppercase tracking-[0.12em] text-muted"
                        >
                          WhatsApp / Telefone
                        </label>
                        <input
                          id="clinicContactPhone"
                          type="tel"
                          value={form.clinicContactPhone}
                          onChange={(event) =>
                            updateFormField("clinicContactPhone", event.target.value)
                          }
                          placeholder="(11) 99999-9999"
                          autoComplete="tel"
                          className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </fieldset>

                <fieldset className="space-y-4 border-t border-slate-200 pt-6">
                  <legend className="sr-only">Responsável pelo acesso</legend>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                      Responsável pelo acesso
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold leading-tight text-ink">
                      Quem vai entrar primeiro
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-muted">
                      O e-mail do responsável fica registrado nesta etapa. A senha
                      é criada somente após a confirmação do pagamento.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label
                        htmlFor="adminFullName"
                        className="text-xs font-semibold uppercase tracking-[0.12em] text-muted"
                      >
                        Nome completo
                      </label>
                      <input
                        id="adminFullName"
                        type="text"
                        value={form.adminFullName}
                        onChange={(event) =>
                          updateFormField("adminFullName", event.target.value)
                        }
                        placeholder="Nome do responsável"
                        autoComplete="name"
                        className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="adminEmail"
                        className="text-xs font-semibold uppercase tracking-[0.12em] text-muted"
                      >
                        E-mail do responsável
                      </label>
                      <input
                        id="adminEmail"
                        type="email"
                        value={form.adminEmail}
                        onChange={(event) =>
                          updateFormField("adminEmail", event.target.value)
                        }
                        placeholder="voce@suaclinica.com"
                        autoComplete="email"
                        className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
                        required
                      />
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-800">
                    A senha será ativada somente após a confirmação do pagamento,
                    garantindo que o acesso seja liberado no momento certo.
                  </div>
                </fieldset>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : null}
                    {isSubmitting ? "Salvando..." : "Salvar e avançar para pagamento"}
                    {!isSubmitting ? <ArrowRight className="h-4 w-4" /> : null}
                  </button>

                  <Link
                    href={`/checkout?token=${encodeURIComponent(onboardingToken)}`}
                    className="inline-flex items-center rounded-xl border border-border px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-50"
                  >
                    Voltar ao checkout
                  </Link>
                </div>
              </form>
            </Card>
          ) : (
            <Card className="rounded-[30px] border-slate-200 bg-white p-7">
              <div className="space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                  Cadastro encerrado
                </p>
                <h3 className="text-2xl font-semibold leading-tight text-ink">
                  {isExpired
                    ? "Este cadastro expirou."
                    : "O cadastro já foi concluído."}
                </h3>
                <p className="text-sm leading-7 text-muted">
                  {isExpired
                    ? "Por segurança, inicie novamente a partir da escolha do plano."
                    : "A jornada já avançou para o checkout. Continue por lá ou acesse a clínica se o ambiente já foi criado."}
                </p>
                <div className="flex flex-wrap gap-3">
                  {isExpired ? (
                    <Link
                      href="/planos"
                      className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      Escolher plano novamente
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <Link
                      href={`/checkout?token=${encodeURIComponent(onboardingToken)}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      Ir para checkout
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                  {onboarding.nextStep === "login_clinic" ? (
                    <Link
                      href={buildClinicLoginHref(onboarding)}
                      className="inline-flex items-center rounded-xl border border-border px-4 py-3 text-sm font-semibold text-ink transition hover:bg-slate-50"
                    >
                      Acessar a clínica
                    </Link>
                  ) : null}
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card tone="dark" className="rounded-[30px] border-slate-200 p-7 shadow-[0_30px_100px_-56px_rgba(15,23,42,0.92)]">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                  <UsersRound className="h-5 w-5 text-teal-200" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-200">
                    Faltam 2 passos
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold leading-tight">
                    Complete o cadastro e confirme o pagamento.
                  </h3>
                </div>
              </div>
              <p className="text-sm leading-7 text-slate-300">
                Após o pagamento, criamos automaticamente o ambiente completo da
                sua clínica estética: estrutura inicial, unidade e acesso do
                administrador — tudo em uma única etapa.
              </p>
              <div className="grid gap-2 rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
                <div className="flex items-center gap-2 text-xs">
                  <CircleCheckBig className="h-3.5 w-3.5 shrink-0 text-teal-300" />
                  <span className="text-slate-300">Plano escolhido</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="h-3.5 w-3.5 shrink-0 flex items-center justify-center">
                    <span className="h-2 w-2 rounded-full bg-teal-300 animate-pulse" />
                  </span>
                  <span className="font-medium text-slate-200">Dados da clínica</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="h-3.5 w-3.5 shrink-0 flex items-center justify-center rounded-full bg-white/10 text-[10px]">·</span>
                  <span>Pagamento</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="h-3.5 w-3.5 shrink-0 flex items-center justify-center rounded-full bg-white/10 text-[10px]">·</span>
                  <span>Acesso ao painel</span>
                </div>
              </div>
              {onboarding.admin.email ? (
                <div className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-slate-300">
                  E-mail registrado:{" "}
                  <span className="font-semibold text-white">{onboarding.admin.email}</span>
                </div>
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
                acesso ao painel só é liberado quando o ambiente da clínica está
                completamente pronto.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
