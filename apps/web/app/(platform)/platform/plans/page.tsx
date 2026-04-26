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
  adminSelectClassName,
  adminTextareaClassName,
} from "@/components/platform/platform-admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { toErrorMessage } from "@/lib/client/http";
import {
  createPlan,
  listPlans,
  PlanSummaryResponse,
} from "@/lib/client/platform-identity-api";
import { formatCurrencyFromCents, formatDateTime } from "@/lib/formatters";

interface CreatePlanFormState {
  code: string;
  name: string;
  description: string;
  priceCents: string;
  currency: string;
  isActive: boolean;
}

interface PlanFilterState {
  search?: string;
  isActive?: boolean;
}

const defaultFormState: CreatePlanFormState = {
  code: "",
  name: "",
  description: "",
  priceCents: "0",
  currency: "BRL",
  isActive: true,
};

export default function PlatformPlansPage() {
  const [plans, setPlans] = useState<PlanSummaryResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [filters, setFilters] = useState<PlanFilterState>({});
  const [searchDraft, setSearchDraft] = useState("");
  const [isActiveDraft, setIsActiveDraft] = useState<"all" | "true" | "false">("all");

  const [createForm, setCreateForm] = useState<CreatePlanFormState>(defaultFormState);
  const [isCreating, setIsCreating] = useState(false);

  const planMetrics = useMemo(() => {
    const activeCount = plans.filter((plan) => plan.isActive).length;
    const freeCount = plans.filter((plan) => plan.priceCents === 0).length;
    const highestPricePlan =
      plans.length > 0
        ? [...plans].sort((left, right) => right.priceCents - left.priceCents)[0]
        : null;

    return [
      {
        label: "Planos carregados",
        value: String(plans.length),
        helper: "Catalogo visivel com os filtros atuais.",
      },
      {
        label: "Ativos",
        value: String(activeCount),
        helper: "Disponiveis para novos contratos.",
        tone: "accent" as const,
      },
      {
        label: "Gratuitos",
        value: String(freeCount),
        helper: "Planos sem receita contratada.",
      },
      {
        label: "Maior ticket",
        value: highestPricePlan
          ? formatCurrencyFromCents(
              highestPricePlan.priceCents,
              highestPricePlan.currency,
            )
          : "--",
        helper: highestPricePlan ? highestPricePlan.name : "Sem planos cadastrados.",
      },
    ];
  }, [plans]);

  const hasActiveFilters = Boolean(filters.search || filters.isActive !== undefined);
  const activeFilterSummary = useMemo(() => {
    const items: string[] = [];

    if (filters.search) {
      items.push(`Busca: ${filters.search}`);
    }

    if (filters.isActive !== undefined) {
      items.push(`Estado: ${filters.isActive ? "Ativos" : "Inativos"}`);
    }

    return items;
  }, [filters]);
  const shortcutItems = useMemo(
    () => [
      {
        label: "Criar plano",
        description: "Ir direto para o cadastro do catalogo.",
        href: "#novo-plano",
      },
      {
        label: "Tenants",
        description: "Revisar quem depende de cada contrato.",
        href: "/platform/tenants",
      },
      {
        label: "Pagamentos",
        description: "Cruzar oferta comercial com onboarding.",
        href: "/platform/payments",
      },
    ],
    [],
  );

  const loadPlans = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextPlans = await listPlans(filters);
      setPlans(nextPlans);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Nao foi possivel carregar os planos."));
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  async function handleCreatePlan(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsCreating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const normalizedPrice = Number.parseInt(createForm.priceCents, 10);

      if (Number.isNaN(normalizedPrice) || normalizedPrice < 0) {
        throw new Error("Preco invalido. Informe um valor inteiro em centavos.");
      }

      await createPlan({
        code: createForm.code.trim().toUpperCase(),
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        priceCents: normalizedPrice,
        currency: createForm.currency.trim().toUpperCase() || undefined,
        isActive: createForm.isActive,
      });

      setCreateForm(defaultFormState);
      setSuccessMessage("Plano criado com sucesso.");
      await loadPlans();
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao criar plano."));
    } finally {
      setIsCreating(false);
    }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    setFilters({
      search: searchDraft.trim() || undefined,
      isActive:
        isActiveDraft === "all" ? undefined : isActiveDraft === "true",
    });
  }

  function clearFilters(): void {
    setSearchDraft("");
    setIsActiveDraft("all");
    setFilters({});
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Super Admin | Planos"
        title="Catalogo comercial da plataforma"
        description="Organize a oferta comercial em cards responsivos, com filtros sem ruido e criacao de novos planos no painel lateral."
        actions={
          <Button
            type="button"
            onClick={() => {
              void loadPlans();
            }}
            disabled={isLoading}
            className="bg-white text-ink ring-1 ring-slate-200 hover:bg-slate-50"
          >
            {isLoading ? "Atualizando..." : "Atualizar lista"}
          </Button>
        }
      >
        <AdminMetricGrid items={planMetrics} isLoading={isLoading && plans.length === 0} />
        <AdminShortcutPanel items={shortcutItems} />
      </AdminPageHeader>

      {error ? (
        <Card className="border-red-200 bg-red-50" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      ) : null}

      {successMessage ? (
        <Card className="border-emerald-200 bg-emerald-50" role="status" aria-live="polite">
          <p className="text-sm text-emerald-700">{successMessage}</p>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,400px)]">
        <Card className="space-y-5">
          <AdminSectionHeader
            eyebrow="Oferta ativa"
            title="Planos cadastrados"
            description="Busque por nome ou codigo e filtre por estado para revisar rapidamente o catalogo comercial."
            actions={<AdminCountBadge value={plans.length} loading={isLoading} />}
          />

          <form className="grid gap-3 rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4 md:grid-cols-[minmax(0,1fr)_220px_auto_auto]" onSubmit={applyFilters}>
            <input
              type="text"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Buscar por codigo ou nome"
              className={adminInputClassName}
            />
            <select
              value={isActiveDraft}
              onChange={(event) =>
                setIsActiveDraft(event.target.value as "all" | "true" | "false")
              }
              className={adminSelectClassName}
            >
              <option value="all">Todos</option>
              <option value="true">Ativos</option>
              <option value="false">Inativos</option>
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

          <div className="grid gap-3 md:grid-cols-2" aria-busy={isLoading}>
            {isLoading && plans.length === 0 ? (
              <div className="md:col-span-2">
                <AdminCollectionSkeleton items={4} columns={2} />
              </div>
            ) : plans.length > 0 ? (
              plans.map((plan) => (
                <div
                  key={plan.id}
                  className="rounded-[28px] border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-ink">{plan.name}</p>
                      <p className="mt-1 text-sm text-muted">{plan.code}</p>
                    </div>
                    <StatusPill
                      label={plan.isActive ? "Ativo" : "Inativo"}
                      tone={plan.isActive ? "success" : "warning"}
                    />
                  </div>

                  <p className="mt-4 text-3xl font-semibold text-ink">
                    {formatCurrencyFromCents(plan.priceCents, plan.currency)}
                  </p>

                  <p className="mt-3 text-sm leading-6 text-muted">
                    {plan.description ?? "Sem descricao operacional cadastrada."}
                  </p>

                  <div className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                        Criado em
                      </p>
                      <p className="mt-1 font-medium text-ink">
                        {formatDateTime(plan.createdAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                        Atualizado em
                      </p>
                      <p className="mt-1 font-medium text-ink">
                        {formatDateTime(plan.updatedAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="md:col-span-2">
                <AdminEmptyState
                  title={isLoading ? "Carregando planos..." : "Nenhum plano encontrado"}
                  description={
                    hasActiveFilters
                      ? "Ajuste os filtros para recuperar itens do catalogo."
                      : "Cadastre o primeiro plano para estruturar a carteira comercial."
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
                      <a
                        href="#novo-plano"
                        className="inline-flex h-11 items-center justify-center rounded-2xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90"
                      >
                        Criar plano
                      </a>
                    )
                  }
                />
              </div>
            )}
          </div>
        </Card>

        <Card id="novo-plano" className="space-y-4 xl:sticky xl:top-28 xl:self-start">
          <AdminSectionHeader
            eyebrow="Novo item do catalogo"
            title="Criar plano"
            description="Defina codigo, nome, descricao e ticket para disponibilizar um novo plano na operacao comercial."
          />

          <form className="space-y-3" onSubmit={(event) => void handleCreatePlan(event)}>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Codigo
              </label>
              <input
                type="text"
                value={createForm.code}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, code: event.target.value }))
                }
                placeholder="BASE_MVP_PLUS"
                className={`${adminInputClassName} uppercase`}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Nome
              </label>
              <input
                type="text"
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Plano Base Plus"
                className={adminInputClassName}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Descricao
              </label>
              <textarea
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={4}
                className={adminTextareaClassName}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Preco (centavos)
                </label>
                <input
                  type="number"
                  min={0}
                  value={createForm.priceCents}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      priceCents: event.target.value,
                    }))
                  }
                  className={adminInputClassName}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Moeda
                </label>
                <input
                  type="text"
                  value={createForm.currency}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      currency: event.target.value,
                    }))
                  }
                  className={`${adminInputClassName} uppercase`}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={createForm.isActive}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
              />
              Plano ativo ao finalizar o cadastro
            </label>

            <Button type="submit" className="w-full" disabled={isCreating}>
              {isCreating ? "Criando..." : "Criar plano"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
