"use client";

import Link from "next/link";
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

function formatRate(value: number | null): string {
  if (value === null) {
    return "--";
  }

  return `${value.toFixed(1)}%`;
}

function formatMinutes(value: number | null): string {
  if (value === null) {
    return "--";
  }

  return `${value.toFixed(1)} min`;
}

function formatCoverage(available: number, active: number): string {
  return `${available}/${active}`;
}

function resolveAvailabilityLabel(available: boolean): {
  label: string;
  tone: "success" | "warning";
} {
  if (available) {
    return {
      label: "Ativo",
      tone: "success",
    };
  }

  return {
    label: "Sem dado",
    tone: "warning",
  };
}

interface TenantInsightItem {
  tenantId: string;
  tenantName: string;
  timezone: string;
  value: number;
  sampleSize: number;
}

function TenantInsightList({
  title,
  description,
  items,
  valueFormatter,
}: {
  title: string;
  description: string;
  items: TenantInsightItem[];
  valueFormatter: (value: number) => string;
}) {
  return (
    <Card>
      <AdminSectionHeader
        eyebrow="Outliers"
        title={title}
        description={description}
      />
      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={`${title}:${item.tenantId}`}
              className="rounded-[20px] border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{item.tenantName}</p>
                  <p className="text-xs text-muted">{item.timezone}</p>
                </div>
                <p className="text-sm font-semibold text-ink">
                  {valueFormatter(item.value)}
                </p>
              </div>
              <p className="mt-2 text-xs text-muted">
                Amostra rastreavel: {item.sampleSize}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">
            Nenhum tenant com amostra suficiente nesta janela.
          </p>
        )}
      </div>
    </Card>
  );
}

export default function PlatformOperationsPage() {
  const { dashboard, isLoading, error, reload } = usePlatformDashboard();
  const commandCenter = dashboard?.operations.commandCenter ?? null;
  const availability = resolveAvailabilityLabel(
    Boolean(
      commandCenter &&
        (commandCenter.noShowRate.available ||
          commandCenter.firstResponseTime.available ||
          commandCenter.confirmationOrRescheduleTime.available ||
          commandCenter.agendaOccupancyRate.available ||
          commandCenter.handoffVolume.available ||
          commandCenter.resolvedWithoutHumanIntervention.available),
    ),
  );

  const metrics = commandCenter
    ? [
        {
          label: "Tenants ativos",
          value: String(commandCenter.scope.activeTenants),
          helper: `${commandCenter.scope.tenantsWithScheduleBase} com base minima de agenda; janela de ${commandCenter.periodDays} dias.`,
          tone:
            commandCenter.scope.tenantsMissingScheduleBase > 0
              ? ("warning" as const)
              : ("accent" as const),
        },
        {
          label: "No-show medio",
          value: formatRate(commandCenter.noShowRate.weightedAverageRate),
          helper:
            commandCenter.noShowRate.available
              ? `${commandCenter.noShowRate.numerator} faltas em ${commandCenter.noShowRate.denominator} atendimentos com desfecho.`
              : commandCenter.noShowRate.unavailableReason ?? "Sem dado rastreavel.",
        },
        {
          label: "1a resposta media",
          value: formatMinutes(commandCenter.firstResponseTime.averageMinutes),
          helper:
            commandCenter.firstResponseTime.available
              ? `${commandCenter.firstResponseTime.sampleCount} janelas respondidas; ${commandCenter.firstResponseTime.pendingCount} ainda pendentes.`
              : commandCenter.firstResponseTime.unavailableReason ??
                "Sem resposta outbound persistida.",
        },
        {
          label: "Ocupacao media",
          value: formatRate(commandCenter.agendaOccupancyRate.weightedAverageRate),
          helper:
            commandCenter.agendaOccupancyRate.available
              ? `${commandCenter.agendaOccupancyRate.bookedMinutes} min ocupados sobre ${commandCenter.agendaOccupancyRate.availableMinutes} min liquidos.`
              : commandCenter.agendaOccupancyRate.unavailableReason ??
                "Sem capacidade liquida rastreavel.",
        },
        {
          label: "Resolvidas sem humano",
          value: String(commandCenter.resolvedWithoutHumanIntervention.total),
          helper:
            commandCenter.resolvedWithoutHumanIntervention.available
              ? `${commandCenter.resolvedWithoutHumanIntervention.tenantCoverage.available} tenants com outcome automatico terminal persistido.`
              : commandCenter.resolvedWithoutHumanIntervention.unavailableReason ??
                "Sem outcome automatico agregado.",
          tone:
            commandCenter.resolvedWithoutHumanIntervention.total > 0
              ? ("accent" as const)
              : ("default" as const),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Command Center"
        title="Operations"
        description="Leitura transversal da tese central do produto: menos no-show, resposta mais rapida, agenda mais previsivel e menor carga manual de recepcao."
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
            label: "Abrir reliability",
            description: "Cruzar risco operacional com integrações e readiness.",
            href: "/platform/reliability",
          },
          {
            label: "Abrir tenants",
            description: "Investigar clinicas com base incompleta ou fora da curva.",
            href: "/platform/tenants",
          },
          {
            label: "Abrir overview",
            description: "Voltar para a leitura executiva consolidada.",
            href: "/platform",
          },
        ]}
      />

      {error ? (
        <Card className="border-rose-200 bg-rose-50" role="alert">
          <p className="text-sm text-rose-700">{error}</p>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <AdminSectionHeader
            eyebrow="Snapshot real"
            title="Benchmark operacional agregado"
            description="As medias abaixo saem dos snapshots tenant-scoped ja calculados pelo backend da clinica. Nao ha score composto nem inferencia externa."
            actions={
              <StatusPill
                label={availability.label}
                tone={availability.tone}
              />
            }
          />

          {commandCenter ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                  Cobertura no-show
                </p>
                <p className="mt-3 text-2xl font-semibold text-ink">
                  {formatCoverage(
                    commandCenter.noShowRate.tenantCoverage.available,
                    commandCenter.noShowRate.tenantCoverage.active,
                  )}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Tenants ativos com amostra de comparecimento na janela.
                </p>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                  Cobertura resposta
                </p>
                <p className="mt-3 text-2xl font-semibold text-ink">
                  {formatCoverage(
                    commandCenter.firstResponseTime.tenantCoverage.available,
                    commandCenter.firstResponseTime.tenantCoverage.active,
                  )}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Tenants ativos com inbound e outbound persistidos.
                </p>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                  Confirmacao/remarcacao
                </p>
                <p className="mt-3 text-2xl font-semibold text-ink">
                  {formatMinutes(
                    commandCenter.confirmationOrRescheduleTime.averageMinutes,
                  )}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {commandCenter.confirmationOrRescheduleTime.available
                    ? `${commandCenter.confirmationOrRescheduleTime.sampleCount} appointments resolvidos; ${commandCenter.confirmationOrRescheduleTime.pendingCount} ainda pendentes.`
                    : commandCenter.confirmationOrRescheduleTime.unavailableReason ??
                      "Sem appointments resolvidos na janela."}
                </p>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                  Handoffs
                </p>
                <p className="mt-3 text-2xl font-semibold text-ink">
                  {commandCenter.handoffVolume.total}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {commandCenter.handoffVolume.automatic} automaticos,{" "}
                  {commandCenter.handoffVolume.manual} manuais,{" "}
                  {commandCenter.handoffVolume.closed} fechados.
                </p>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                  Resolucao segura sem humano
                </p>
                <p className="mt-3 text-2xl font-semibold text-ink">
                  {commandCenter.resolvedWithoutHumanIntervention.total}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {commandCenter.resolvedWithoutHumanIntervention.available
                    ? `${formatCoverage(
                        commandCenter.resolvedWithoutHumanIntervention.tenantCoverage.available,
                        commandCenter.resolvedWithoutHumanIntervention.tenantCoverage.active,
                      )} tenants ativos com outcome automatico terminal explicitamente persistido.`
                    : commandCenter.resolvedWithoutHumanIntervention.unavailableReason ??
                      "Sem trilha agregada na janela."}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <AdminEmptyState
                title="Sem snapshot operacional carregado"
                description="O control plane ainda nao conseguiu consolidar os KPIs tenant-scoped. Verifique o backend do platform e a disponibilidade dos snapshots clinic-level."
              />
            </div>
          )}
        </Card>

        <Card>
          <AdminSectionHeader
            eyebrow="Leitura complementar"
            title="Sinais operacionais imediatos"
            description="Volumes transversais do control plane que ajudam a explicar pressao de curto prazo."
          />
          <div className="mt-4 grid gap-3">
            {[
              {
                label: "Agenda 24h",
                value: String(dashboard?.operations.appointmentsNext24Hours ?? "--"),
                helper: "Carga operacional mais imediata na base.",
                tone: "default" as const,
              },
              {
                label: "Confirmacao pendente",
                value: String(
                  dashboard?.operations.pendingConfirmationNext24Hours ?? "--",
                ),
                helper: "Agendamentos proximos ainda sem fechamento operacional.",
                tone:
                  (dashboard?.operations.pendingConfirmationNext24Hours ?? 0) > 0
                    ? ("warning" as const)
                    : ("default" as const),
              },
              {
                label: "No-show bruto 30d",
                value: String(dashboard?.operations.noShowsLast30Days ?? "--"),
                helper: "Sinal acumulado recente de perda operacional.",
                tone:
                  (dashboard?.operations.noShowsLast30Days ?? 0) > 0
                    ? ("warning" as const)
                    : ("default" as const),
              },
              {
                label: "Stale holds",
                value: String(dashboard?.operations.staleActiveSlotHolds ?? "--"),
                helper: "Indicador direto de drift ou risco no scheduling.",
                tone:
                  (dashboard?.operations.staleActiveSlotHolds ?? 0) > 0
                    ? ("danger" as const)
                    : ("default" as const),
              },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded-[20px] border p-4 ${
                  item.tone === "danger"
                    ? "border-rose-200 bg-rose-50"
                    : item.tone === "warning"
                      ? "border-amber-200 bg-amber-50"
                      : "border-slate-200 bg-slate-50"
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                  {item.label}
                </p>
                <p className="mt-3 text-2xl font-semibold text-ink">{item.value}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{item.helper}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {commandCenter ? (
        <section className="grid gap-4 xl:grid-cols-3">
          <TenantInsightList
            title="Maiores no-show"
            description="Tenants com maior taxa de ausencia entre appointments com desfecho."
            items={commandCenter.noShowRate.highestRateTenants}
            valueFormatter={(value) => formatRate(value)}
          />
          <TenantInsightList
            title="Resposta mais lenta"
            description="Tenants com pior tempo medio de primeira resposta."
            items={commandCenter.firstResponseTime.slowestTenants}
            valueFormatter={(value) => formatMinutes(value)}
          />
          <TenantInsightList
            title="Menor ocupacao"
            description="Tenants com menor uso da capacidade liquida de agenda."
            items={commandCenter.agendaOccupancyRate.lowestOccupancyTenants}
            valueFormatter={(value) => formatRate(value)}
          />
        </section>
      ) : null}

      {commandCenter ? (
        <Card>
          <AdminSectionHeader
            eyebrow="Automacao segura"
            title="Onde a automacao ja fecha a conversa"
            description="Volume de outcomes automaticos terminais persistidos por tenant, sem inferir impacto causal em agenda, ocupacao ou receita."
          />
          <div className="mt-4 space-y-3">
            {commandCenter.resolvedWithoutHumanIntervention.highestVolumeTenants.length ? (
              commandCenter.resolvedWithoutHumanIntervention.highestVolumeTenants.map(
                (tenant) => (
                  <div
                    key={`resolved:${tenant.tenantId}`}
                    className="rounded-[20px] border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {tenant.tenantName}
                        </p>
                        <p className="text-xs text-muted">{tenant.timezone}</p>
                      </div>
                      <p className="text-sm font-semibold text-ink">{tenant.total}</p>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      Outcomes automaticos terminais persistidos na janela.
                    </p>
                  </div>
                ),
              )
            ) : (
              <p className="text-sm text-muted">
                Nenhum tenant com resolucao automatica terminal persistida na janela.
              </p>
            )}
          </div>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <AdminSectionHeader
            eyebrow="Rastreabilidade"
            title="Formula e cobertura do modulo"
            description="Todas as leituras abaixo saem da persistencia ja existente por tenant, sem dado sintetico."
          />
          <div className="mt-4 space-y-3 text-sm leading-6 text-muted">
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-ink">No-show</p>
              <p>
                {commandCenter?.noShowRate.methodology ??
                  "No snapshot loaded."}
              </p>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-ink">Primeira resposta</p>
              <p>
                {commandCenter?.firstResponseTime.methodology ??
                  "No snapshot loaded."}
              </p>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-ink">Ocupacao</p>
              <p>
                {commandCenter?.agendaOccupancyRate.methodology ??
                  "No snapshot loaded."}
              </p>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-ink">Handoff</p>
              <p>
                {commandCenter?.handoffVolume.methodology ??
                  "No snapshot loaded."}
              </p>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-ink">Resolucao sem humano</p>
              <p>
                {commandCenter?.resolvedWithoutHumanIntervention.methodology ??
                  "No snapshot loaded."}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <AdminSectionHeader
            eyebrow="Lacunas honestas"
            title="O que ainda nao entra no score"
            description="A torre so sobe metrica quando existe trilha auditavel suficiente."
            actions={
              <StatusPill
                label={commandCenter ? "Honesto" : "Aguardando"}
                tone="warning"
              />
            }
          />
          <div className="mt-4 space-y-3">
            {commandCenter?.knownGaps.length ? (
              commandCenter.knownGaps.map((gap) => (
                <div
                  key={gap}
                  className="rounded-[20px] border border-amber-200 bg-amber-50 p-4"
                >
                  <p className="text-sm leading-6 text-amber-800">{gap}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">
                Nenhuma lacuna carregada para este modulo.
              </p>
            )}
          </div>
          <div className="mt-5">
            <Link
              href="/platform/agents"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
            >
              Abrir agents e skills
            </Link>
          </div>
        </Card>
      </section>

      {commandCenter ? (
        <Card>
          <AdminSectionHeader
            eyebrow="Perguntas respondidas"
            title="O que este modulo ja responde sem abrir a clinica"
            description="Leituras cruzadas que o super admin consegue tomar em segundos com a agregacao atual."
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              "Qual o no-show medio atual da base ativa e quem piora esse numero?",
              "Onde a primeira resposta esta lenta mesmo com inbox e handoff ja implementados?",
              "Quais tenants estao usando pouco da agenda liquida disponivel?",
              "Qual a pressao de confirmacao pendente nas proximas 24h?",
              "Qual o volume atual de handoff carregado pela operacao humana?",
              "Onde a automacao ja resolve a conversa com outcome terminal explicitamente persistido?",
              "Quais lacunas de automacao ainda impedem um score operacional definitivo?",
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
      ) : null}
    </div>
  );
}
