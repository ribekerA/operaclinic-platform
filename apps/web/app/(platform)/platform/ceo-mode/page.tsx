"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionHeader,
  AdminShortcutPanel,
} from "@/components/platform/platform-admin";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { usePlatformDashboard } from "@/hooks/use-platform-dashboard";
import {
  formatCurrencyFromCents,
  getPlatformHealthLabel,
  getPlatformHealthTone,
} from "@/lib/formatters";

function formatRate(value: number | null): string {
  if (value === null) return "--";
  return `${value.toFixed(1)}%`;
}

function formatMinutes(value: number | null): string {
  if (value === null) return "--";
  return `${value.toFixed(1)} min`;
}

export default function PlatformCeoModePage() {
  const { dashboard, isLoading, error, reload } = usePlatformDashboard();

  const primaryRevenue = dashboard?.subscriptions.revenueByCurrency[0] ?? null;
  const operationsCC = dashboard?.operations.commandCenter ?? null;
  const agentsCC = dashboard?.agents.commandCenter ?? null;
  const readiness = dashboard?.operationalReadiness ?? null;

  const topAttentionTenants = dashboard?.tenants.attention.slice(0, 5) ?? [];

  const executiveMetrics = dashboard
    ? [
        {
          label: "Clinicas ativas",
          value: `${dashboard.tenants.active}/${dashboard.tenants.total}`,
          helper: "Base ativa sobre total provisionado.",
          tone: "accent" as const,
        },
        {
          label: "MRR contratado",
          value: primaryRevenue
            ? formatCurrencyFromCents(
                primaryRevenue.contractedMrrCents,
                primaryRevenue.currency,
              )
            : "--",
          helper: "Receita recorrente contratada.",
        },
        {
          label: "Receita em risco",
          value: primaryRevenue
            ? formatCurrencyFromCents(
                primaryRevenue.pastDueExposureCents,
                primaryRevenue.currency,
              )
            : "--",
          helper: `${dashboard.subscriptions.pastDue} clinica(s) em atraso.`,
          tone:
            dashboard.subscriptions.pastDue > 0
              ? ("danger" as const)
              : ("default" as const),
        },
        {
          label: "Setup pendente",
          value: String(dashboard.tenants.missingSetup),
          helper: "Clinicas sem setup operacional completo.",
          tone:
            dashboard.tenants.missingSetup > 0
              ? ("warning" as const)
              : ("default" as const),
        },
      ]
    : [];

  const operationalSignals = dashboard
    ? [
        {
          label: "Agenda proximas 24h",
          value: String(dashboard.operations.appointmentsNext24Hours),
          helper: "Carga operacional imediata.",
        },
        {
          label: "No-show medio (30d)",
          value: formatRate(operationsCC?.noShowRate.weightedAverageRate ?? null),
          helper: operationsCC?.noShowRate.available
            ? `${operationsCC.noShowRate.numerator} faltas em ${operationsCC.noShowRate.denominator} atendimentos.`
            : "Sem amostra consolidada.",
          tone:
            (operationsCC?.noShowRate.weightedAverageRate ?? 0) > 12
              ? ("danger" as const)
              : ("default" as const),
        },
        {
          label: "1a resposta media",
          value: formatMinutes(operationsCC?.firstResponseTime.averageMinutes ?? null),
          helper: operationsCC?.firstResponseTime.available
            ? `${operationsCC.firstResponseTime.sampleCount} janelas respondidas.`
            : "Sem outbound rastreavel.",
          tone:
            (operationsCC?.firstResponseTime.averageMinutes ?? 0) > 15
              ? ("warning" as const)
              : ("default" as const),
        },
        {
          label: "Execucoes de agente (30d)",
          value: String(agentsCC?.totalExecutions ?? "--"),
          helper: agentsCC?.available
            ? `${agentsCC.safeAutomaticResolutions} resolucoes automaticas seguras.`
            : "Sem execucoes rastreadas.",
          tone:
            (agentsCC?.totalExecutions ?? 0) > 0 ? ("accent" as const) : ("default" as const),
        },
      ]
    : [];

  const healthTone = dashboard
    ? getPlatformHealthTone(dashboard.overview.healthLevel)
    : "neutral";

  const healthLabel = dashboard
    ? getPlatformHealthLabel(dashboard.overview.healthLevel)
    : "Carregando";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Command Center"
        title="CEO Mode"
        description="Sintese executiva da plataforma em menos de 3 minutos: saude da base, receita, risco operacional e onde agir agora. Todos os dados sao ao vivo."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void reload();
              }}
              disabled={isLoading}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
            >
              {isLoading ? "Atualizando..." : "Atualizar leitura"}
            </button>
            <StatusPill label={healthLabel} tone={healthTone} />
          </div>
        }
      >
        <AdminMetricGrid
          items={executiveMetrics}
          isLoading={isLoading && !dashboard}
        />
      </AdminPageHeader>

      <AdminShortcutPanel
        items={[
          {
            label: "Abrir finance",
            description: "Aprofundar em receita, risco e mix de planos.",
            href: "/platform/finance",
          },
          {
            label: "Abrir operations",
            description: "No-show, resposta e ocupacao da agenda.",
            href: "/platform/operations",
          },
          {
            label: "Abrir tenants",
            description: "Investigar clinicas especificas.",
            href: "/platform/tenants",
          },
          {
            label: "Abrir agents",
            description: "Automacao segura e execucoes de agente.",
            href: "/platform/agents",
          },
        ]}
      />

      {error ? (
        <Card className="border-rose-200 bg-rose-50" role="alert">
          <p className="text-sm text-rose-700">{error}</p>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <AdminSectionHeader
            eyebrow="Resumo executivo"
            title="Estado atual da plataforma"
            description="Uma frase: o que esta saudavel, o que esta vazando e qual e o sinal de maior risco agora."
          />

          <div className="mt-4 space-y-3">
            {dashboard ? (
              <>
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Resumo do sistema
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ink">
                    {dashboard.overview.summary}
                  </p>
                </div>

                {readiness ? (
                  <div
                    className={`rounded-[20px] border p-4 ${
                      readiness.status === "error"
                        ? "border-rose-200 bg-rose-50"
                        : readiness.status === "degraded"
                          ? "border-amber-200 bg-amber-50"
                          : "border-emerald-200 bg-emerald-50"
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                      Infraestrutura
                    </p>
                    <p className="mt-2 text-sm font-semibold text-ink">
                      Banco:{" "}
                      {readiness.database.status === "ok" ? "Operavel" : readiness.database.status === "degraded" ? "Parcial" : "Critico"}
                      {readiness.database.latencyMs !== null
                        ? ` (${readiness.database.latencyMs}ms)`
                        : ""}
                      {" · "}
                      Pagamento: {readiness.payment.provider.toUpperCase()}
                      {" · "}
                      WhatsApp: {readiness.messaging.activeMetaConnections} conexao(oes)
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                      Usuarios na plataforma
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-ink">
                      {dashboard.users.total}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {dashboard.users.active} ativos, {dashboard.users.invited} convidados
                    </p>
                  </div>
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                      Trial pipeline
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-ink">
                      {primaryRevenue
                        ? formatCurrencyFromCents(
                            primaryRevenue.trialPipelineCents,
                            primaryRevenue.currency,
                          )
                        : "--"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {dashboard.subscriptions.trial} clinica(s) em periodo de trial
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm text-muted">
                  {isLoading
                    ? "Consolidando dados do sistema nervoso central..."
                    : "Sem dados carregados. Tente atualizar."}
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <AdminSectionHeader
            eyebrow="Sinais operacionais"
            title="KPIs em tempo real"
            description="Os numeros que mais importam para a decisao executiva sem abrir sub-modulos."
          />
          <div className="mt-4">
            <AdminMetricGrid
              items={operationalSignals}
              isLoading={isLoading && !dashboard}
            />
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <AdminSectionHeader
            eyebrow="Alertas de saude"
            title="Clinicas que precisam de atencao"
            description="Top 5 clinicas com maior score de atencao combinando status, inadimplencia e gaps de setup."
            actions={
              <Link
                href="/platform/tenants"
                className="text-sm font-semibold text-accent hover:underline"
              >
                Ver todas
              </Link>
            }
          />

          <div className="mt-4 space-y-3">
            {topAttentionTenants.length > 0 ? (
              topAttentionTenants.map((tenant) => {
                const hasFinancialRisk = tenant.currentPlan?.status === "PAST_DUE";
                const isSuspended = tenant.status === "SUSPENDED";
                const missingSetup =
                  !tenant.readiness.hasClinicProfile ||
                  !tenant.readiness.hasOperators ||
                  !tenant.readiness.hasScheduleBase;

                return (
                  <div
                    key={tenant.id}
                    className={`rounded-[20px] border p-4 ${
                      isSuspended || hasFinancialRisk
                        ? "border-rose-200 bg-rose-50"
                        : missingSetup
                          ? "border-amber-200 bg-amber-50"
                          : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {tenant.name}
                        </p>
                        <p className="text-xs text-muted">{tenant.slug}</p>
                      </div>
                      <StatusPill
                        label={
                          isSuspended
                            ? "Suspensa"
                            : hasFinancialRisk
                              ? "Em atraso"
                              : missingSetup
                                ? "Setup incompleto"
                                : "Ativa"
                        }
                        tone={
                          isSuspended || hasFinancialRisk
                            ? "danger"
                            : missingSetup
                              ? "warning"
                              : "success"
                        }
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted">
                      {!tenant.readiness.hasClinicProfile && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                          sem perfil
                        </span>
                      )}
                      {!tenant.readiness.hasOperators && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                          sem operadores
                        </span>
                      )}
                      {!tenant.readiness.hasScheduleBase && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                          sem agenda
                        </span>
                      )}
                      {hasFinancialRisk && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">
                          pagamento em atraso
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-800">
                  {isLoading
                    ? "Carregando alertas..."
                    : "Nenhuma clinica exige atencao imediata."}
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <AdminSectionHeader
            eyebrow="Automacao"
            title="Agentes e resolucoes automaticas"
            description="O quanto a plataforma ja esta aliviando a operacao sem intervencao humana."
          />

          {agentsCC ? (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Execucoes (30d)
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-ink">
                    {agentsCC.totalExecutions}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {agentsCC.uniqueThreads} threads unicas rastreadas
                  </p>
                </div>
                <div className="rounded-[20px] border border-teal-200 bg-teal-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Resolucoes automaticas
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-ink">
                    {agentsCC.safeAutomaticResolutions}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Taxa:{" "}
                    {agentsCC.safeResolutionRate !== null
                      ? `${agentsCC.safeResolutionRate.toFixed(1)}%`
                      : "--"}
                  </p>
                </div>
                <div
                  className={`rounded-[20px] border p-4 ${
                    (agentsCC.handoffRate ?? 0) > 30
                      ? "border-amber-200 bg-amber-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Handoff / fallback
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-ink">
                    {agentsCC.handoffRate !== null
                      ? `${agentsCC.handoffRate.toFixed(1)}%`
                      : "--"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {agentsCC.handoffOpened} transferencias para humano
                  </p>
                </div>
                <div
                  className={`rounded-[20px] border p-4 ${
                    (agentsCC.failureRate ?? 0) > 10
                      ? "border-rose-200 bg-rose-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Taxa de falha
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-ink">
                    {agentsCC.failureRate !== null
                      ? `${agentsCC.failureRate.toFixed(1)}%`
                      : "--"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {agentsCC.failed} execucoes com falha registrada
                  </p>
                </div>
              </div>

              {agentsCC.knownGaps.length > 0 ? (
                <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Limites atuais do modulo
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {agentsCC.knownGaps[0]}
                  </p>
                </div>
              ) : null}

              <Link
                href="/platform/agents"
                className={buttonVariants({ variant: "secondary" })}
              >
                Abrir modulo de agentes
              </Link>
            </div>
          ) : (
            <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-muted">
                {isLoading
                  ? "Carregando dados de automacao..."
                  : "Sem execucoes de agente rastreadas na janela de 30 dias."}
              </p>
            </div>
          )}
        </Card>
      </section>

      <Card>
        <AdminSectionHeader
          eyebrow="Proximas acoes"
          title="O que fazer em seguida"
          description="Decisoes executivas derivadas do estado atual do sistema."
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dashboard
            ? [
                ...(dashboard.subscriptions.pastDue > 0
                  ? [
                      {
                        label: "Tratar inadimplencia",
                        description: `${dashboard.subscriptions.pastDue} clinica(s) com pagamento em atraso. Risco imediato de MRR.`,
                        href: "/platform/payments",
                        tone: "danger" as const,
                      },
                    ]
                  : []),
                ...(dashboard.tenants.missingSetup > 0
                  ? [
                      {
                        label: "Destravar setup",
                        description: `${dashboard.tenants.missingSetup} clinica(s) sem setup completo. Impedem operacao plena.`,
                        href: "/platform/tenants",
                        tone: "warning" as const,
                      },
                    ]
                  : []),
                ...(dashboard.subscriptions.trial > 0
                  ? [
                      {
                        label: "Converter trials",
                        description: `${dashboard.subscriptions.trial} clinica(s) em trial. Pipeline imediato de conversao.`,
                        href: "/platform/tenants",
                        tone: "default" as const,
                      },
                    ]
                  : []),
                {
                  label: "Revisar mix de planos",
                  description: "Verificar distribuicao de planos e precificacao atual.",
                  href: "/platform/plans",
                  tone: "default" as const,
                },
              ]
                .slice(0, 6)
                .map((action) => (
                  <Link
                    key={action.label}
                    href={action.href}
                    className={`group block rounded-[20px] border p-4 transition hover:shadow-sm ${
                      action.tone === "danger"
                        ? "border-rose-200 bg-rose-50 hover:border-rose-300"
                        : action.tone === "warning"
                          ? "border-amber-200 bg-amber-50 hover:border-amber-300"
                          : "border-slate-200 bg-slate-50 hover:border-teal-200 hover:bg-white"
                    }`}
                  >
                    <p className="text-sm font-semibold text-ink">{action.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {action.description}
                    </p>
                  </Link>
                ))
            : null}
          {!dashboard && !isLoading ? (
            <div className="col-span-full rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-muted">
                Sem dados carregados. Atualize o modulo para ver acoes recomendadas.
              </p>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
