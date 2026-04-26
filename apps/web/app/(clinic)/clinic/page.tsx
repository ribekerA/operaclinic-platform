"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AestheticClinicExecutiveDashboardResponse } from "@operaclinic/shared";
import {
  AdminEmptyState,
  AdminSectionHeader,
  adminSelectClassName,
} from "@/components/platform/platform-admin";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { useSession } from "@/hooks/use-session";
import { getAestheticClinicExecutiveDashboard } from "@/lib/client/clinic-dashboard-api";
import { toErrorMessage } from "@/lib/client/http";
import {
  type AestheticClinicActor,
  resolveAestheticClinicActor,
} from "@/lib/clinic-actor";
import { getSubscriptionStatusLabel } from "@/lib/formatters";

const PERIOD_OPTIONS = [
  { label: "7 dias", value: "7" },
  { label: "14 dias", value: "14" },
  { label: "30 dias", value: "30" },
  { label: "60 dias", value: "60" },
];

interface QuickLink {
  href: string;
  label: string;
  description: string;
}

interface FocusItem {
  title: string;
  value: string;
  description: string;
  tone: "neutral" | "warning" | "danger";
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function getFinanceTone(
  status: AestheticClinicExecutiveDashboardResponse["finance"]["subscriptionStatus"],
): "success" | "warning" | "danger" | "neutral" {
  if (!status) {
    return "neutral";
  }

  if (status === "PAST_DUE") {
    return "danger";
  }

  if (status === "ACTIVE") {
    return "success";
  }

  if (status === "TRIAL") {
    return "warning";
  }

  return "neutral";
}

function getQuickLinks(actor: AestheticClinicActor): QuickLink[] {
  if (actor === "admin") {
    return [
      {
        href: "/clinic/reception",
        label: "Recepcao",
        description: "Fila, confirmacoes e check-in.",
      },
      {
        href: "/clinic/users",
        label: "Usuarios",
        description: "Acessos e papeis da equipe.",
      },
      {
        href: "/clinic/professionals",
        label: "Profissionais",
        description: "Equipe assistencial e vinculos.",
      },
      {
        href: "/clinic/units",
        label: "Unidades",
        description: "Estrutura fisica da operacao.",
      },
    ];
  }

  return [
    {
      href: "/clinic/reception",
      label: "Recepcao",
      description: "Entrada principal do dia.",
    },
    {
      href: "/clinic/patients",
      label: "Pacientes",
      description: "Busca e cadastro rapido.",
    },
    {
      href: "/clinic/professionals",
      label: "Profissionais",
      description: "Equipe e disponibilidade.",
    },
    {
      href: "/clinic/consultation-types",
      label: "Procedimentos",
      description: "Avaliacoes, sessoes e duracoes.",
    },
  ];
}

function buildFocusItems(
  dashboard: AestheticClinicExecutiveDashboardResponse | null,
): FocusItem[] {
  if (!dashboard) {
    return [
      {
        title: "Carregando",
        value: "--",
        description: "Buscando leitura do dia.",
        tone: "neutral",
      },
    ];
  }

  const items: FocusItem[] = [];

  if (dashboard.appointments.pendingConfirmation > 0) {
    items.push({
      title: "Confirmacoes pendentes",
      value: String(dashboard.appointments.pendingConfirmation),
      description: "A recepcao deve limpar isso primeiro.",
      tone:
        dashboard.appointments.pendingConfirmation >= 10 ? "warning" : "neutral",
    });
  }

  if (
    dashboard.appointments.averageCheckInDelayMinutes !== null &&
    dashboard.appointments.averageCheckInDelayMinutes > 10
  ) {
    items.push({
      title: "Check-in atrasando",
      value: `${dashboard.appointments.averageCheckInDelayMinutes} min`,
      description: "A fila esta perdendo ritmo.",
      tone: "warning",
    });
  }

  if (dashboard.appointments.noShowRate > 10) {
    items.push({
      title: "Ausencias acima do ideal",
      value: formatPercent(dashboard.appointments.noShowRate),
      description: "Revise confirmacoes e horarios mais sensiveis.",
      tone: "danger",
    });
  }

  if (dashboard.quality.utilizationRate < 60) {
    items.push({
      title: "Agenda com folga",
      value: formatPercent(dashboard.quality.utilizationRate),
      description: "Existe espaco para ocupar melhor a agenda.",
      tone: "neutral",
    });
  }

  if (!items.length) {
    items.push({
      title: "Operacao estavel",
      value: formatPercent(dashboard.quality.utilizationRate),
      description: "Nada pede escalacao imediata agora.",
      tone: "neutral",
    });
  }

  return items.slice(0, 4);
}

function getFocusToneClassName(tone: FocusItem["tone"]): string {
  if (tone === "danger") {
    return "border-rose-200 bg-rose-50";
  }

  if (tone === "warning") {
    return "border-amber-200 bg-amber-50";
  }

  return "border-slate-200 bg-white";
}

export default function ClinicDashboardPage() {
  const { user } = useSession({ expectedProfile: "clinic" });
  const [dashboard, setDashboard] =
    useState<AestheticClinicExecutiveDashboardResponse | null>(null);
  const [periodDays, setPeriodDays] = useState("30");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const actor = useMemo(
    () => (user ? resolveAestheticClinicActor(user.roles) : "unknown"),
    [user],
  );
  const isAdmin = actor === "admin";
  const focusItems = buildFocusItems(dashboard);
  const quickLinks = getQuickLinks(actor);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setDashboard(await getAestheticClinicExecutiveDashboard({ periodDays }));
    } catch (requestError) {
      setError(
        toErrorMessage(
          requestError,
          "Nao foi possivel carregar o painel principal da clinica.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [periodDays]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const topMetrics = useMemo(
    () => [
      {
        label: "Atendimentos",
        value: dashboard ? String(dashboard.appointments.total) : "--",
        helper: dashboard ? `Ultimos ${dashboard.periodDays} dias.` : "Carregando.",
        className: "border-slate-200 bg-white",
      },
      {
        label: "Conclusao",
        value: dashboard ? formatPercent(dashboard.appointments.completionRate) : "--",
        helper: dashboard
          ? `${dashboard.appointments.completed} atendimentos concluidos.`
          : "Carregando.",
        className: "border-teal-200 bg-teal-50",
      },
      {
        label: "Sem confirmacao",
        value: dashboard ? String(dashboard.appointments.pendingConfirmation) : "--",
        helper: "Pendencias para a recepcao.",
        className:
          dashboard && dashboard.appointments.pendingConfirmation > 0
            ? "border-amber-200 bg-amber-50"
            : "border-slate-200 bg-white",
      },
      {
        label: "Ocupacao",
        value: dashboard ? formatPercent(dashboard.quality.utilizationRate) : "--",
        helper: dashboard
          ? `Ausencias em ${formatPercent(dashboard.appointments.noShowRate)}.`
          : "Carregando.",
        className: "border-slate-200 bg-white",
      },
    ],
    [dashboard],
  );

  return (
    <div className="space-y-4">
      {error ? (
        <Card className="border-red-200 bg-red-50" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.28fr_0.72fr]">
        <Card className="space-y-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                Hoje na clinica
              </p>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem]">
                  Entrada da operacao
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                  Veja o que pede acao agora e entre rapido no fluxo principal.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={periodDays}
                onChange={(event) => setPeriodDays(event.target.value)}
                className={`${adminSelectClassName} min-w-[140px]`}
                disabled={isLoading}
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  void loadDashboard();
                }}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
                disabled={isLoading}
              >
                {isLoading ? "Atualizando..." : "Atualizar"}
              </button>
              <Link
                href="/clinic/reception"
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Abrir recepcao
              </Link>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            {topMetrics.map((item) => (
              <div key={item.label} className={`rounded-[24px] border p-4 ${item.className}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  {item.label}
                </p>
                <p className="mt-2 text-3xl font-semibold text-ink">{item.value}</p>
                <p className="mt-2 text-sm text-muted">{item.helper}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Fazer agora"
            title="Prioridades imediatas"
            description="Use esta leitura para decidir o proximo passo sem abrir varias telas."
          />

          <div className="space-y-3">
            {focusItems.map((item) => (
              <div
                key={item.title}
                className={`rounded-[24px] border p-4 ${getFocusToneClassName(item.tone)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">{item.description}</p>
                  </div>
                  <span className="text-2xl font-semibold text-ink">{item.value}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.98fr_1.02fr]">
        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Recepcao"
            title="Entrada principal do dia"
            description="Confirmacoes, check-in e fila precisam estar a um clique."
            actions={
              isAdmin && dashboard ? (
                <StatusPill
                  label={
                    dashboard.finance.subscriptionStatus
                      ? getSubscriptionStatusLabel(dashboard.finance.subscriptionStatus)
                      : "Sem plano"
                  }
                  tone={getFinanceTone(dashboard.finance.subscriptionStatus)}
                />
              ) : undefined
            }
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                Confirmacoes
              </p>
              <p className="mt-2 text-3xl font-semibold text-ink">
                {dashboard?.appointments.pendingConfirmation ?? "--"}
              </p>
              <p className="mt-2 text-sm text-muted">Ainda esperando retorno.</p>
            </div>
            <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                Check-ins
              </p>
              <p className="mt-2 text-3xl font-semibold text-ink">
                {dashboard?.appointments.checkedIn ?? "--"}
              </p>
              <p className="mt-2 text-sm text-muted">Pacientes ja recebidos.</p>
            </div>
            <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700">
                Atraso medio
              </p>
              <p className="mt-2 text-3xl font-semibold text-ink">
                {dashboard?.appointments.averageCheckInDelayMinutes ?? 0} min
              </p>
              <p className="mt-2 text-sm text-muted">Quando sobe, a fila vira prioridade.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/clinic/reception"
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Abrir recepcao
            </Link>
            <Link
              href="/clinic/patients"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
            >
              Ver pacientes
            </Link>
          </div>
        </Card>

        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Acessos rapidos"
            title="Onde a equipe entra"
            description="Atalhos de treinamento curto, com nomes diretos e sem desvio."
          />

          <div className="grid gap-3 md:grid-cols-2">
            {quickLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[24px] border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <p className="text-base font-semibold text-ink">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{item.description}</p>
              </Link>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Equipe"
            title="Profissionais em destaque"
            description="Quem mais atendeu no periodo atual."
          />

          <div className="space-y-3">
            {(dashboard?.quality.professionalPerformance ?? []).length > 0 ? (
              (dashboard?.quality.professionalPerformance ?? []).map((item) => (
                <div key={item.professionalId} className="rounded-[24px] border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-ink">{item.professionalName}</p>
                      <p className="text-xs text-muted">{item.total} atendimentos no periodo</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                        conclusao {formatPercent(item.completionRate)}
                      </span>
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-700">
                        ausencia {formatPercent(item.noShowRate)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <AdminEmptyState
                title="Sem leitura por profissional"
                description="Ainda nao ha volume suficiente para destacar a equipe neste recorte."
              />
            )}
          </div>
        </Card>

        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Ausencias"
            title="Resumo recente"
            description="Ultimos dias para entender se a falta esta subindo ou caindo."
          />

          <div className="grid gap-3 sm:grid-cols-2">
            {(dashboard?.quality.noShowTimeline ?? []).slice(-4).length > 0 ? (
              (dashboard?.quality.noShowTimeline ?? []).slice(-4).map((point) => (
                <div
                  key={point.dayKey}
                  className="rounded-[24px] border border-slate-200 bg-white p-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    {point.dayLabel}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-ink">
                    {point.noShow}/{point.total}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    taxa {formatPercent(point.noShowRate)}
                  </p>
                </div>
              ))
            ) : (
              <AdminEmptyState
                title="Sem historico recente"
                description="Ainda nao ha pontos suficientes para resumir as faltas."
              />
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
