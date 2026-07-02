"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
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

export default function PlatformGrowthPage() {
  const { dashboard, isLoading, error, reload } = usePlatformDashboard();

  const totalTenants = dashboard?.tenants.total ?? 0;
  const activeTenants = dashboard?.tenants.active ?? 0;
  const trialTenants = dashboard?.subscriptions.trial ?? 0;
  const pastDueTenants = dashboard?.subscriptions.pastDue ?? 0;
  const canceledTenants = dashboard?.subscriptions.canceled ?? 0;

  const metrics = dashboard
    ? [
        {
          label: "Total de clinicas",
          value: String(totalTenants),
          helper: "Total provisionado na plataforma.",
          tone: "accent" as const,
        },
        {
          label: "Clinicas ativas",
          value: String(activeTenants),
          helper: "Com plano ativo e operação em curso.",
        },
        {
          label: "Em trial",
          value: String(trialTenants),
          helper: "Pipeline imediato de conversão.",
          tone: trialTenants > 0 ? ("warning" as const) : ("default" as const),
        },
        {
          label: "Churn / canceladas",
          value: String(canceledTenants),
          helper: "Subscriptions canceladas na base.",
          tone: canceledTenants > 0 ? ("danger" as const) : ("default" as const),
        },
      ]
    : [];

  const planMix = dashboard?.subscriptions.planMix ?? [];
  const latestTenants = dashboard?.tenants.latest ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Command Center"
        title="Growth"
        description="Visao de crescimento da base: novas clinicas, conversao de trial, mix de planos e sinais de churn. Dados extraidos diretamente das subscriptions ativas."
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
            label: "Abrir tenants",
            description: "Investigar clinicas em trial ou com setup pendente.",
            href: "/platform/tenants",
          },
          {
            label: "Abrir finance",
            description: "Cruzar crescimento com receita contratada e risco.",
            href: "/platform/finance",
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
            eyebrow="Funil de crescimento"
            title="Da base total ao pagante ativo"
            description="Leitura do estado atual da base. Nao ha funil temporal persistido ainda — estes numeros refletem o snapshot presente das subscriptions."
          />

          {dashboard ? (
            <div className="mt-4 space-y-3">
              {[
                {
                  label: "Total provisionado",
                  value: totalTenants,
                  description: "Todas as clinicas criadas na plataforma.",
                  tone: "default" as const,
                },
                {
                  label: "Com plano aberto",
                  value: activeTenants + trialTenants + pastDueTenants,
                  description: "Ativo + trial + em atraso (algum contrato vigente).",
                  tone: "default" as const,
                },
                {
                  label: "Pagantes ativos",
                  value: dashboard.subscriptions.paidPlanTenants,
                  description: "Com plano de valor > 0 e subscription ativa.",
                  tone: "accent" as const,
                },
                {
                  label: "Em trial",
                  value: trialTenants,
                  description: "Pipeline imediato a converter.",
                  tone: trialTenants > 0 ? ("warning" as const) : ("default" as const),
                },
                {
                  label: "Em atraso (past due)",
                  value: pastDueTenants,
                  description: "Contratos com pagamento em aberto.",
                  tone: pastDueTenants > 0 ? ("danger" as const) : ("default" as const),
                },
                {
                  label: "Cancelados",
                  value: canceledTenants,
                  description: "Churn acumulado na base.",
                  tone: canceledTenants > 0 ? ("danger" as const) : ("default" as const),
                },
              ].map((item) => {
                const barPct =
                  totalTenants > 0
                    ? Math.min(100, Math.round((item.value / totalTenants) * 100))
                    : 0;
                const barColor =
                  item.tone === "accent"
                    ? "bg-teal-400"
                    : item.tone === "warning"
                      ? "bg-amber-400"
                      : item.tone === "danger"
                        ? "bg-rose-400"
                        : "bg-slate-300";

                return (
                  <div
                    key={item.label}
                    className="rounded-[20px] border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{item.label}</p>
                        <p className="text-xs text-muted">{item.description}</p>
                      </div>
                      <p className="text-2xl font-bold text-ink">{item.value}</p>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted">
                      {barPct}% do total provisionado
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4">
              <AdminEmptyState
                title="Dados nao carregados"
                description="O dashboard da plataforma ainda nao foi carregado. Verifique conexao com o backend."
              />
            </div>
          )}
        </Card>

        <Card>
          <AdminSectionHeader
            eyebrow="Mix comercial"
            title="Distribuicao por plano"
            description="Quantas clinicas estao em cada plano ativo neste momento."
          />

          {planMix.length > 0 ? (
            <div className="mt-4 space-y-3">
              {planMix.map((plan) => (
                <div
                  key={plan.planId}
                  className="rounded-[20px] border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{plan.name}</p>
                      <p className="text-xs text-muted">{plan.code}</p>
                    </div>
                    <span className="rounded-full bg-teal-100 px-2.5 py-1 text-xs font-bold text-teal-700">
                      {plan.tenantCount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <AdminEmptyState
                title="Sem planos em uso"
                description="Nenhum plano ativo detectado na base no momento."
                action={
                  <Link
                    href="/platform/plans"
                    className={buttonVariants({ variant: "secondary" })}
                  >
                    Gerenciar planos
                  </Link>
                }
              />
            </div>
          )}
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <AdminSectionHeader
            eyebrow="Status da base"
            title="Distribuicao por status de subscription"
            description="Snapshot atual de todos os estados de contrato na base."
            actions={
              <StatusPill
                label={dashboard ? "Ao vivo" : "Carregando"}
                tone={dashboard ? "success" : "neutral"}
              />
            }
          />

          {dashboard ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                {
                  label: "Ativas",
                  value: dashboard.subscriptions.active,
                  tone: "accent" as const,
                },
                {
                  label: "Trial",
                  value: dashboard.subscriptions.trial,
                  tone: "warning" as const,
                },
                {
                  label: "Em atraso",
                  value: dashboard.subscriptions.pastDue,
                  tone: "danger" as const,
                },
                {
                  label: "Canceladas",
                  value: dashboard.subscriptions.canceled,
                  tone: "danger" as const,
                },
                {
                  label: "Expiradas",
                  value: dashboard.subscriptions.expired,
                  tone: "default" as const,
                },
                {
                  label: "Sem contrato",
                  value: dashboard.tenants.withoutCurrentPlan,
                  tone: "default" as const,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[20px] border border-slate-200 bg-slate-50 p-3"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-ink">{item.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <AdminEmptyState
                title="Carregando"
                description="Aguardando dados do dashboard."
              />
            </div>
          )}
        </Card>

        <Card>
          <AdminSectionHeader
            eyebrow="Ultimas entradas"
            title="Clinicas mais recentes"
            description="As ultimas clinicas provisionadas na plataforma por data de criacao."
          />

          {latestTenants.length > 0 ? (
            <div className="mt-4 space-y-3">
              {latestTenants.map((tenant) => (
                <div
                  key={tenant.id}
                  className="rounded-[20px] border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{tenant.name}</p>
                      <p className="text-xs text-muted">{tenant.slug}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <StatusPill
                        label={tenant.status === "ACTIVE" ? "Ativa" : tenant.status === "INACTIVE" ? "Inativa" : "Suspensa"}
                        tone={tenant.status === "ACTIVE" ? "success" : tenant.status === "INACTIVE" ? "neutral" : "danger"}
                      />
                      {tenant.currentPlan ? (
                        <span className="text-[11px] text-muted">
                          {tenant.currentPlan.name}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted">Sem plano</span>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Criado em {new Date(tenant.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <AdminEmptyState
                title="Sem clinicas recentes"
                description={isLoading ? "Carregando..." : "Nenhuma clinica para exibir."}
              />
            </div>
          )}
        </Card>
      </section>

      <Card>
        <AdminSectionHeader
          eyebrow="Sinais ausentes"
          title="O que ainda nao esta rastreado"
          description="Dados que precisam ser persistidos para que o modulo de growth tenha profundidade real."
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            "Origem de lead, canal e campanha — sem isso nao ha leitura de CAC ou eficiencia de inbound.",
            "Conversao por etapa com timestamp — funil de tempo entre cadastro e ativacao ainda nao rastreado.",
            "Motivo de cancelamento — churn sem taxonomia nao permite identificar padroes de perda.",
            "Data de primeiro atendimento — o momento de ativacao real ainda nao e persistido como evento.",
            "Reativacoes — clinicas que voltaram apos cancelamento nao sao distinguidas de novas entradas.",
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
