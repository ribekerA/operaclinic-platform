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

function renderIssues(issues: string[]) {
  if (issues.length === 0) {
    return "Sem bloqueios imediatos nesta dependencia.";
  }

  return issues.join(" | ");
}

export default function PlatformReliabilityPage() {
  const { dashboard, isLoading, error, reload } = usePlatformDashboard();
  const readiness = dashboard?.operationalReadiness ?? null;

  const metrics = readiness
    ? [
        {
          label: "Readiness geral",
          value: readiness.status.toUpperCase(),
          helper: "Estado consolidado do ambiente atual.",
          tone:
            readiness.status === "error"
              ? ("danger" as const)
              : readiness.status === "degraded"
                ? ("warning" as const)
                : ("accent" as const),
        },
        {
          label: "Banco",
          value:
            readiness.database.latencyMs !== null
              ? `${readiness.database.latencyMs} ms`
              : "--",
          helper: renderIssues(readiness.database.issues),
          tone:
            readiness.database.status === "error"
              ? ("danger" as const)
              : readiness.database.status === "degraded"
                ? ("warning" as const)
                : ("default" as const),
        },
        {
          label: "Payment provider",
          value: readiness.payment.provider.toUpperCase(),
          helper: renderIssues(readiness.payment.issues),
          tone:
            readiness.payment.status === "error"
              ? ("danger" as const)
              : readiness.payment.status === "degraded"
                ? ("warning" as const)
                : ("default" as const),
        },
        {
          label: "Meta conexoes",
          value: String(readiness.messaging.activeMetaConnections),
          helper: renderIssues(readiness.messaging.issues),
          tone:
            readiness.messaging.status === "error"
              ? ("danger" as const)
              : readiness.messaging.status === "degraded"
                ? ("warning" as const)
                : ("default" as const),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Command Center"
        title="Reliability"
        description="Camada dura da torre de controle: prontidao real do ambiente, riscos abertos e bloqueadores de rollout."
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
            description: "Localizar clinicas sem setup ou sem base operacional.",
            href: "/platform/tenants",
          },
          {
            label: "Abrir operations",
            description: "Cruzar risco tecnico com risco operacional.",
            href: "/platform/operations",
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

      <section className="grid gap-4 xl:grid-cols-3">
        {readiness ? (
          [
            {
              title: "Database",
              status: readiness.database.status,
              details: renderIssues(readiness.database.issues),
            },
            {
              title: "Payment",
              status: readiness.payment.status,
              details: renderIssues(readiness.payment.issues),
            },
            {
              title: "Messaging",
              status: readiness.messaging.status,
              details: renderIssues(readiness.messaging.issues),
            },
          ].map((item) => (
            <Card key={item.title}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink">{item.title}</h2>
                <StatusPill
                  label={item.status}
                  tone={
                    item.status === "error"
                      ? "danger"
                      : item.status === "degraded"
                        ? "warning"
                        : "success"
                  }
                />
              </div>
              <p className="mt-4 text-sm leading-6 text-muted">{item.details}</p>
            </Card>
          ))
        ) : (
          <Card>
            <p className="text-sm text-muted">Carregando dependencias criticas.</p>
          </Card>
        )}
      </section>

      <Card>
        <AdminSectionHeader
          eyebrow="Falta para ficar definitivo"
          title="Lacunas ainda nao centralizadas"
          description="A arquitetura do modulo ja esta definida, mas alguns sinais criticos ainda nao sobem para a torre."
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            "Queue lag por worker e por tenant.",
            "Saude do cron de follow-up assincrono.",
            "Historico persistente de conflitos e latencia operacional.",
            "Risco de scheduling sob carga real por ambiente.",
            "Indicadores de drift entre docs, rollout e estado real.",
            "Alertas de seguranca e exposicao tecnica por ambiente.",
          ].map((item) => (
            <div key={item} className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-ink">{item}</p>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <Link
            href="/platform"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
          >
            Voltar ao overview
          </Link>
        </div>
      </Card>
    </div>
  );
}
