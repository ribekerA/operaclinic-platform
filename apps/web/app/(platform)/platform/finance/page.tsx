"use client";

import Link from "next/link";
import {
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionHeader,
  AdminShortcutPanel,
} from "@/components/platform/platform-admin";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { usePlatformDashboard } from "@/hooks/use-platform-dashboard";
import { formatCurrencyFromCents } from "@/lib/formatters";

export default function PlatformFinancePage() {
  const { dashboard, isLoading, error, reload } = usePlatformDashboard();
  const primaryRevenue = dashboard?.subscriptions.revenueByCurrency[0] ?? null;

  const metrics = dashboard
    ? [
        {
          label: "Tenants pagos",
          value: String(dashboard.subscriptions.paidPlanTenants),
          helper: "Base com receita contratada ativa.",
        },
        {
          label: "Tenants em atraso",
          value: String(dashboard.subscriptions.pastDue),
          helper: "Sinal direto de risco em MRR e sustentacao.",
          tone:
            dashboard.subscriptions.pastDue > 0
              ? ("danger" as const)
              : ("default" as const),
        },
        {
          label: "MRR contratado",
          value: primaryRevenue
            ? formatCurrencyFromCents(
                primaryRevenue.contractedMrrCents,
                primaryRevenue.currency,
              )
            : "--",
          helper: "Receita recorrente contratada na moeda principal.",
        },
        {
          label: "Receita em risco",
          value: primaryRevenue
            ? formatCurrencyFromCents(
                primaryRevenue.pastDueExposureCents,
                primaryRevenue.currency,
              )
            : "--",
          helper: "Exposicao atual por atraso financeiro.",
          tone:
            primaryRevenue && primaryRevenue.pastDueExposureCents > 0
              ? ("danger" as const)
              : ("default" as const),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Command Center"
        title="Finance"
        description="Leitura financeira da plataforma orientada a receita contratada, risco imediato e sustentabilidade da base ativa."
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
            label: "Abrir pagamentos",
            description: "Ver fila comercial e onboardings em execucao.",
            href: "/platform/payments",
          },
          {
            label: "Abrir planos",
            description: "Cruzar mix comercial com precificacao.",
            href: "/platform/plans",
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

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <AdminSectionHeader
            eyebrow="Ja sustentado"
            title="Receita e exposicao atual"
            description="Este modulo ja centraliza contratacao ativa, base paga, atraso e pipeline imediato de trial."
          />
          <div className="mt-4 space-y-3 text-sm leading-6 text-muted">
            <p>
              O controle financeiro ja consegue responder quanto da carteira esta contratado e quanto esta imediatamente em risco.
            </p>
            <p>
              Isso e suficiente para decisao tatico-comercial do piloto, mas ainda nao fecha caixa, margem ou payback.
            </p>
          </div>
        </Card>

        <Card>
          <AdminSectionHeader
            eyebrow="Ainda parcial"
            title="O que falta para o modulo financeiro ficar definitivo"
            description="O modulo ainda nao sustenta previsao de caixa 30/60/90 dias, custo operacional estimado ou margem."
            actions={<StatusPill label="Parcial" tone="warning" />}
          />
          <div className="mt-4 space-y-3">
            {[
              "Conectar custos operacionais reais por ambiente e integracao.",
              "Persistir setup vendido e inadimplencia com historico.",
              "Adicionar projeção de caixa e cenarios de ARR/LTV com base auditavel.",
            ].map((item) => (
              <div key={item} className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-ink">{item}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <Card>
        <AdminSectionHeader
          eyebrow="Acoes"
          title="Perguntas que este modulo ja ajuda a responder"
          description="A torre financeira deve responder em minutos se a receita esta sustentando o piloto ou se a base esta vazando."
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            "Quanto de MRR contratado esta efetivamente em risco hoje?",
            "A base paga esta crescendo ou acumulando atraso?",
            "O pipeline trial justifica acelerar rollout ou segurar estabilidade?",
          ].map((question) => (
            <div key={question} className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-ink">{question}</p>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <Link
            href="/platform/payments"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
          >
            Abrir fila financeira
          </Link>
        </div>
      </Card>
    </div>
  );
}
