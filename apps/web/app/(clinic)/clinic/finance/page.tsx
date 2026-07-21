"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, DollarSign, TrendingUp, Users, BarChart3, Info } from "lucide-react";
import {
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionHeader,
  AdminShortcutPanel,
} from "@/components/platform/platform-admin";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { StatusPill } from "@/components/ui/status-pill";
import { toErrorMessage } from "@/lib/client/http";
import { requestJson } from "@/lib/client/http";

interface FinanceDashboardData {
  generatedAt: string;
  timezone: string;
  periodDays: number;
  range: { startsAt: string; endsAt: string };
  hasPrices: boolean;
  summary: {
    completedAppointments: number;
    totalRevenueCents: number;
    averageTicketCents: number;
  };
  byProfessional: Array<{
    professionalId: string;
    professionalName: string;
    count: number;
    revenueCents: number;
  }>;
  byConsultationType: Array<{
    consultationTypeId: string;
    consultationTypeName: string;
    count: number;
    revenueCents: number;
  }>;
  revenueTimeline: Array<{
    dayKey: string;
    dayLabel: string;
    count: number;
    revenueCents: number;
  }>;
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function PriceWarning() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-amber-800">Preços não configurados</p>
        <p className="text-sm text-amber-700">
          Os procedimentos ainda não têm preço cadastrado. Acesse{" "}
          <a href="/clinic/consultation-types" className="underline">
            Procedimentos Estéticos
          </a>{" "}
          e informe o valor de cada serviço para que o faturamento seja calculado corretamente.
          Enquanto isso, os dados de quantidade de atendimentos estão disponíveis abaixo.
        </p>
      </div>
    </div>
  );
}

const PERIOD_OPTIONS = [
  { label: "7 dias", value: "7" },
  { label: "30 dias", value: "30" },
  { label: "60 dias", value: "60" },
  { label: "90 dias", value: "90" },
];

async function fetchFinanceDashboard(periodDays: string): Promise<FinanceDashboardData> {
  return requestJson<FinanceDashboardData>(
    `/api/clinic/finance-dashboard?periodDays=${periodDays}`,
  );
}

export default function ClinicFinancePage() {
  const [data, setData] = useState<FinanceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("30");

  const load = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFinanceDashboard(p);
      setData(result);
    } catch (err) {
      setError(toErrorMessage(err, "Não foi possível carregar dados financeiros."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [load, period]);

  const metrics = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: "Atendimentos",
        value: String(data.summary.completedAppointments),
        helper: `Concluídos nos últimos ${data.periodDays} dias.`,
      },
      {
        label: "Receita total",
        value: data.hasPrices ? formatBRL(data.summary.totalRevenueCents) : "—",
        helper: data.hasPrices ? "Soma dos atendimentos concluídos." : "Configure os preços.",
        tone: "accent" as const,
      },
      {
        label: "Ticket médio",
        value: data.hasPrices ? formatBRL(data.summary.averageTicketCents) : "—",
        helper: data.hasPrices ? "Receita ÷ atendimentos." : "Configure os preços.",
      },
    ];
  }, [data]);

  const maxProfessionalRevenue = useMemo(() => {
    if (!data?.byProfessional.length) return 0;
    return Math.max(...data.byProfessional.map((p) => p.revenueCents || p.count));
  }, [data]);

  const maxConsultationRevenue = useMemo(() => {
    if (!data?.byConsultationType.length) return 0;
    return Math.max(...data.byConsultationType.map((c) => c.revenueCents || c.count));
  }, [data]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clínica | Financeiro"
        title="Financeiro"
        description="Receita, ticket médio e desempenho dos profissionais por período."
        actions={
          <div className="flex items-center gap-2">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={[
                  "rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                  period === opt.value
                    ? "border-teal-400 bg-teal-50 text-teal-700"
                    : "border-slate-200 bg-white text-ink hover:bg-slate-50",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      >
        <AdminMetricGrid items={metrics} isLoading={loading && !data} />
        <AdminShortcutPanel
          title="Ações rápidas"
          items={[
            { label: "Configurar preços", href: "/clinic/consultation-types", description: "Adicionar valor por procedimento." },
            { label: "Agenda e recepção", href: "/clinic/reception", description: "Voltar ao fluxo operacional." },
          ]}
        />
      </AdminPageHeader>

      {error && <ErrorState message={error} onRetry={() => void load(period)} />}

      {data && !data.hasPrices && <PriceWarning />}

      {data && (
        <div className="space-y-6">
          {/* By Professional */}
          <Card className="space-y-4">
            <AdminSectionHeader
              eyebrow="Equipe"
              title="Receita por profissional"
              description="Atendimentos concluídos e contribuição de cada profissional no período."
            />
            {data.byProfessional.length === 0 ? (
              <p className="text-sm text-muted">Nenhum atendimento concluído no período.</p>
            ) : (
              <div className="space-y-3">
                {data.byProfessional.map((prof) => {
                  const value = data.hasPrices ? prof.revenueCents : prof.count;
                  const max = maxProfessionalRevenue;
                  const width = max > 0 ? Math.round((value / max) * 100) : 0;
                  return (
                    <div key={prof.professionalId} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                            {prof.professionalName.charAt(0)}
                          </div>
                          <span className="font-medium text-ink">{prof.professionalName}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted">
                          <span>{prof.count} atend.</span>
                          {data.hasPrices && (
                            <span className="font-semibold text-teal-700">
                              {formatBRL(prof.revenueCents)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-teal-400 transition-all"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* By Consultation Type */}
          <Card className="space-y-4">
            <AdminSectionHeader
              eyebrow="Procedimentos"
              title="Receita por procedimento"
              description="Quais serviços geraram mais atendimentos e receita."
            />
            {data.byConsultationType.length === 0 ? (
              <p className="text-sm text-muted">Nenhum atendimento concluído no período.</p>
            ) : (
              <div className="space-y-3">
                {data.byConsultationType.map((ct) => {
                  const value = data.hasPrices ? ct.revenueCents : ct.count;
                  const max = maxConsultationRevenue;
                  const width = max > 0 ? Math.round((value / max) * 100) : 0;
                  return (
                    <div key={ct.consultationTypeId} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-ink">{ct.consultationTypeName}</span>
                        <div className="flex items-center gap-3 text-xs text-muted">
                          <span>{ct.count} atend.</span>
                          {data.hasPrices && (
                            <span className="font-semibold text-teal-700">
                              {formatBRL(ct.revenueCents)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-blue-400 transition-all"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Revenue Timeline */}
          {data.revenueTimeline.length > 0 && (
            <Card className="space-y-4">
              <AdminSectionHeader
                eyebrow="Evolução"
                title="Atendimentos por dia"
                description="Distribuição diária de atendimentos concluídos no período."
              />
              <div className="flex items-end gap-1" style={{ height: 120 }}>
                {data.revenueTimeline.map((day) => {
                  const maxCount = Math.max(...data.revenueTimeline.map((d) => d.count), 1);
                  const heightPct = Math.round((day.count / maxCount) * 100);
                  return (
                    <div
                      key={day.dayKey}
                      className="group relative flex flex-1 flex-col items-center justify-end"
                    >
                      <div
                        className="w-full rounded-t-md bg-teal-400 transition-all group-hover:bg-teal-600"
                        style={{ height: `${heightPct}%`, minHeight: day.count > 0 ? 4 : 0 }}
                        title={`${day.dayLabel}: ${day.count} atend.${data.hasPrices ? ` · ${formatBRL(day.revenueCents)}` : ""}`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-muted">
                <span>{data.revenueTimeline[0]?.dayLabel}</span>
                <span>{data.revenueTimeline[data.revenueTimeline.length - 1]?.dayLabel}</span>
              </div>
            </Card>
          )}
        </div>
      )}

      {loading && !data && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="space-y-3">
                <div className="h-4 w-48 rounded-full bg-slate-200" />
                <div className="h-3 w-32 rounded-full bg-slate-100" />
                <div className="mt-4 space-y-2">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="h-8 w-full rounded-xl bg-slate-100" />
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
