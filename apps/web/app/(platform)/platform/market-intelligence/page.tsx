"use client";

import {
  AdminEmptyState,
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionHeader,
  AdminShortcutPanel,
} from "@/components/platform/platform-admin";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { usePlatformDashboard } from "@/hooks/use-platform-dashboard";
import { formatCurrencyFromCents } from "@/lib/formatters";

export default function PlatformMarketIntelligencePage() {
  const { dashboard, isLoading, error, reload } = usePlatformDashboard();

  const planMix = dashboard?.subscriptions.planMix ?? [];
  const totalTenants = dashboard?.tenants.total ?? 0;
  const activeTenants = dashboard?.tenants.active ?? 0;
  const primaryRevenue = dashboard?.subscriptions.revenueByCurrency[0] ?? null;
  const operationsCC = dashboard?.operations.commandCenter ?? null;

  const metrics = dashboard
    ? [
        {
          label: "Total na base",
          value: String(totalTenants),
          helper: "Clinicas provisionadas na plataforma.",
        },
        {
          label: "Planos distintos em uso",
          value: String(planMix.length),
          helper: "Variedade de planos com pelo menos uma clinica.",
          tone: "accent" as const,
        },
        {
          label: "Ocupacao media",
          value: operationsCC?.agendaOccupancyRate.available
            ? `${(operationsCC.agendaOccupancyRate.weightedAverageRate ?? 0).toFixed(1)}%`
            : "--",
          helper: operationsCC?.agendaOccupancyRate.available
            ? `${operationsCC.agendaOccupancyRate.bookedMinutes} min ocupados.`
            : "Sem capacidade liquida rastreada.",
        },
        {
          label: "No-show medio",
          value: operationsCC?.noShowRate.available
            ? `${(operationsCC.noShowRate.weightedAverageRate ?? 0).toFixed(1)}%`
            : "--",
          helper: operationsCC?.noShowRate.available
            ? `${operationsCC.noShowRate.numerator} faltas em ${operationsCC.noShowRate.denominator} atendimentos.`
            : "Sem amostra consolidada.",
          tone:
            (operationsCC?.noShowRate.weightedAverageRate ?? 0) > 12
              ? ("danger" as const)
              : ("default" as const),
        },
      ]
    : [];

  const revenueCurrencies = dashboard?.subscriptions.revenueByCurrency ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Command Center"
        title="Market Intelligence"
        description="Benchmarks internos e anonimos entre clinicas da base. Dados extraidos de subscriptions, operacoes e agendas para entender padroes sem identificar clientes individuais."
        actions={
          <button
            type="button"
            onClick={() => {
              void reload();
            }}
            disabled={isLoading}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
          >
            {isLoading ? "Atualizando..." : "Atualizar modulo"}
          </button>
        }
      >
        <AdminMetricGrid items={metrics} isLoading={isLoading && !dashboard} />
      </AdminPageHeader>

      <AdminShortcutPanel
        items={[
          {
            label: "Abrir growth",
            description: "Cruzar inteligencia com pipeline e conversao.",
            href: "/platform/growth",
          },
          {
            label: "Abrir finance",
            description: "Cruzar segmentacao com receita e risco.",
            href: "/platform/finance",
          },
          {
            label: "Abrir operations",
            description: "Ver benchmarks operacionais detalhados.",
            href: "/platform/operations",
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
            eyebrow="Distribuicao de planos"
            title="Quantas clinicas em cada plano"
            description="Mix atual de planos. Dado interno extraido das subscriptions ativas — sem dado de mercado externo."
            actions={
              <StatusPill
                label={dashboard ? "Interno" : "Carregando"}
                tone="neutral"
              />
            }
          />

          {planMix.length > 0 ? (
            <div className="mt-4 space-y-3">
              {planMix.map((plan) => {
                const pct =
                  activeTenants > 0
                    ? Math.round((plan.tenantCount / activeTenants) * 100)
                    : 0;

                return (
                  <div
                    key={plan.planId}
                    className="rounded-[20px] border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{plan.name}</p>
                        <p className="text-xs text-muted">{plan.code}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-ink">
                          {plan.tenantCount}
                        </p>
                        <p className="text-[11px] text-muted">{pct}% da base ativa</p>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-teal-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      MRR contratado:{" "}
                      {formatCurrencyFromCents(
                        plan.contractedMrrCents,
                        plan.currency,
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4">
              <AdminEmptyState
                title="Sem distribuicao de planos"
                description={
                  isLoading
                    ? "Carregando dados..."
                    : "Nenhum plano com clinicas associadas encontrado."
                }
              />
            </div>
          )}
        </Card>

        <Card>
          <AdminSectionHeader
            eyebrow="Medias da plataforma"
            title="Benchmarks operacionais anonimos"
            description="Medias calculadas a partir de snapshots reais dos tenants. Sem identificacao individual."
          />

          {operationsCC ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Taxa de ocupacao media
                </p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {operationsCC.agendaOccupancyRate.available
                    ? `${(operationsCC.agendaOccupancyRate.weightedAverageRate ?? 0).toFixed(1)}%`
                    : "--"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Cobertura:{" "}
                  {operationsCC.agendaOccupancyRate.tenantCoverage.available}/
                  {operationsCC.agendaOccupancyRate.tenantCoverage.active} clinicas
                </p>
                <div className="mt-3 flex gap-1.5">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    Meta: 65–90%
                  </span>
                  {operationsCC.agendaOccupancyRate.available &&
                  (operationsCC.agendaOccupancyRate.weightedAverageRate ?? 0) >= 65 ? (
                    <span className="rounded-full bg-teal-100 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
                      Dentro da meta
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                      Abaixo da meta
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Taxa de no-show media
                </p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {operationsCC.noShowRate.available
                    ? `${(operationsCC.noShowRate.weightedAverageRate ?? 0).toFixed(1)}%`
                    : "--"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Cobertura: {operationsCC.noShowRate.tenantCoverage.available}/
                  {operationsCC.noShowRate.tenantCoverage.active} clinicas
                </p>
                <div className="mt-3 flex gap-1.5">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    Meta: abaixo de 8%
                  </span>
                  {operationsCC.noShowRate.available &&
                  (operationsCC.noShowRate.weightedAverageRate ?? 0) <= 8 ? (
                    <span className="rounded-full bg-teal-100 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
                      Dentro da meta
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                      Acima da meta
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  1a resposta media
                </p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {operationsCC.firstResponseTime.available
                    ? `${(operationsCC.firstResponseTime.averageMinutes ?? 0).toFixed(1)} min`
                    : "--"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Cobertura:{" "}
                  {operationsCC.firstResponseTime.tenantCoverage.available}/
                  {operationsCC.firstResponseTime.tenantCoverage.active} clinicas
                </p>
                <div className="mt-3 flex gap-1.5">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    Meta: abaixo de 5 min
                  </span>
                  {operationsCC.firstResponseTime.available &&
                  (operationsCC.firstResponseTime.averageMinutes ?? 0) <= 5 ? (
                    <span className="rounded-full bg-teal-100 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
                      Dentro da meta
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                      Acima da meta
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <AdminEmptyState
                title="Sem benchmarks carregados"
                description={
                  isLoading
                    ? "Calculando medias da plataforma..."
                    : "Nenhum snapshot operacional disponivel para calcular benchmarks."
                }
              />
            </div>
          )}
        </Card>
      </section>

      {revenueCurrencies.length > 0 ? (
        <Card>
          <AdminSectionHeader
            eyebrow="Financeiro agregado"
            title="Receita por moeda na base"
            description="Distribuicao anonima de receita contratada por moeda. Sem identificacao de tenant individual."
          />

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {revenueCurrencies.map((entry) => (
              <div
                key={entry.currency}
                className="rounded-[20px] border border-slate-200 bg-slate-50 p-4"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Moeda: {entry.currency}
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">MRR contratado</span>
                    <span className="font-semibold text-ink">
                      {formatCurrencyFromCents(
                        entry.contractedMrrCents,
                        entry.currency,
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Pipeline trial</span>
                    <span className="font-semibold text-teal-700">
                      {formatCurrencyFromCents(
                        entry.trialPipelineCents,
                        entry.currency,
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Receita em risco</span>
                    <span
                      className={`font-semibold ${
                        entry.pastDueExposureCents > 0 ? "text-rose-600" : "text-slate-400"
                      }`}
                    >
                      {formatCurrencyFromCents(
                        entry.pastDueExposureCents,
                        entry.currency,
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <AdminSectionHeader
          eyebrow="Insights disponiveis"
          title="O que ja e possivel responder sem abrir dados de clinica individual"
          description="Perguntas de inteligencia de mercado que o modulo ja responde com os dados atuais."
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            "Qual plano e mais escolhido pelas clinicas em trial?",
            "Qual e o no-show medio da plataforma vs meta operacional?",
            "Quantas clinicas estao abaixo da taxa de ocupacao ideal?",
            "A receita em risco representa que percentual do MRR contratado?",
            "Qual e a variacao do mix de planos ao longo do tempo?",
            "Qual moeda representa a maior parte do pipeline trial?",
          ].map((question) => (
            <div
              key={question}
              className="rounded-[20px] border border-slate-200 bg-slate-50 p-4"
            >
              <p className="text-sm font-medium text-ink">{question}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <AdminSectionHeader
          eyebrow="Lacunas de dados"
          title="O que ainda nao esta disponivel"
          description="Sinais necessarios para evoluir de leitura de snapshot para inteligencia de mercado real."
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            "Motivo de cancelamento com taxonomia — sem isso, churn nao tem causa identificavel.",
            "Origem de lead e canal de aquisicao — nao e possivel calcular CAC ou identificar canal mais eficiente.",
            "Data de primeiro atendimento real — o evento de ativacao ainda nao esta persistido.",
            "Perfil de ICP por tipo de clinica — sem campo de especialidade ou porte nao ha segmentacao.",
            "Historico de mudanca de plano — sem trilha temporal de upgrade/downgrade.",
            "Objecoes de venda — motivos de perda comercial sem campo persistido.",
          ].map((gap) => (
            <div
              key={gap}
              className="rounded-[20px] border border-amber-200 bg-amber-50 p-4"
            >
              <p className="text-sm leading-6 text-amber-800">{gap}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
