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
          "Nao foi possivel carregar o cadastro comercial agora.",
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
        "Cadastro comercial salvo. O proximo passo agora e confirmar o checkout. A senha sera definida somente apos o pagamento confirmado.",
      );
      router.push(`/checkout?token=${encodeURIComponent(onboardingToken)}`);
      router.refresh();
    } catch (submitError) {
      setError(
        toErrorMessage(
          submitError,
          "Nao foi possivel salvar o cadastro comercial agora.",
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
              Cadastro nasce do plano
            </p>
            <h2 className="text-3xl font-semibold leading-tight text-ink">
              Escolha o plano da sua clinica estetica antes de preencher o cadastro.
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-muted">
              O backend cria um onboarding comercial proprio para o plano
              escolhido. Isso evita cadastro solto e mantem o fluxo publico separado
              da area autenticada.
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
            Cadastro indisponivel
          </p>
          <h2 className="text-3xl font-semibold leading-tight text-ink">
            Nao encontramos este onboarding comercial.
          </h2>
          <p className="text-sm leading-7 text-muted">
            O link pode ter expirado ou a jornada ainda nao foi iniciada
            corretamente. Escolha um plano para recomecar.
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
                  Cadastro comercial real
                </p>
                <h2 className="mt-3 text-4xl font-semibold leading-tight text-ink">
                  Dados da clinica e do admin
                </h2>
                <p className="mt-3 text-sm leading-7 text-muted">
                  O plano ja esta selecionado no backend. Agora este formulario
                  grava a base inicial da clinica, da unidade e do admin responsavel
                  dentro do onboarding comercial. A definicao da senha fica para
                  depois da confirmacao do pagamento.
                </p>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Plano escolhido
                </p>
                <p className="mt-2 text-lg font-semibold text-ink">{plan.name}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{plan.summary}</p>
              </div>
            </div>
          </Card>

          {canEditRegistration ? (
            <Card className="rounded-[30px] border-slate-200 bg-white p-7">
              <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                      Clinica
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold leading-tight text-ink">
                      Dados principais da operacao
                    </h3>
                  </div>

                  <div className="grid gap-4">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Nome da clinica
                      </label>
                      <input
                        type="text"
                        value={form.clinicDisplayName}
                        onChange={(event) =>
                          updateFormField("clinicDisplayName", event.target.value)
                        }
                        placeholder="Ex.: Atelier Face Jardins"
                        className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent"
                        required
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Razao social
                        </label>
                        <input
                          type="text"
                          value={form.clinicLegalName}
                          onChange={(event) =>
                            updateFormField("clinicLegalName", event.target.value)
                          }
                          placeholder="Opcional"
                          className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Documento
                        </label>
                        <input
                          type="text"
                          value={form.clinicDocumentNumber}
                          onChange={(event) =>
                            updateFormField("clinicDocumentNumber", event.target.value)
                          }
                          placeholder="CNPJ ou documento interno"
                          className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Email da clinica
                        </label>
                        <input
                          type="email"
                          value={form.clinicContactEmail}
                          onChange={(event) =>
                            updateFormField("clinicContactEmail", event.target.value)
                          }
                          placeholder="contato@sua-clinica-estetica.com"
                          className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Telefone da clinica
                        </label>
                        <input
                          type="tel"
                          value={form.clinicContactPhone}
                          onChange={(event) =>
                            updateFormField("clinicContactPhone", event.target.value)
                          }
                          placeholder="(11) 99999-9999"
                          className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Unidade inicial
                        </label>
                        <input
                          type="text"
                          value={form.initialUnitName}
                          onChange={(event) =>
                            updateFormField("initialUnitName", event.target.value)
                          }
                          placeholder="Unidade Principal"
                          className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Fuso horario
                        </label>
                        <input
                          type="text"
                          value={form.timezone}
                          onChange={(event) =>
                            updateFormField("timezone", event.target.value)
                          }
                          placeholder="America/Sao_Paulo"
                          className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 border-t border-slate-200 pt-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                      Responsavel admin
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold leading-tight text-ink">
                      Quem vai entrar primeiro na clinica estetica
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-muted">
                      O email do admin fica registrado agora para controle do onboarding.
                      A senha nao e coletada nesta etapa publica.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Nome completo
                        </label>
                        <input
                          type="text"
                          value={form.adminFullName}
                          onChange={(event) =>
                            updateFormField("adminFullName", event.target.value)
                          }
                          placeholder="Nome do responsavel"
                          className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Email do admin
                        </label>
                        <input
                          type="email"
                          value={form.adminEmail}
                          onChange={(event) =>
                            updateFormField("adminEmail", event.target.value)
                          }
                          placeholder="admin@sua-clinica-estetica.com"
                          className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent"
                          required
                        />
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-800">
                      A senha do admin sera ativada so depois do pagamento confirmado.
                      Isso evita credencial sensivel solta em onboarding que ainda nao virou cliente ativo.
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : null}
                    {isSubmitting ? "Salvando cadastro..." : "Salvar e voltar ao checkout"}
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
                  Cadastro bloqueado para edicao
                </p>
                <h3 className="text-2xl font-semibold leading-tight text-ink">
                  {isExpired
                    ? "Este onboarding comercial expirou."
                    : "Esta etapa ja passou do ponto de alteracao manual."}
                </h3>
                <p className="text-sm leading-7 text-muted">
                  {isExpired
                    ? "Por seguranca, a jornada comercial precisa ser reiniciada a partir da escolha do plano."
                    : "O onboarding ja avancou para pagamento confirmado ou ambiente criado. Continue pelo checkout ou entre na clinica estetica se a criacao inicial ja foi concluida."}
                </p>
                <div className="flex flex-wrap gap-3">
                  {isExpired ? (
                    <Link
                      href="/planos"
                      className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      Reiniciar pelos planos
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
                      Ir para login da clinica estetica
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
                    O que fica salvo
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold leading-tight">
                    Clinica, unidade inicial e admin responsavel.
                  </h3>
                </div>
              </div>
              <p className="text-sm leading-7 text-slate-300">
                O cadastro comercial persiste o contexto da clinica estetica no backend.
                Quando o onboarding for finalizado, esse mesmo estado vira tenant,
                clinica, unidade inicial, usuario admin convidado e vinculo do plano.
              </p>
              <div className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-slate-300">
                {onboarding.admin.email
                  ? `Email do admin registrado ate agora: ${onboarding.admin.email}.`
                  : "O email do admin ainda nao foi salvo neste onboarding."}
              </div>
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
                    Jornada segura
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold leading-tight text-ink">
                    A camada publica segue separada da area autenticada.
                  </h3>
                </div>
              </div>
              <p className="text-sm leading-7 text-muted">
                O formulario nao cria sessao nem tenta entrar na clinica estetica. Ele so
                grava o estado comercial real. O acesso autenticado continua em
                rotas separadas.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
