"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminCollectionSkeleton,
  AdminCountBadge,
  AdminEmptyState,
  AdminFilterSummary,
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionHeader,
  AdminShortcutPanel,
  adminInputClassName,
  adminMutedPanelClassName,
  adminSelectClassName,
} from "@/components/platform/platform-admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { toErrorMessage } from "@/lib/client/http";
import { listAdminOnboardings } from "@/lib/client/commercial-api";
import {
  formatDateTime,
  getOnboardingStatusLabel,
  getOnboardingStatusTone,
} from "@/lib/formatters";
import type {
  CommercialAdminOnboardingSummary,
  CommercialOnboardingStatus,
} from "@operaclinic/shared";

interface OnboardingFilterState {
  search?: string;
  status?: CommercialOnboardingStatus;
}

const ONBOARDING_STATUS_OPTIONS: CommercialOnboardingStatus[] = [
  "INITIATED",
  "AWAITING_PAYMENT",
  "PAID",
  "ONBOARDING_STARTED",
  "ONBOARDING_COMPLETED",
  "ESCALATED_TO_STAFF",
  "EXPIRED",
];

export default function PlatformPaymentsPage() {
  const [onboardings, setOnboardings] = useState<CommercialAdminOnboardingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<OnboardingFilterState>({});
  const [searchDraft, setSearchDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<CommercialOnboardingStatus | "">("");

  const onboardingMetrics = useMemo(() => {
    const awaitingPaymentCount = onboardings.filter(
      (item) => item.status === "AWAITING_PAYMENT",
    ).length;
    const inProgressCount = onboardings.filter(
      (item) => item.status === "PAID" || item.status === "ONBOARDING_STARTED",
    ).length;
    const escalatedCount = onboardings.filter(
      (item) => item.status === "ESCALATED_TO_STAFF",
    ).length;

    return [
      {
        label: "Onboardings carregados",
        value: String(onboardings.length),
        helper: "Fila atual conforme os filtros aplicados.",
      },
      {
        label: "Aguardando pagamento",
        value: String(awaitingPaymentCount),
        helper: "Entradas comerciais sem confirmacao financeira.",
      },
      {
        label: "Em execucao",
        value: String(inProgressCount),
        helper: "Pagos ou em configuracao assistida.",
        tone: "accent" as const,
      },
      {
        label: "Suporte manual",
        value: String(escalatedCount),
        helper: "Fluxos que exigem intervencao do time.",
        tone: escalatedCount > 0 ? ("danger" as const) : ("default" as const),
      },
    ];
  }, [onboardings]);

  const hasActiveFilters = Boolean(filters.search || filters.status);
  const activeFilterSummary = useMemo(() => {
    const items: string[] = [];

    if (filters.search) {
      items.push(`Busca: ${filters.search}`);
    }

    if (filters.status) {
      items.push(`Status: ${getOnboardingStatusLabel(filters.status)}`);
    }

    return items;
  }, [filters]);
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await listAdminOnboardings(filters);
      setOnboardings(data);
    } catch (requestError) {
      setError(
        toErrorMessage(requestError, "Nao foi possivel carregar os onboardings."),
      );
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const shortcutItems = useMemo(
    () => [
      {
        label: "Atualizar fila",
        description: "Recarregar os onboardings mais recentes.",
        onClick: () => {
          void loadData();
        },
      },
      {
        label: "Tenants",
        description: "Abrir base provisionada da plataforma.",
        href: "/platform/tenants",
      },
      {
        label: "Planos",
        description: "Comparar onboarding com o catalogo comercial.",
        href: "/platform/plans",
      },
    ],
    [loadData],
  );

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    setFilters({
      search: searchDraft.trim() || undefined,
      status: statusDraft || undefined,
    });
  }

  function clearFilters(): void {
    setSearchDraft("");
    setStatusDraft("");
    setFilters({});
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Super Admin | Pagamentos"
        title="Fila comercial e onboarding das clinicas esteticas"
        description="Acompanhe entrada de clinicas esteticas, confirmacao de pagamento e progresso de configuracao em uma lista mais leve e legivel para operacao real."
        actions={
          <Button
            type="button"
            onClick={() => {
              void loadData();
            }}
            disabled={isLoading}
            className="bg-white text-ink ring-1 ring-slate-200 hover:bg-slate-50"
          >
            {isLoading ? "Atualizando..." : "Atualizar fila"}
          </Button>
        }
      >
        <AdminMetricGrid
          items={onboardingMetrics}
          isLoading={isLoading && onboardings.length === 0}
        />
        <AdminShortcutPanel items={shortcutItems} />
      </AdminPageHeader>

      {error ? (
        <Card className="border-red-200 bg-red-50" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      ) : null}

      <Card className="space-y-5">
        <AdminSectionHeader
          eyebrow="Pipeline comercial"
          title="Onboardings e pagamentos"
          description="Filtre por clinica estetica, contato ou status para priorizar follow-up comercial e implantacao."
          actions={<AdminCountBadge value={onboardings.length} loading={isLoading} />}
        />

        <form className="grid gap-3 rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4 md:grid-cols-[minmax(0,1fr)_260px_auto_auto]" onSubmit={applyFilters}>
          <input
            type="text"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Buscar clinica estetica ou email"
            className={adminInputClassName}
          />
          <select
            value={statusDraft}
            onChange={(event) =>
              setStatusDraft(event.target.value as CommercialOnboardingStatus | "")
            }
            className={adminSelectClassName}
          >
            <option value="">Todos status</option>
            {ONBOARDING_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {getOnboardingStatusLabel(status)}
              </option>
            ))}
          </select>
          <Button type="submit" className="w-full md:w-auto">
            Aplicar filtros
          </Button>
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
          >
            Limpar
          </button>
        </form>

        <AdminFilterSummary items={activeFilterSummary} onClear={clearFilters} />

        <div className="grid gap-3" aria-busy={isLoading}>
          {isLoading && onboardings.length === 0 ? (
            <AdminCollectionSkeleton items={4} />
          ) : onboardings.length > 0 ? (
            onboardings.map((onboarding) => (
              <div
                key={onboarding.id}
                className="rounded-[28px] border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-ink">
                      {onboarding.clinicDisplayName || "Clinica em identificacao"}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {onboarding.adminEmail || onboarding.clinicContactEmail || "Sem contato"}
                    </p>
                  </div>
                  <StatusPill
                    label={getOnboardingStatusLabel(onboarding.status)}
                    tone={getOnboardingStatusTone(onboarding.status)}
                  />
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className={adminMutedPanelClassName}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                      Dados comerciais
                    </p>
                    <div className="mt-3 space-y-2 text-sm text-muted">
                      <p>
                        Plano: <span className="font-semibold text-ink">{onboarding.planCode}</span>
                      </p>
                      <p>Referencia de pagamento: {onboarding.paymentReference || "-"}</p>
                      <p>Tenant provisionado: {onboarding.tenantId || "Aguardando"}</p>
                    </div>
                  </div>

                  <div className={adminMutedPanelClassName}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                      Janela operacional
                    </p>
                    <div className="mt-3 space-y-2 text-sm text-muted">
                      <p>Criado em: {formatDateTime(onboarding.createdAt)}</p>
                      <p>Atualizado em: {formatDateTime(onboarding.updatedAt)}</p>
                      <p>Expira em: {formatDateTime(onboarding.expiresAt)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <AdminEmptyState
              title={isLoading ? "Carregando onboardings..." : "Nenhum onboarding encontrado"}
              description={
                hasActiveFilters
                  ? "Ajuste os filtros para recuperar entradas da fila comercial."
                  : "Quando novas clinicas iniciarem checkout, a fila aparecera aqui."
              }
              action={
                hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
                  >
                    Limpar filtros
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      void loadData();
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    Atualizar fila
                  </button>
                )
              }
            />
          )}
        </div>
      </Card>
    </div>
  );
}
