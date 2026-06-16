"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminEmptyState,
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionHeader,
  adminInputClassName,
  adminSelectClassName,
} from "@/components/platform/platform-admin";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { requestJson, toErrorMessage } from "@/lib/client/http";
import { formatDateTime } from "@/lib/formatters";

type DispatchStatus = "PROCESSING" | "SENT" | "FAILED";
type DispatchKind = "APPOINTMENT_REMINDER_24H";

interface FollowUpDispatchItem {
  id: string;
  appointmentId: string;
  patientId: string;
  patientName: string | null;
  kind: DispatchKind;
  status: DispatchStatus;
  scheduledFor: string;
  dispatchedAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface ListFollowUpDispatchesResult {
  items: FollowUpDispatchItem[];
  total: number;
}

interface FollowUpDispatchStats {
  processing: number;
  sent: number;
  failed: number;
  total: number;
}

function getStatusLabel(status: DispatchStatus): string {
  switch (status) {
    case "PROCESSING":
      return "Processando";
    case "SENT":
      return "Enviado";
    case "FAILED":
      return "Falhou";
    default:
      return status;
  }
}

function getStatusTone(
  status: DispatchStatus,
): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "SENT":
      return "success";
    case "PROCESSING":
      return "warning";
    case "FAILED":
      return "danger";
    default:
      return "neutral";
  }
}

function getKindLabel(kind: DispatchKind): string {
  switch (kind) {
    case "APPOINTMENT_REMINDER_24H":
      return "Lembrete 24h";
    default:
      return kind;
  }
}

async function fetchDispatches(query: {
  from?: string;
  to?: string;
  status?: string;
}): Promise<ListFollowUpDispatchesResult> {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.status) params.set("status", query.status);

  const qs = params.toString();
  const url = qs
    ? `/api/appointment-follow-ups?${qs}`
    : "/api/appointment-follow-ups";

  return requestJson<ListFollowUpDispatchesResult>(url);
}

async function fetchStats(): Promise<FollowUpDispatchStats> {
  return requestJson<FollowUpDispatchStats>("/api/appointment-follow-ups/stats");
}

export default function ClinicFollowUpsPage() {
  const [dispatches, setDispatches] = useState<FollowUpDispatchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<FollowUpDispatchStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const loadStats = useCallback(async () => {
    setIsStatsLoading(true);
    try {
      const data = await fetchStats();
      setStats(data);
    } catch (err) {
      // stats failure is non-blocking
    } finally {
      setIsStatsLoading(false);
    }
  }, []);

  const loadDispatches = useCallback(async () => {
    setError(null);
    try {
      const result = await fetchDispatches({
        from: filterFrom || undefined,
        to: filterTo || undefined,
        status: filterStatus || undefined,
      });
      setDispatches(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(toErrorMessage(err, "Não foi possível carregar os follow-ups."));
    }
  }, [filterFrom, filterTo, filterStatus]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    setIsLoading(true);
    void loadDispatches().finally(() => setIsLoading(false));
  }, [loadDispatches]);

  const successRate = useMemo(() => {
    if (!stats || stats.total === 0) return null;
    return Math.round((stats.sent / stats.total) * 100);
  }, [stats]);

  const metricItems = useMemo(
    () => [
      {
        label: "Enviados",
        value: isStatsLoading ? "..." : String(stats?.sent ?? 0),
        helper: "Lembretes entregues com sucesso.",
        tone: "accent" as const,
      },
      {
        label: "Taxa de sucesso",
        value: isStatsLoading
          ? "..."
          : successRate !== null
            ? `${successRate}%`
            : "—",
        helper: "Proporção de envios bem-sucedidos.",
      },
      {
        label: "Falhas",
        value: isStatsLoading ? "..." : String(stats?.failed ?? 0),
        helper: "Envios com erro registrado.",
      },
      {
        label: "Processando",
        value: isStatsLoading ? "..." : String(stats?.processing ?? 0),
        helper: "Dispatches em andamento.",
      },
      {
        label: "Total",
        value: isStatsLoading ? "..." : String(stats?.total ?? 0),
        helper: "Todos os dispatches da clínica.",
      },
    ],
    [stats, isStatsLoading, successRate],
  );

  function handleClearFilters() {
    setFilterStatus("");
    setFilterFrom("");
    setFilterTo("");
  }

  const hasFilters = Boolean(filterStatus || filterFrom || filterTo);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clínica | Follow-ups"
        title="Follow-ups"
        description="Acompanhe os lembretes automáticos enviados aos pacientes antes das consultas. Veja o status de cada disparo e identifique falhas rapidamente."
      >
        <AdminMetricGrid items={metricItems} isLoading={isStatsLoading} />
      </AdminPageHeader>

      {error ? (
        <Card className="border-red-200 bg-red-50" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      ) : null}

      <Card className="space-y-4">
        <AdminSectionHeader
          eyebrow="Filtros"
          title="Refinar resultados"
          description="Filtre por status ou período para localizar dispatches específicos."
          actions={
            hasFilters ? (
              <button
                type="button"
                onClick={handleClearFilters}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50 transition"
              >
                Limpar filtros
              </button>
            ) : undefined
          }
        />

        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className={adminSelectClassName}
            >
              <option value="">Todos</option>
              <option value="SENT">Enviado</option>
              <option value="PROCESSING">Processando</option>
              <option value="FAILED">Falhou</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              De
            </label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className={adminInputClassName}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Até
            </label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className={adminInputClassName}
            />
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <AdminSectionHeader
          eyebrow="Dispatches"
          title="Lembretes enviados"
          description={`${total} registro${total !== 1 ? "s" : ""} encontrado${total !== 1 ? "s" : ""}${hasFilters ? " com os filtros aplicados" : ""}.`}
        />

        <div className="space-y-3">
          {isLoading && dispatches.length === 0 ? (
            Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                className="animate-pulse rounded-[24px] border border-slate-200 bg-white p-4"
              >
                <div className="h-4 w-40 rounded-full bg-slate-200" />
                <div className="mt-3 h-3 w-28 rounded-full bg-slate-100" />
                <div className="mt-4 h-3 w-52 rounded-full bg-slate-100" />
              </div>
            ))
          ) : dispatches.length > 0 ? (
            dispatches.map((dispatch) => (
              <div
                key={dispatch.id}
                className="rounded-[24px] border border-slate-200 bg-white p-4 transition hover:bg-slate-50"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-ink">
                        {dispatch.patientName ?? "Paciente não encontrado"}
                      </p>
                      <StatusPill
                        label={getStatusLabel(dispatch.status)}
                        tone={getStatusTone(dispatch.status)}
                      />
                      <StatusPill
                        label={getKindLabel(dispatch.kind)}
                        tone="neutral"
                      />
                    </div>

                    <p className="text-sm text-muted">
                      Agendado para: {formatDateTime(dispatch.scheduledFor)}
                    </p>

                    {dispatch.dispatchedAt ? (
                      <p className="text-sm text-muted">
                        Enviado em: {formatDateTime(dispatch.dispatchedAt)}
                      </p>
                    ) : null}

                    {dispatch.failedAt ? (
                      <p className="text-sm text-red-600">
                        Falhou em: {formatDateTime(dispatch.failedAt)}
                      </p>
                    ) : null}

                    {dispatch.errorMessage ? (
                      <p className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                        {dispatch.errorMessage}
                      </p>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-right text-sm text-muted">
                    <p>Criado em {formatDateTime(dispatch.createdAt)}</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <AdminEmptyState
              title="Nenhum follow-up encontrado"
              description={
                hasFilters
                  ? "Nenhum disparo corresponde aos filtros aplicados. Tente ajustar o período ou status."
                  : "Ainda não há lembretes automáticos disparados para esta clínica."
              }
              action={
                hasFilters ? (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition"
                  >
                    Limpar filtros
                  </button>
                ) : undefined
              }
            />
          )}
        </div>
      </Card>
    </div>
  );
}
