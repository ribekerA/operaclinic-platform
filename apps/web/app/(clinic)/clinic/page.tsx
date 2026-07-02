"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AestheticClinicExecutiveDashboardResponse } from "@operaclinic/shared";
import {
  AdminEmptyState,
  AdminSectionHeader,
  adminSelectClassName,
} from "@/components/platform/platform-admin";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  CheckCircle2,
  CircleDashed,
  MessageCircleMore,
  Smartphone,
  Users,
  Stethoscope,
  CalendarRange,
} from "lucide-react";

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
        label: "Recepção",
        description: "Fila, confirmações e check-in.",
      },
      {
        href: "/clinic/users",
        label: "Usuários",
        description: "Acessos e papéis da equipe.",
      },
      {
        href: "/clinic/professionals",
        label: "Profissionais",
        description: "Equipe assistencial e vínculos.",
      },
      {
        href: "/clinic/units",
        label: "Unidades",
        description: "Estrutura física da operação.",
      },
    ];
  }

  return [
    {
      href: "/clinic/reception",
      label: "Recepção",
      description: "Entrada principal do dia.",
    },
    {
      href: "/clinic/patients",
      label: "Pacientes",
      description: "Busca e cadastro rápido.",
    },
    {
      href: "/clinic/professionals",
      label: "Profissionais",
      description: "Equipe e disponibilidade.",
    },
    {
      href: "/clinic/consultation-types",
      label: "Procedimentos",
      description: "Avaliações, sessões e durações.",
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
      title: "Confirmações pendentes",
      value: String(dashboard.appointments.pendingConfirmation),
      description: "A recepção deve limpar isso primeiro.",
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
      description: "A fila está perdendo ritmo.",
      tone: "warning",
    });
  }

  if (dashboard.appointments.noShowRate > 10) {
    items.push({
      title: "Ausências acima do ideal",
      value: formatPercent(dashboard.appointments.noShowRate),
      description: "Revise confirmações e horários mais sensíveis.",
      tone: "danger",
    });
  }

  if (dashboard.quality.utilizationRate < 60) {
    items.push({
      title: "Agenda com folga",
      value: formatPercent(dashboard.quality.utilizationRate),
      description: "Existe espaço para ocupar melhor a agenda.",
      tone: "neutral",
    });
  }

  if (!items.length) {
    items.push({
      title: "Operação estável",
      value: formatPercent(dashboard.quality.utilizationRate),
      description: "Nada pede escalação imediata agora.",
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
          "Não foi possível carregar o painel principal da clínica.",
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
        helper: dashboard ? `Últimos ${dashboard.periodDays} dias.` : "Carregando.",
        className: "border-slate-200 bg-white",
      },
      {
        label: "Conclusão",
        value: dashboard ? formatPercent(dashboard.appointments.completionRate) : "--",
        helper: dashboard
          ? `${dashboard.appointments.completed} atendimentos concluídos.`
          : "Carregando.",
        className: "border-teal-200 bg-teal-50",
      },
      {
        label: "Sem confirmação",
        value: dashboard ? String(dashboard.appointments.pendingConfirmation) : "--",
        helper: "Pendências para a recepção.",
        className:
          dashboard && dashboard.appointments.pendingConfirmation > 0
            ? "border-amber-200 bg-amber-50"
            : "border-slate-200 bg-white",
      },
      {
        label: "Ocupação",
        value: dashboard ? formatPercent(dashboard.quality.utilizationRate) : "--",
        helper: dashboard
          ? `Ausências em ${formatPercent(dashboard.appointments.noShowRate)}.`
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

      <section className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        {/* Fazer agora — primary, left */}
        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Fazer agora"
            title="Prioridades imediatas"
            description="O que pede ação antes de abrir qualquer outra tela."
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
                  <span className={`text-2xl font-semibold text-ink ${isLoading ? "opacity-40" : ""}`}>
                    {item.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* KPIs — secondary, right */}
        <Card className="space-y-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                Hoje na clínica
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem]">
                Entrada da operação
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="period-select" className="sr-only">
                Período de análise
              </label>
              <select
                id="period-select"
                value={periodDays}
                onChange={(event) => setPeriodDays(event.target.value)}
                className={`${adminSelectClassName} min-w-[140px]`}
                disabled={isLoading}
                aria-label="Período de análise"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                onClick={() => void loadDashboard()}
                disabled={isLoading}
              >
                {isLoading ? "Atualizando..." : "Atualizar"}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {isLoading && !dashboard
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="animate-pulse rounded-[24px] border border-slate-200 bg-white p-4">
                    <div className="h-3 w-20 rounded-full bg-slate-200" />
                    <div className="mt-3 h-8 w-16 rounded-full bg-slate-200" />
                    <div className="mt-3 h-3 w-28 rounded-full bg-slate-200" />
                  </div>
                ))
              : topMetrics.map((item) => (
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
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.98fr_1.02fr]">
        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Recepção"
            title="Entrada principal do dia"
            description="Confirmações, check-in e fila a um clique."
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
                Confirmações
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
              <p className="mt-2 text-sm text-muted">Pacientes já recebidos.</p>
            </div>
            <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700">
                Atraso médio
              </p>
              <p className="mt-2 text-3xl font-semibold text-ink">
                {dashboard?.appointments.averageCheckInDelayMinutes ?? 0} min
              </p>
              <p className="mt-2 text-sm text-muted">Quando sobe, a fila vira prioridade.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/clinic/reception" className={buttonVariants({ variant: "primary" })}>
              Abrir recepção
            </Link>
            <Link href="/clinic/patients" className={buttonVariants({ variant: "secondary" })}>
              Ver pacientes
            </Link>
          </div>
        </Card>

        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Acessos rápidos"
            title="Onde a equipe entra"
            description="Atalhos para os módulos mais usados."
          />

          <div className="grid gap-3 md:grid-cols-2">
            {quickLinks.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  index === 0
                    ? "col-span-full rounded-[24px] border border-teal-200 bg-teal-50 p-4 transition hover:border-teal-300 hover:bg-teal-100"
                    : "rounded-[24px] border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50"
                }
              >
                <p className={`text-base font-semibold ${index === 0 ? "text-teal-900" : "text-ink"}`}>
                  {item.label}
                </p>
                <p className={`mt-1 text-sm leading-6 ${index === 0 ? "text-teal-700" : "text-muted"}`}>
                  {item.description}
                </p>
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
            description="Quem mais atendeu no período atual."
          />

          <div className="space-y-3">
            {(dashboard?.quality.professionalPerformance ?? []).length > 0 ? (
              (dashboard?.quality.professionalPerformance ?? []).map((item) => (
                <div key={item.professionalId} className="rounded-[24px] border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-ink">{item.professionalName}</p>
                      <p className="text-xs text-muted">{item.total} atendimentos no período</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                        conclusão {formatPercent(item.completionRate)}
                      </span>
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-700">
                        ausência {formatPercent(item.noShowRate)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <AdminEmptyState
                title="Sem leitura por profissional"
                description="Ainda não há volume suficiente para destacar a equipe neste recorte."
              />
            )}
          </div>
        </Card>

        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Ausências"
            title="Resumo recente"
            description="Últimos dias para entender se a falta está subindo ou caindo."
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
                title="Sem histórico recente"
                description="Ainda não há pontos suficientes para resumir as faltas."
              />
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
