"use client";

import Link from "next/link";
import type { PlatformDashboardTenantSnapshot } from "@operaclinic/shared";
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
import {
  formatDateTime,
  getSubscriptionStatusLabel,
  getSubscriptionStatusTone,
  getTenantStatusLabel,
  getTenantStatusTone,
} from "@/lib/formatters";

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

interface ProductActionItem {
  title: string;
  description: string;
  href: string;
  tone: "default" | "warning" | "danger";
}

interface DomainGapGroup {
  title: string;
  domain: string;
  tone: "default" | "warning" | "danger";
  items: string[];
}

export default function PlatformProductControlPage() {
  const { dashboard, isLoading, error, reload } = usePlatformDashboard();

  const readinessIssues = dashboard
    ? [
        ...dashboard.operationalReadiness.database.issues.map((issue) => ({
          domain: "Banco",
          issue,
          tone: "danger" as const,
        })),
        ...dashboard.operationalReadiness.payment.issues.map((issue) => ({
          domain: "Pagamento",
          issue,
          tone: "danger" as const,
        })),
        ...dashboard.operationalReadiness.messaging.issues.map((issue) => ({
          domain: "WhatsApp",
          issue,
          tone: "warning" as const,
        })),
      ]
    : [];

  const gapGroups: DomainGapGroup[] = dashboard
    ? [
        {
          title: "Readiness e rollout",
          domain: "Reliability",
          tone:
            readinessIssues.length > 0
              ? ("danger" as const)
              : ("default" as const),
          items:
            readinessIssues.length > 0
              ? readinessIssues.map((item) => `${item.domain}: ${item.issue}`)
              : ["Sem bloqueio imediato carregado neste momento."],
        },
        {
          title: "ROI operacional ainda parcial",
          domain: "Operations",
          tone: "warning",
          items: dashboard.operations.commandCenter.knownGaps,
        },
        {
          title: "Automacao ainda sem causalidade completa",
          domain: "Agents",
          tone: "warning",
          items: dashboard.agents.commandCenter.knownGaps,
        },
      ]
    : [];

  const actionItems: ProductActionItem[] = dashboard
    ? (() => {
        const items: ProductActionItem[] = [];

        if (dashboard.operationalReadiness.status !== "ok") {
          items.push({
            title: "Fechar bloqueios de readiness antes de abrir rollout",
            description:
              "Banco, checkout real ou canal Meta ainda exibem sinais de degradacao que comprometem a previsibilidade do piloto.",
            href: "/platform/reliability",
            tone: "danger",
          });
        }

        if (dashboard.tenants.missingSetup > 0) {
          items.push({
            title: "Destravar tenants com setup incompleto",
            description:
              "Ha clinicas sem perfil, operador ou base minima de agenda. Isso trava prova de valor e onboarding previsivel.",
            href: "/platform/tenants",
            tone: "warning",
          });
        }

        if (
          dashboard.operations.commandCenter.noShowRate.available &&
          (dashboard.operations.commandCenter.noShowRate.weightedAverageRate ?? 0) > 12
        ) {
          items.push({
            title: "Corrigir no-show antes de ampliar piloto",
            description:
              "A leitura agregada ainda indica perda operacional evitavel. A proxima iteracao precisa atacar follow-up, confirmacao e outliers por tenant.",
            href: "/platform/operations",
            tone:
              (dashboard.operations.commandCenter.noShowRate.weightedAverageRate ?? 0) > 18
                ? "danger"
                : "warning",
          });
        }

        if (
          dashboard.agents.commandCenter.available &&
          (dashboard.agents.commandCenter.failureRate ?? 0) > 10
        ) {
          items.push({
            title: "Segurar expansao de agentes e reduzir falha",
            description:
              "O agent layer ainda esta acima do limiar seguro para escalar automacao sem aumentar fallback e risco operacional.",
            href: "/platform/agents",
            tone:
              (dashboard.agents.commandCenter.failureRate ?? 0) > 20
                ? "danger"
                : "warning",
          });
        }

        if (dashboard.subscriptions.pastDue > 0) {
          items.push({
            title: "Reduzir atraso comercial da base ativa",
            description:
              "Receita em atraso reduz margem de operacao e distorce a leitura real de crescimento da plataforma.",
            href: "/platform/finance",
            tone: "warning",
          });
        }

        if (items.length === 0) {
          items.push({
            title: "Sem bloqueio estrutural imediato",
            description:
              "Os sinais hoje permitem focar em refinamento de piloto e aprofundamento de produto, nao em contencao.",
            href: "/platform",
            tone: "default",
          });
        }

        return items.slice(0, 5);
      })()
    : [];

  const metrics = dashboard
    ? [
        {
          label: "Tenants em atencao",
          value: String(dashboard.tenants.attention.length),
          helper: "Clinicas com sinais objetivos de risco operacional ou comercial.",
          tone:
            dashboard.tenants.attention.length > 0
              ? ("warning" as const)
              : ("accent" as const),
        },
        {
          label: "Setup pendente",
          value: String(dashboard.tenants.missingSetup),
          helper: "Base ainda bloqueando onboarding e operacao previsivel.",
          tone:
            dashboard.tenants.missingSetup > 0
              ? ("danger" as const)
              : ("accent" as const),
        },
        {
          label: "Gaps centralizados",
          value: String(
            readinessIssues.length +
              dashboard.operations.commandCenter.knownGaps.length +
              dashboard.agents.commandCenter.knownGaps.length,
          ),
          helper: "Riscos e limites explicitamente refletidos na torre.",
        },
        {
          label: "Atividade recente",
          value: String(dashboard.recentActivity.length),
          helper: "Eventos auditaveis que ajudam a priorizar a semana.",
          tone:
            dashboard.recentActivity.length > 0
              ? ("accent" as const)
              : ("default" as const),
        },
        {
          label: "Rollout agent",
          value: `${dashboard.agents.readiness.rolloutPercentage}%`,
          helper: "Exposicao atual do agent layer no ambiente.",
          tone:
            dashboard.agents.readiness.rolloutPercentage >= 100
              ? ("accent" as const)
              : ("default" as const),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Command Center"
        title="Product Control"
        description="Modulo parcial real para evitar inercia: prioridades abertas, risco de rollout, gaps conhecidos e sinais auditaveis que precisam virar proxima acao."
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
            label: "Abrir overview",
            description: "Voltar para a leitura executiva consolidada.",
            href: "/platform",
          },
          {
            label: "Abrir reliability",
            description: "Cruzar backlog tecnico com risco aberto de rollout.",
            href: "/platform/reliability",
          },
          {
            label: "Abrir operations",
            description: "Usar no-show, resposta e agenda para priorizar correcao.",
            href: "/platform/operations",
          },
          {
            label: "Abrir agents",
            description: "Entender se automacao esta ajudando ou atrapalhando.",
            href: "/platform/agents",
          },
        ]}
      />

      {error ? (
        <Card className="border-rose-200 bg-rose-50" role="alert">
          <p className="text-sm text-rose-700">{error}</p>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Prioridade imediata"
            title="O que precisa virar proxima acao"
            description="Acoes derivadas de sinais rastreaveis da torre. Nada aqui depende de memoria do founder."
          />

          <div className="space-y-3">
            {actionItems.map((item) => (
              <div
                key={item.title}
                className={`rounded-[24px] border p-4 ${
                  item.tone === "danger"
                    ? "border-rose-200 bg-rose-50"
                    : item.tone === "warning"
                      ? "border-amber-200 bg-amber-50"
                      : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      {item.description}
                    </p>
                  </div>
                  <Link
                    href={item.href}
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
          <AdminSectionHeader
            eyebrow="Risco de inercia"
            title="O que ja esta visivel e ainda nao esta fechado"
            description="Este bloco substitui memoria informal por fatos ja centralizados na plataforma."
          />

          {gapGroups.length > 0 ? (
            <div className="space-y-3">
              {gapGroups.map((group) => (
                <div
                  key={group.title}
                  className={`rounded-[24px] border p-4 ${
                    group.tone === "danger"
                      ? "border-rose-200 bg-rose-50"
                      : group.tone === "warning"
                        ? "border-amber-200 bg-amber-50"
                        : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{group.title}</p>
                      <p className="text-xs uppercase tracking-[0.14em] text-muted">
                        {group.domain}
                      </p>
                    </div>
                    <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                      {group.items.length}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {group.items.slice(0, 3).map((item) => (
                      <p key={`${group.title}:${item}`} className="text-sm leading-6 text-slate-700">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Carregando gaps centralizados da torre.
            </p>
          )}
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <AdminSectionHeader
            eyebrow="Tenants que travam evolucao"
            title="Onde a plataforma ainda perde previsibilidade"
            description="Clinicas em atencao ou com setup incompleto que precisam de acao antes de escalar piloto."
          />

          {dashboard ? (
            dashboard.tenants.attention.length > 0 ? (
              <div className="mt-4 space-y-3">
                {dashboard.tenants.attention.map((tenant) => {
                  const signals = buildTenantSignals(tenant);

                  return (
                    <div
                      key={tenant.id}
                      className="rounded-[24px] border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
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
                          <StatusPill label="Sem plano" tone="warning" />
                        )}
                      </div>

                      <div className="mt-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-ink">{tenant.name}</p>
                          <p className="text-xs text-muted">
                            {tenant.slug} · {tenant.timezone}
                          </p>
                        </div>
                        <Link
                          href="/platform/tenants"
                          className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
                        >
                          Abrir tenant
                        </Link>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {signals.length > 0 ? (
                          signals.map((signal) => (
                            <span
                              key={`${tenant.id}:${signal}`}
                              className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                            >
                              {signal}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                            sem alerta objetivo neste snapshot
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4">
                <AdminEmptyState
                  title="Nenhum tenant em atencao agora"
                  description="A base ativa nao exibiu sinais prioritarios de risco comercial ou operacional neste snapshot."
                />
              </div>
            )
          ) : (
            <p className="mt-4 text-sm text-muted">Carregando tenants em atencao.</p>
          )}
        </Card>

        <Card>
          <AdminSectionHeader
            eyebrow="Atividade auditavel"
            title="Eventos recentes que ajudam a priorizar a semana"
            description="Log curto de mudancas relevantes ja capturadas pelo control plane."
          />

          {dashboard ? (
            dashboard.recentActivity.length > 0 ? (
              <div className="mt-4 space-y-3">
                {dashboard.recentActivity.slice(0, 8).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[20px] border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{item.action}</p>
                        <p className="mt-1 text-xs text-muted">
                          {item.tenantName ?? "Plataforma"} · {item.targetType}
                        </p>
                      </div>
                      <p className="text-xs text-muted">
                        {formatDateTime(item.createdAt)}
                      </p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted">
                      {item.actorName ?? item.actorEmail ?? item.actorProfile} realizou esta
                      mudanca.
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4">
                <AdminEmptyState
                  title="Sem atividade recente carregada"
                  description="Quando o control plane nao traz eventos recentes, a priorizacao semanal perde contexto historico."
                />
              </div>
            )
          ) : (
            <p className="mt-4 text-sm text-muted">Carregando trilha auditavel recente.</p>
          )}
        </Card>
      </section>

      <Card>
        <AdminSectionHeader
          eyebrow="O que ainda falta"
          title="Para Product Control virar modulo definitivo"
          description="Esta pagina ja organiza risco e proxima acao, mas ainda nao substitui backlog vivo nem metricas de entrega."
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            "Backlog centralizado com idade, dono, prioridade e lead time.",
            "Bugs por modulo e status de rollout persistidos fora da memoria do time.",
            "Metas 30/60/90 dias vinculadas a tenants, piloto e receita.",
            "Adoção por feature e por tenant para separar modulo lançado de modulo realmente usado.",
            "Comparacao com periodo anterior para medir evolucao, nao apenas foto atual.",
            "Ligacao direta entre acao priorizada e resultado operacional depois do rollout.",
          ].map((item) => (
            <div key={item} className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-ink">{item}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
