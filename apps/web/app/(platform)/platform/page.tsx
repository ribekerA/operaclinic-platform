"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PlatformDashboardResponsePayload,
  PlatformOperationalCheckStatus,
  PlatformDashboardTenantSnapshot,
} from "@operaclinic/shared";
import {
  type AdminMetricTone,
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionHeader,
  AdminShortcutPanel,
} from "@/components/platform/platform-admin";
import { CommandCenterDomainGrid } from "@/components/platform/command-center";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { toErrorMessage } from "@/lib/client/http";
import { getPlatformDashboard } from "@/lib/client/platform-identity-api";
import {
  formatCurrencyFromCents,
  formatDateTime,
  getPlatformHealthLabel,
  getPlatformHealthTone,
  getSubscriptionStatusLabel,
  getSubscriptionStatusTone,
  getTenantStatusLabel,
  getTenantStatusTone,
} from "@/lib/formatters";
import { platformCommandCenterDomains } from "@/lib/platform-command-center";

function buildTenantSignals(tenant: PlatformDashboardTenantSnapshot): string[] {
  const signals: string[] = [];

  if (!tenant.readiness.hasClinicProfile) {
    signals.push("sem perfil de clinica");
  }

  if (!tenant.readiness.hasOperators) {
    signals.push("sem operador vinculado");
  }

  if (!tenant.readiness.hasScheduleBase) {
    signals.push("sem base de agenda");
  }

  if (!tenant.readiness.hasPatients) {
    signals.push("sem pacientes");
  }

  if (!tenant.readiness.hasAppointments) {
    signals.push("sem agenda operando");
  }

  if (tenant.currentPlan?.status === "PAST_DUE") {
    signals.push("financeiro em atraso");
  }

  if (tenant.status === "SUSPENDED") {
    signals.push("tenant suspenso");
  }

  return signals;
}

function getOperationalStatusClasses(status: PlatformOperationalCheckStatus): string {
  if (status === "error") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (status === "degraded") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function getOperationalStatusLabel(status: PlatformOperationalCheckStatus): string {
  if (status === "error") {
    return "Critico";
  }

  if (status === "degraded") {
    return "Parcial";
  }

  return "Operavel";
}

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

function resolveLowerIsBetterTone(
  value: number | null,
  goodThreshold: number,
  warningThreshold: number,
): AdminMetricTone {
  if (value === null) {
    return "default";
  }

  if (value <= goodThreshold) {
    return "accent";
  }

  if (value <= warningThreshold) {
    return "default";
  }

  return "danger";
}

function resolveHigherIsBetterTone(
  value: number | null,
  goodThreshold: number,
  warningThreshold: number,
): AdminMetricTone {
  if (value === null) {
    return "default";
  }

  if (value >= goodThreshold) {
    return "accent";
  }

  if (value >= warningThreshold) {
    return "default";
  }

  return "danger";
}

function resolveRangeTone(
  value: number | null,
  idealMin: number,
  idealMax: number,
  toleratedMin: number,
  toleratedMax: number,
): AdminMetricTone {
  if (value === null) {
    return "default";
  }

  if (value >= idealMin && value <= idealMax) {
    return "accent";
  }

  if (value >= toleratedMin && value <= toleratedMax) {
    return "default";
  }

  return "danger";
}

interface DashboardMetricCardProps {
  eyebrow: string;
  value: string;
  description: string;
  tone?: AdminMetricTone;
}

interface OperationalActionItem {
  title: string;
  description: string;
  href: string;
  tone: "default" | "warning" | "danger";
}

function DashboardMetricCard({
  eyebrow,
  value,
  description,
  tone = "default",
}: DashboardMetricCardProps) {
  const toneClasses =
    tone === "accent"
      ? "border-teal-200 bg-teal-50"
      : tone === "danger"
        ? "border-rose-200 bg-rose-50"
        : "border-border bg-white";

  return (
    <div className={`rounded-[24px] border p-4 ${toneClasses}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
        {eyebrow}
      </p>
      <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

function TenantReadinessPill({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
        active
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      {label}
    </span>
  );
}

export default function PlatformDashboardPage() {
  const [dashboard, setDashboard] =
    useState<PlatformDashboardResponsePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const payload = await getPlatformDashboard();
      setDashboard(payload);
    } catch (requestError) {
      setError(
        toErrorMessage(
          requestError,
          "Nao foi possivel carregar a leitura operacional da plataforma.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const primaryRevenue = dashboard?.subscriptions.revenueByCurrency[0] ?? null;
  const revenueCurrencies = dashboard?.subscriptions.revenueByCurrency ?? [];
  const topPlans = dashboard?.subscriptions.planMix.slice(0, 5) ?? [];
  const attentionTenants = dashboard?.tenants.attention ?? [];
  const latestTenants = dashboard?.tenants.latest ?? [];
  const recentActivity = dashboard?.recentActivity ?? [];
  const healthTone = dashboard
    ? getPlatformHealthTone(dashboard.overview.healthLevel)
    : "neutral";
  const readiness = dashboard?.operationalReadiness ?? null;
  const operationsCommandCenter = dashboard?.operations.commandCenter ?? null;
  const agentsCommandCenter = dashboard?.agents.commandCenter ?? null;
  const readinessIssues = useMemo(() => {
    if (!readiness) {
      return [];
    }

    return [
      ...readiness.database.issues.map((issue) => ({
        key: `database:${issue}`,
        label: "Banco",
        issue,
      })),
      ...readiness.payment.issues.map((issue) => ({
        key: `payment:${issue}`,
        label: "Pagamento",
        issue,
      })),
      ...readiness.messaging.issues.map((issue) => ({
        key: `messaging:${issue}`,
        label: "WhatsApp",
        issue,
      })),
    ];
  }, [readiness]);
  const operationalActions = useMemo<OperationalActionItem[]>(() => {
    if (!dashboard || !readiness) {
      return [];
    }

    const actions: OperationalActionItem[] = [];

    if (readiness.payment.provider === "mock") {
      actions.push({
        title: "Ativar checkout Stripe",
        description:
          "O ambiente ainda esta em mock. Configure chave real, webhook e vire o billing para producao.",
        href: "/platform/payments",
        tone: "danger",
      });
    } else if (!readiness.payment.webhookConfigured) {
      actions.push({
        title: "Fechar webhook do Stripe",
        description:
          "O checkout esta em Stripe, mas o webhook ainda nao esta pronto para confirmar eventos com seguranca.",
        href: "/platform/payments",
        tone: "danger",
      });
    }

    if (!readiness.messaging.metaEnabled) {
      actions.push({
        title: "Habilitar Meta WhatsApp",
        description:
          "O canal esta desligado no ambiente. Sem isso, rollout real de mensageria fica travado.",
        href: "/platform/tenants",
        tone: "warning",
      });
    } else if (
      readiness.messaging.activeMetaConnections === 0 ||
      readiness.messaging.activeMetaConnectionsMissingPhoneNumberId > 0
    ) {
      actions.push({
        title: "Regularizar conexoes Meta",
        description:
          "Existem conexoes ausentes ou incompletas. Revise tenant, phone number id e token de verificacao.",
        href: "/platform/tenants",
        tone: "danger",
      });
    }

    if (dashboard.tenants.missingSetup > 0) {
      actions.push({
        title: "Destravar tenants com setup pendente",
        description:
          "Ha tenants sem perfil, operadores ou base de agenda. Isso ainda reduz prontidao operacional.",
        href: "/platform/tenants",
        tone: "warning",
      });
    }

    if (dashboard.tenants.withoutOperators > 0) {
      actions.push({
        title: "Completar operadores e acessos",
        description:
          "Parte da base ainda nao tem usuarios suficientes para operar recepcao, gestao ou equipe clinica.",
        href: "/platform/users",
        tone: "warning",
      });
    }

    if (dashboard.subscriptions.pastDue > 0) {
      actions.push({
        title: "Tratar risco comercial imediato",
        description:
          "Existem tenants em atraso impactando receita e potencial de sustentacao da operacao.",
        href: "/platform/payments",
        tone: "danger",
      });
    }

    if (
      operationsCommandCenter?.noShowRate.available &&
      operationsCommandCenter.noShowRate.weightedAverageRate !== null &&
      operationsCommandCenter.noShowRate.weightedAverageRate > 12
    ) {
      actions.push({
        title: "Atacar no-show acima da meta operacional",
        description:
          "A media agregada indica perda evitavel de agenda. Revisar follow-up, confirmacao e tenants fora da curva.",
        href: "/platform/operations",
        tone:
          operationsCommandCenter.noShowRate.weightedAverageRate > 18
            ? "danger"
            : "warning",
      });
    }

    if (
      operationsCommandCenter?.firstResponseTime.available &&
      operationsCommandCenter.firstResponseTime.averageMinutes !== null &&
      operationsCommandCenter.firstResponseTime.averageMinutes > 12
    ) {
      actions.push({
        title: "Encurtar primeira resposta",
        description:
          "A recepcao ainda responde acima do desejado. Priorize triagem, handoff e filas com maior atraso.",
        href: "/platform/operations",
        tone:
          operationsCommandCenter.firstResponseTime.averageMinutes > 20
            ? "danger"
            : "warning",
      });
    }

    if (
      agentsCommandCenter?.available &&
      agentsCommandCenter.failureRate !== null &&
      agentsCommandCenter.failureRate > 10
    ) {
      actions.push({
        title: "Conter falha de agentes antes de expandir rollout",
        description:
          "A camada de agentes ja esta com taxa de erro acima do desejado para evolucao segura.",
        href: "/platform/agents",
        tone:
          agentsCommandCenter.failureRate > 20 ? "danger" : "warning",
      });
    }

    if (actions.length === 0) {
      actions.push({
        title: "Base operacional consistente",
        description:
          "Banco, billing e mensageria nao exibem bloqueios imediatos. O proximo passo ja pode ser evolucao de produto.",
        href: "/platform/tenants",
        tone: "default",
      });
    }

    return actions.slice(0, 5);
  }, [agentsCommandCenter, dashboard, operationsCommandCenter, readiness]);

  const executiveMetrics = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    return [
      {
        label: "Tenants ativos",
        value: `${dashboard.tenants.active}/${dashboard.tenants.total}`,
        helper: "Base ativa no momento.",
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
        helper: "Leitura comercial atual da carteira.",
      },
      {
        label: "Setup pendente",
        value: String(dashboard.tenants.missingSetup),
        helper: "Tenants que ainda travam operacao.",
        tone: dashboard.tenants.missingSetup > 0 ? ("danger" as const) : ("default" as const),
      },
      {
        label: "Atendimentos 24h",
        value: String(dashboard.operations.appointmentsNext24Hours),
        helper: "Carga operacional mais imediata.",
      },
    ];
  }, [dashboard, primaryRevenue]);

  const heroStats = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    return [
      {
        label: "Tenants prontos",
        value: `${dashboard.tenants.readyForOperation}`,
      },
      {
        label: "Confirmacao pendente",
        value: `${dashboard.operations.pendingConfirmationNext24Hours}`,
      },
      {
        label: "No-show 30d",
        value: `${dashboard.operations.noShowsLast30Days}`,
      },
      {
        label: "Stale holds",
        value: `${dashboard.operations.staleActiveSlotHolds}`,
      },
    ];
  }, [dashboard]);
  const valueProofMetrics = useMemo<
    Array<{
      label: string;
      value: string;
      helper: string;
      tone?: AdminMetricTone;
    }>
  >(() => {
    if (!operationsCommandCenter) {
      return [];
    }

    return [
      {
        label: "No-show medio",
        value: formatRate(operationsCommandCenter.noShowRate.weightedAverageRate),
        helper: operationsCommandCenter.noShowRate.available
          ? `${operationsCommandCenter.noShowRate.numerator} faltas em ${operationsCommandCenter.noShowRate.denominator} atendimentos com desfecho; cobertura ${formatCoverage(
              operationsCommandCenter.noShowRate.tenantCoverage.available,
              operationsCommandCenter.noShowRate.tenantCoverage.active,
            )}.`
          : operationsCommandCenter.noShowRate.unavailableReason ??
            "Sem amostra consolidada de comparecimento.",
        tone: resolveLowerIsBetterTone(
          operationsCommandCenter.noShowRate.weightedAverageRate,
          8,
          15,
        ),
      },
      {
        label: "1a resposta media",
        value: formatMinutes(operationsCommandCenter.firstResponseTime.averageMinutes),
        helper: operationsCommandCenter.firstResponseTime.available
          ? `${operationsCommandCenter.firstResponseTime.sampleCount} janelas respondidas; ${operationsCommandCenter.firstResponseTime.pendingCount} ainda pendentes.`
          : operationsCommandCenter.firstResponseTime.unavailableReason ??
            "Sem outbound rastreavel para calcular resposta.",
        tone: resolveLowerIsBetterTone(
          operationsCommandCenter.firstResponseTime.averageMinutes,
          5,
          15,
        ),
      },
      {
        label: "Confirmacao/remarcacao",
        value: formatMinutes(
          operationsCommandCenter.confirmationOrRescheduleTime.averageMinutes,
        ),
        helper: operationsCommandCenter.confirmationOrRescheduleTime.available
          ? `${operationsCommandCenter.confirmationOrRescheduleTime.sampleCount} agendamentos com desfecho; ${operationsCommandCenter.confirmationOrRescheduleTime.pendingCount} ainda aguardando.`
          : operationsCommandCenter.confirmationOrRescheduleTime.unavailableReason ??
            "Sem desfecho confirmado ou remarcado na janela.",
        tone: resolveLowerIsBetterTone(
          operationsCommandCenter.confirmationOrRescheduleTime.averageMinutes,
          90,
          360,
        ),
      },
      {
        label: "Ocupacao media",
        value: formatRate(
          operationsCommandCenter.agendaOccupancyRate.weightedAverageRate,
        ),
        helper: operationsCommandCenter.agendaOccupancyRate.available
          ? `${operationsCommandCenter.agendaOccupancyRate.bookedMinutes} min ocupados sobre ${operationsCommandCenter.agendaOccupancyRate.availableMinutes} min liquidos.`
          : operationsCommandCenter.agendaOccupancyRate.unavailableReason ??
            "Sem capacidade liquida consolidada.",
        tone: resolveRangeTone(
          operationsCommandCenter.agendaOccupancyRate.weightedAverageRate,
          65,
          90,
          45,
          95,
        ),
      },
      {
        label: "Resolvidas sem humano",
        value: String(operationsCommandCenter.resolvedWithoutHumanIntervention.total),
        helper:
          operationsCommandCenter.resolvedWithoutHumanIntervention.available
            ? `${operationsCommandCenter.resolvedWithoutHumanIntervention.tenantCoverage.available} tenants com outcome automatico terminal persistido.`
            : operationsCommandCenter.resolvedWithoutHumanIntervention
                .unavailableReason ?? "Sem desfecho automatico consolidado.",
        tone:
          operationsCommandCenter.resolvedWithoutHumanIntervention.total > 0
            ? "accent"
            : "default",
      },
    ];
  }, [operationsCommandCenter]);
  const automationMetrics = useMemo<
    Array<{
      label: string;
      value: string;
      helper: string;
      tone?: AdminMetricTone;
    }>
  >(() => {
    if (!agentsCommandCenter) {
      return [];
    }

    return [
      {
        label: "Execucoes 30d",
        value: String(agentsCommandCenter.totalExecutions),
        helper: `${agentsCommandCenter.uniqueThreads} threads unicas com trilha persistida.`,
        tone:
          agentsCommandCenter.totalExecutions > 0 ? ("accent" as const) : ("default" as const),
      },
      {
        label: "Resolucao segura",
        value:
          agentsCommandCenter.safeResolutionRate === null
            ? "--"
            : `${agentsCommandCenter.safeResolutionRate.toFixed(1)}%`,
        helper: `${agentsCommandCenter.safeAutomaticResolutions} conversas encerradas por automacao com outcome explicito.`,
        tone: resolveHigherIsBetterTone(
          agentsCommandCenter.safeResolutionRate,
          25,
          10,
        ),
      },
      {
        label: "Fallback/handoff",
        value:
          agentsCommandCenter.handoffRate === null
            ? "--"
            : `${agentsCommandCenter.handoffRate.toFixed(1)}%`,
        helper: `${agentsCommandCenter.handoffOpened} execucoes abriram fallback humano na janela.`,
      },
      {
        label: "Falha agent",
        value:
          agentsCommandCenter.failureRate === null
            ? "--"
            : `${agentsCommandCenter.failureRate.toFixed(1)}%`,
        helper: `${agentsCommandCenter.failed} execucoes falharam; ${agentsCommandCenter.totalSkillCalls} skill calls rastreadas.`,
        tone: resolveLowerIsBetterTone(agentsCommandCenter.failureRate, 5, 12),
      },
    ];
  }, [agentsCommandCenter]);
  const shortcutItems = useMemo(
    () => [
      {
        label: "Operations",
        description: "Abrir o modulo que prova no-show, resposta e agenda.",
        href: "/platform/operations",
      },
      {
        label: "Finance",
        description: "Cruzar risco comercial, MRR e receita exposta.",
        href: "/platform/finance",
      },
      {
        label: "Reliability",
        description: "Abrir o modulo duro de readiness e risco tecnico.",
        href: "/platform/reliability",
      },
      {
        label: "Agents",
        description: "Revisar automacao segura, fallback e falhas por tenant.",
        href: "/platform/agents",
      },
      {
        label: "Tenants",
        description: "Ir direto para a gestao da base ativa.",
        href: "/platform/tenants",
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Command Center"
        title="Overview do sistema nervoso central da plataforma"
        description="Leitura unica para decidir em segundos se a operacao esta saudavel, se a receita esta sustentando o ritmo, onde os tenants vazam e qual modulo da torre precisa de atencao imediata."
        actions={
          <>
            <button
              type="button"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
              onClick={() => {
                void loadDashboard();
              }}
              disabled={isLoading}
            >
              {isLoading ? "Atualizando..." : "Atualizar leitura"}
            </button>
            <Link
              href="/platform/operations"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
            >
              Abrir operations
            </Link>
          </>
        }
      >
        <AdminMetricGrid items={executiveMetrics} isLoading={isLoading && !dashboard} />
        <AdminShortcutPanel items={shortcutItems} />
      </AdminPageHeader>

      {error ? (
        <Card className="border-red-200 bg-red-50" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      ) : null}

      <Card>
        <AdminSectionHeader
          eyebrow="Arquitetura da torre"
          title="Dominios definitivos do command center"
          description="A navegacao do super admin agora reflete uma torre de controle unificada. Alguns dominios entram vivos; outros entram com contrato claro de ativacao para evitar score decorativo."
        />
        <div className="mt-5">
          <CommandCenterDomainGrid domains={platformCommandCenterDomains} />
        </div>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
        <Card tone="dark" className="relative overflow-hidden border-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.34),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.26),_transparent_35%)]" />
          <div className="relative grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
            <div className="space-y-4">
              <StatusPill
                label={
                  dashboard
                    ? getPlatformHealthLabel(dashboard.overview.healthLevel)
                    : "Carregando"
                }
                tone={healthTone}
              />
              <div>
                <h2 className="text-2xl font-semibold leading-tight">
                  {dashboard?.overview.summary ??
                    "Consolidando tenants, agenda, usuarios e carteira ativa."}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
                  {dashboard
                    ? `Gerado em ${formatDateTime(dashboard.generatedAt)}. Use este painel para detectar atraso comercial, lacunas de setup e sinais de stress na agenda antes de abrir novas superficies como WhatsApp.`
                    : "Carregando a visao consolidada do control plane."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/platform/tenants"
                  className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:opacity-90"
                >
                  Gerir tenants
                </Link>
                <Link
                  href="/platform/plans"
                  className="rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-slate-50 transition hover:bg-slate-800"
                >
                  Revisar planos
                </Link>
                <Link
                  href="/platform/users"
                  className="rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-slate-50 transition hover:bg-slate-800"
                >
                  Revisar usuarios
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
              {heroStats.length > 0 ? (
                heroStats.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[24px] border border-white/10 bg-white/10 p-4 backdrop-blur"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-200">
                      {item.label}
                    </p>
                    <p className="mt-2 text-3xl font-semibold">{item.value}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-white/10 bg-white/10 p-4 text-sm text-slate-200">
                  Carregando blocos de saude...
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
              Financeiro visivel
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Receita contratada e risco comercial
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Leitura contratual a partir do estado atual das subscriptions e dos planos ativos do tenant.
            </p>
          </div>

          <div className="rounded-[24px] border border-teal-200 bg-teal-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-teal-700">
              MRR contratado
            </p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">
              {primaryRevenue
                ? formatCurrencyFromCents(
                    primaryRevenue.contractedMrrCents,
                    primaryRevenue.currency,
                  )
                : "--"}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {revenueCurrencies.length > 1
                ? `${revenueCurrencies.length} moedas ativas na carteira.`
                : "Considera subscriptions ativas na moeda principal."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DashboardMetricCard
              eyebrow="Receita em risco"
              value={
                primaryRevenue
                  ? formatCurrencyFromCents(
                      primaryRevenue.pastDueExposureCents,
                      primaryRevenue.currency,
                    )
                  : "--"
              }
              description="Valor exposto em tenants cujo contrato atual esta em atraso."
              tone="danger"
            />
            <DashboardMetricCard
              eyebrow="Pipeline trial"
              value={
                primaryRevenue
                  ? formatCurrencyFromCents(
                      primaryRevenue.trialPipelineCents,
                      primaryRevenue.currency,
                    )
                  : "--"
              }
              description="Potencial imediato caso os tenants em trial convertam."
              tone="accent"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DashboardMetricCard
              eyebrow="Paid plan tenants"
              value={dashboard ? String(dashboard.subscriptions.paidPlanTenants) : "--"}
              description="Tenants atualmente associados a plano com valor maior que zero."
            />
            <DashboardMetricCard
              eyebrow="Free plan tenants"
              value={dashboard ? String(dashboard.subscriptions.freePlanTenants) : "--"}
              description="Tenants em plano gratuito ou base sem receita contratada."
            />
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <DashboardMetricCard
          eyebrow="Tenants prontos"
          value={dashboard ? String(dashboard.tenants.readyForOperation) : "--"}
          description="Com perfil da clinica, operadores e base minima de agenda."
          tone="accent"
        />
        <DashboardMetricCard
          eyebrow="Setup pendente"
          value={dashboard ? String(dashboard.tenants.missingSetup) : "--"}
          description="Tenants que ainda nao fecharam setup operacional ou comercial."
          tone={dashboard && dashboard.tenants.missingSetup > 0 ? "danger" : "default"}
        />
        <DashboardMetricCard
          eyebrow="Usuarios de operacao"
          value={dashboard ? String(dashboard.users.clinicOperators) : "--"}
          description="Usuarios com papel operacional na area da clinica estetica."
        />
        <DashboardMetricCard
          eyebrow="Atendimentos proximas 24h"
          value={dashboard ? String(dashboard.operations.appointmentsNext24Hours) : "--"}
          description="Carga imediata que a plataforma precisa sustentar."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Prova de valor"
            title="Os sinais que ja mostram ganho operacional"
            description="A home do super admin agora puxa no-show, resposta, confirmacao, ocupacao e automacao segura direto dos snapshots reais da plataforma."
          />

          {dashboard ? (
            <AdminMetricGrid items={valueProofMetrics} />
          ) : (
            <p className="text-sm text-muted">
              Carregando leitura transversal de ROI operacional.
            </p>
          )}

          {operationsCommandCenter ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                Leitura executiva
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Cobertura operacional ativa em{" "}
                {formatCoverage(
                  operationsCommandCenter.noShowRate.tenantCoverage.available,
                  operationsCommandCenter.scope.activeTenants,
                )}{" "}
                tenants na janela de {operationsCommandCenter.periodDays} dias. Use
                este bloco para decidir se a tese central do produto esta andando
                antes de abrir `Operations`.
              </p>
            </div>
          ) : null}
        </Card>

        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Automacao segura"
            title="Onde os agentes ja aliviam a operacao"
            description="Sem score decorativo: este modulo mostra so execucao persistida, fallback real e conversas encerradas por automacao com outcome explicito."
          />

          {dashboard ? (
            <AdminMetricGrid items={automationMetrics} />
          ) : (
            <p className="text-sm text-muted">
              Carregando leitura consolidada de agentes.
            </p>
          )}

          {agentsCommandCenter?.knownGaps.length ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
                Limites atuais
              </p>
              <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {agentsCommandCenter.knownGaps.slice(0, 2).map((gap) => (
                  <p key={gap}>{gap}</p>
                ))}
              </div>
            </div>
          ) : null}

          <Link
            href="/platform/agents"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
          >
            Abrir agents & skills
          </Link>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
                Readiness operacional
              </p>
              <h2 className="mt-2 text-xl font-semibold text-ink">
                Billing, banco e WhatsApp em producao
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Leitura centralizada dos pontos que mais quebram rollout: banco, checkout real e conexoes Meta prontas para webhook.
              </p>
            </div>
            {readiness ? (
              <span
                className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] ${getOperationalStatusClasses(
                  readiness.status,
                )}`}
              >
                {getOperationalStatusLabel(readiness.status)}
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[24px] border border-border bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
                Banco
              </p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {readiness ? getOperationalStatusLabel(readiness.database.status) : "--"}
              </p>
              <p className="mt-2 text-sm text-muted">
                {readiness && readiness.database.latencyMs !== null
                  ? `${readiness.database.latencyMs} ms no healthcheck.`
                  : "Sem leitura atual de latencia."}
              </p>
            </div>
            <div className="rounded-[24px] border border-border bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
                Pagamento
              </p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {readiness ? readiness.payment.provider.toUpperCase() : "--"}
              </p>
              <p className="mt-2 text-sm text-muted">
                {readiness
                  ? readiness.payment.webhookConfigured
                    ? "Webhook configurado."
                    : "Webhook ainda nao configurado."
                  : "Carregando configuracao de checkout."}
              </p>
            </div>
            <div className="rounded-[24px] border border-border bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
                WhatsApp Meta
              </p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {readiness ? String(readiness.messaging.activeMetaConnections) : "--"}
              </p>
              <p className="mt-2 text-sm text-muted">
                Conexoes Meta ativas no ambiente {readiness?.environment ?? "--"}.
              </p>
            </div>
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
              Riscos imediatos
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              O que bloqueia producao agora
            </h2>
          </div>

          <div className="space-y-3">
            {readiness ? (
              readinessIssues.length > 0 ? (
                readinessIssues.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-[24px] border border-amber-200 bg-amber-50 p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
                      {item.label}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{item.issue}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-800">
                    Nenhum bloqueio operacional imediato detectado.
                  </p>
                </div>
              )
            ) : (
              <p className="text-sm text-muted">Carregando leitura operacional...</p>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
                Checklist executivo
              </p>
              <h2 className="mt-2 text-xl font-semibold text-ink">
                O que fazer em seguida
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Acoes recomendadas a partir do estado atual do billing, da mensageria e do setup dos tenants.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {operationalActions.length} frente(s)
            </span>
          </div>

          <div className="space-y-3">
            {operationalActions.map((action) => (
              <div
                key={action.title}
                className={`rounded-[24px] border p-4 ${
                  action.tone === "danger"
                    ? "border-rose-200 bg-rose-50"
                    : action.tone === "warning"
                      ? "border-amber-200 bg-amber-50"
                      : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">{action.title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      {action.description}
                    </p>
                  </div>
                  <Link
                    href={action.href}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
                  >
                    Abrir
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
              Atalhos de rollout
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Frentes mais usadas nesta sprint
            </h2>
          </div>

          <AdminShortcutPanel
            title="Mover a operacao"
            items={[
              {
                label: "Pagamentos reais",
                description: "Configurar Stripe, webhook e exposicao comercial.",
                href: "/platform/payments",
              },
              {
                label: "Tenants travados",
                description: "Corrigir setup, plano e base operacional incompleta.",
                href: "/platform/tenants",
              },
              {
                label: "Usuarios e papeis",
                description: "Completar operadores, recepcao e profissionais.",
                href: "/platform/users",
              },
              {
                label: "Catalogo de planos",
                description: "Revisar contrato ativo, trials e combinacao comercial.",
                href: "/platform/plans",
              },
            ]}
          />
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
                Mix comercial
              </p>
              <h2 className="mt-2 text-xl font-semibold text-ink">
                Planos mais presentes na base
              </h2>
            </div>
            <Link
              href="/platform/plans"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Gerir catalogo
            </Link>
          </div>

          <div className="space-y-3">
            {topPlans.length > 0 ? (
              topPlans.map((plan) => (
                <div
                  key={plan.planId}
                  className="grid gap-3 rounded-[24px] border border-border bg-white p-4 md:grid-cols-[1.2fr_0.8fr_0.8fr]"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{plan.name}</p>
                    <p className="text-xs text-muted">{plan.code}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
                      Tenants
                    </p>
                    <p className="mt-1 text-lg font-semibold text-ink">
                      {plan.tenantCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
                      MRR
                    </p>
                    <p className="mt-1 text-lg font-semibold text-ink">
                      {formatCurrencyFromCents(
                        plan.contractedMrrCents,
                        plan.currency,
                      )}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">
                {isLoading
                  ? "Carregando mix comercial..."
                  : "Nenhum plano em uso para exibir."}
              </p>
            )}
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
              Qualidade da base
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Lacunas que travam a operacao
            </h2>
          </div>

          <div className="space-y-3">
            <div className="rounded-[24px] border border-border bg-white p-4">
              <p className="text-sm font-semibold text-ink">Sem perfil de clinica</p>
              <p className="mt-1 text-3xl font-semibold text-ink">
                {dashboard ? dashboard.tenants.withoutClinicProfile : "--"}
              </p>
            </div>
            <div className="rounded-[24px] border border-border bg-white p-4">
              <p className="text-sm font-semibold text-ink">Sem operadores</p>
              <p className="mt-1 text-3xl font-semibold text-ink">
                {dashboard ? dashboard.tenants.withoutOperators : "--"}
              </p>
            </div>
            <div className="rounded-[24px] border border-border bg-white p-4">
              <p className="text-sm font-semibold text-ink">Sem base de agenda</p>
              <p className="mt-1 text-3xl font-semibold text-ink">
                {dashboard ? dashboard.tenants.withoutScheduleBase : "--"}
              </p>
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
                Tenants em atencao
              </p>
              <h2 className="mt-2 text-xl font-semibold text-ink">
                Onde agir primeiro
              </h2>
            </div>
            <Link
              href="/platform/tenants"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Abrir gestao
            </Link>
          </div>

          <div className="space-y-3">
            {attentionTenants.length > 0 ? (
              attentionTenants.map((tenant) => {
                const signals = buildTenantSignals(tenant);

                return (
                  <div
                    key={tenant.id}
                    className="rounded-[24px] border border-border bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{tenant.name}</p>
                        <p className="text-xs text-muted">
                          {tenant.slug} | {tenant.timezone}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusPill
                          label={getTenantStatusLabel(tenant.status)}
                          tone={getTenantStatusTone(tenant.status)}
                        />
                        {tenant.currentPlan ? (
                          <StatusPill
                            label={getSubscriptionStatusLabel(tenant.currentPlan.status)}
                            tone={getSubscriptionStatusTone(tenant.currentPlan.status)}
                          />
                        ) : (
                          <StatusPill label="Sem contrato" tone="warning" />
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <TenantReadinessPill
                        label="perfil"
                        active={tenant.readiness.hasClinicProfile}
                      />
                      <TenantReadinessPill
                        label="operadores"
                        active={tenant.readiness.hasOperators}
                      />
                      <TenantReadinessPill
                        label="agenda"
                        active={tenant.readiness.hasScheduleBase}
                      />
                      <TenantReadinessPill
                        label="pacientes"
                        active={tenant.readiness.hasPatients}
                      />
                      <TenantReadinessPill
                        label="atendimentos"
                        active={tenant.readiness.hasAppointments}
                      />
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-muted md:grid-cols-3">
                      <p>
                        Operadores:{" "}
                        <span className="font-semibold text-ink">
                          {tenant.metrics.operators}
                        </span>
                      </p>
                      <p>
                        Profissionais:{" "}
                        <span className="font-semibold text-ink">
                          {tenant.metrics.professionals}
                        </span>
                      </p>
                      <p>
                        Atendimentos:{" "}
                        <span className="font-semibold text-ink">
                          {tenant.metrics.appointments}
                        </span>
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {signals.length > 0 ? (
                        signals.map((signal) => (
                          <span
                            key={signal}
                            className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
                          >
                            {signal}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-muted">
                          Sem sinais de atencao imediata.
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted">
                {isLoading
                  ? "Carregando tenants em atencao..."
                  : "Nenhum tenant exige acao imediata."}
              </p>
            )}
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
              Ultimos tenants
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Crescimento e provisionamento
            </h2>
          </div>

          <div className="space-y-3">
            {latestTenants.length > 0 ? (
              latestTenants.map((tenant) => (
                <div
                  key={tenant.id}
                  className="rounded-[24px] border border-border bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{tenant.name}</p>
                      <p className="text-xs text-muted">{tenant.slug}</p>
                    </div>
                    <StatusPill
                      label={getTenantStatusLabel(tenant.status)}
                      tone={getTenantStatusTone(tenant.status)}
                    />
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    Criado em {formatDateTime(tenant.createdAt)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Plano atual: {tenant.currentPlan?.name ?? "Sem contrato ativo"}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">
                {isLoading ? "Carregando tenants..." : "Sem tenants recentes."}
              </p>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
              Atividade recente
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              O que esta mudando na plataforma
            </h2>
          </div>

          <div className="space-y-3">
            {recentActivity.length > 0 ? (
              recentActivity.map((entry) => (
                <div
                  key={entry.id}
                  className="grid gap-3 rounded-[24px] border border-border bg-white p-4 md:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{entry.action}</p>
                    <p className="mt-1 text-sm text-muted">
                      {entry.actorName ?? entry.actorEmail ?? "Sistema"} |{" "}
                      {entry.tenantName ?? "Escopo global"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {entry.targetType}
                      {entry.targetId ? ` | ${entry.targetId}` : ""}
                    </p>
                  </div>
                  <p className="text-xs font-medium text-muted">
                    {formatDateTime(entry.createdAt)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">
                {isLoading
                  ? "Carregando atividade recente..."
                  : "Nenhuma atividade recente para exibir."}
              </p>
            )}
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
              Stress operacional
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Sinais do scheduling e da recepcao
            </h2>
          </div>

          <div className="space-y-3">
            <DashboardMetricCard
              eyebrow="Check-ins 24h"
              value={dashboard ? String(dashboard.operations.checkInsLast24Hours) : "--"}
              description="Volume recente de check-ins concluido pela recepcao."
            />
            <DashboardMetricCard
              eyebrow="Cancelamentos 30d"
              value={dashboard ? String(dashboard.operations.canceledLast30Days) : "--"}
              description="Mudancas de status para cancelado no ultimo mes."
            />
            <DashboardMetricCard
              eyebrow="No-show 30d"
              value={dashboard ? String(dashboard.operations.noShowsLast30Days) : "--"}
              description="Perda operacional acumulada em faltas recentes."
              tone={
                dashboard && dashboard.operations.noShowsLast30Days > 0
                  ? "danger"
                  : "default"
              }
            />
            <DashboardMetricCard
              eyebrow="Holds ativos"
              value={dashboard ? String(dashboard.operations.activeSlotHolds) : "--"}
              description="Quantidade de slot holds ainda vivos no motor de agenda."
            />
          </div>
        </Card>
      </section>
    </div>
  );
}
