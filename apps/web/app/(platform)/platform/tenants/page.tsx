"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminCollectionSkeleton,
  AdminCountBadge,
  AdminEmptyState,
  AdminFilterSummary,
  AdminFormSkeleton,
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionHeader,
  AdminShortcutPanel,
  adminInputClassName,
  adminMutedPanelClassName,
  adminSelectClassName,
} from "@/components/platform/platform-admin";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { toErrorMessage } from "@/lib/client/http";
import {
  cancelTenantSubscription,
  CancelTenantSubscriptionPayload,
  changeTenantPlan,
  createTenant,
  listPlans,
  listTenants,
  PlanSummaryResponse,
  TenantStatus,
  TenantSummaryResponse,
  TENANT_STATUS_OPTIONS,
  updateTenant,
} from "@/lib/client/platform-identity-api";
import {
  formatDateTime,
  getSubscriptionStatusLabel,
  getSubscriptionStatusTone,
  getTenantStatusLabel,
} from "@/lib/formatters";

interface TenantFilterState {
  search?: string;
  status?: TenantStatus;
}

interface TenantDetailFormState {
  name: string;
  timezone: string;
  status: TenantStatus;
  locale: string;
  currency: string;
}

interface CreateTenantFormState {
  slug: string;
  name: string;
  timezone: string;
  locale: string;
  currency: string;
}

const defaultCreateTenantForm: CreateTenantFormState = {
  slug: "",
  name: "",
  timezone: "America/Sao_Paulo",
  locale: "pt-BR",
  currency: "BRL",
};

function resolveTenantTone(status: TenantStatus): "success" | "warning" | "danger" {
  if (status === "ACTIVE") {
    return "success";
  }

  if (status === "SUSPENDED") {
    return "danger";
  }

  return "warning";
}

function buildDetailFormState(tenant: TenantSummaryResponse): TenantDetailFormState {
  return {
    name: tenant.name,
    timezone: tenant.timezone,
    status: tenant.status,
    locale: tenant.settings.locale ?? "",
    currency: tenant.settings.currency ?? "",
  };
}

export default function PlatformTenantsPage() {
  const [tenants, setTenants] = useState<TenantSummaryResponse[]>([]);
  const [plans, setPlans] = useState<PlanSummaryResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [searchDraft, setSearchDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<TenantStatus | "">("");
  const [filters, setFilters] = useState<TenantFilterState>({});

  const [createForm, setCreateForm] = useState<CreateTenantFormState>(
    defaultCreateTenantForm,
  );
  const [isCreatingTenant, setIsCreatingTenant] = useState(false);

  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [detailForm, setDetailForm] = useState<TenantDetailFormState | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [isUpdatingTenant, setIsUpdatingTenant] = useState(false);
  const [isChangingPlan, setIsChangingPlan] = useState(false);

  const [cancelForm, setCancelForm] = useState<CancelTenantSubscriptionPayload & { confirmed: boolean }>({
    cancelAtPeriodEnd: true,
    reason: "",
    confirmed: false,
  });
  const [isCanceling, setIsCanceling] = useState(false);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? null,
    [tenants, selectedTenantId],
  );

  const activePlans = useMemo(() => plans.filter((plan) => plan.isActive), [plans]);

  const tenantMetrics = useMemo(() => {
    const activeCount = tenants.filter((tenant) => tenant.status === "ACTIVE").length;
    const suspendedCount = tenants.filter((tenant) => tenant.status === "SUSPENDED").length;
    const withoutPlanCount = tenants.filter((tenant) => !tenant.currentPlan).length;

    return [
      {
        label: "Tenants carregados",
        value: String(tenants.length),
        helper: "Base exibida conforme os filtros ativos.",
      },
      {
        label: "Ativos",
        value: String(activeCount),
        helper: "Prontos para operar no momento.",
        tone: "accent" as const,
      },
      {
        label: "Suspensos",
        value: String(suspendedCount),
        helper: "Precisam de acao administrativa.",
        tone: suspendedCount > 0 ? ("danger" as const) : ("default" as const),
      },
      {
        label: "Sem contrato",
        value: String(withoutPlanCount),
        helper: "Tenants ainda sem plano vinculado.",
      },
    ];
  }, [tenants]);

  const hasActiveFilters = Boolean(filters.search || filters.status);
  const activeFilterSummary = useMemo(() => {
    const items: string[] = [];

    if (filters.search) {
      items.push(`Busca: ${filters.search}`);
    }

    if (filters.status) {
      items.push(`Status: ${getTenantStatusLabel(filters.status)}`);
    }

    return items;
  }, [filters]);
  const shortcutItems = useMemo(
    () => [
      {
        label: "Novo tenant",
        description: "Ir direto para o provisionamento inicial.",
        href: "#novo-tenant",
      },
      {
        label: "Usuários",
        description: "Revisar acessos vinculados aos tenants.",
        href: "/platform/users",
      },
      {
        label: "Planos",
        description: "Ajustar catálogo e contratos disponíveis.",
        href: "/platform/plans",
      },
    ],
    [],
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextTenants, nextPlans] = await Promise.all([
        listTenants(filters),
        listPlans({ isActive: true }),
      ]);

      setTenants(nextTenants);
      setPlans(nextPlans);

      setSelectedTenantId((current) => {
        if (current && nextTenants.some((tenant) => tenant.id === current)) {
          return current;
        }

        return nextTenants[0]?.id ?? null;
      });
    } catch (requestError) {
      setError(
        toErrorMessage(requestError, "Não foi possível carregar tenants e planos."),
      );
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedTenant) {
      setDetailForm(null);
      setSelectedPlanId("");
      return;
    }

    setDetailForm(buildDetailFormState(selectedTenant));
    setSelectedPlanId(selectedTenant.currentPlan?.id ?? "");
    setCancelForm({ cancelAtPeriodEnd: true, reason: "", confirmed: false });
  }, [selectedTenant]);

  async function handleCreateTenant(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsCreatingTenant(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const settings: Record<string, string> = {};

      if (createForm.locale.trim()) {
        settings.locale = createForm.locale.trim();
      }

      if (createForm.currency.trim()) {
        settings.currency = createForm.currency.trim().toUpperCase();
      }

      await createTenant({
        slug: createForm.slug.trim(),
        name: createForm.name.trim(),
        timezone: createForm.timezone.trim() || undefined,
        settings,
      });

      setCreateForm(defaultCreateTenantForm);
      setSuccessMessage("Tenant criado com sucesso.");
      await loadData();
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao criar tenant."));
    } finally {
      setIsCreatingTenant(false);
    }
  }

  async function handleUpdateTenant(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedTenant || !detailForm) {
      return;
    }

    setIsUpdatingTenant(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const settings: Record<string, string> = {};

      if (detailForm.locale.trim()) {
        settings.locale = detailForm.locale.trim();
      }

      if (detailForm.currency.trim()) {
        settings.currency = detailForm.currency.trim().toUpperCase();
      }

      const updatedTenant = await updateTenant(selectedTenant.id, {
        name: detailForm.name.trim(),
        timezone: detailForm.timezone.trim(),
        status: detailForm.status,
        settings,
      });

      setTenants((currentTenants) =>
        currentTenants.map((tenant) =>
          tenant.id === updatedTenant.id ? updatedTenant : tenant,
        ),
      );
      setSuccessMessage("Tenant atualizado.");
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao atualizar tenant."));
    } finally {
      setIsUpdatingTenant(false);
    }
  }

  async function handleChangePlan(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedTenant || !selectedPlanId) {
      return;
    }

    setIsChangingPlan(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updatedTenant = await changeTenantPlan(selectedTenant.id, selectedPlanId);

      setTenants((currentTenants) =>
        currentTenants.map((tenant) =>
          tenant.id === updatedTenant.id ? updatedTenant : tenant,
        ),
      );
      setSuccessMessage("Plano do tenant atualizado.");
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao trocar plano do tenant."));
    } finally {
      setIsChangingPlan(false);
    }
  }

  async function handleCancelSubscription(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedTenant || !cancelForm.confirmed) return;

    setIsCanceling(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updatedTenant = await cancelTenantSubscription(selectedTenant.id, {
        cancelAtPeriodEnd: cancelForm.cancelAtPeriodEnd,
        reason: cancelForm.reason?.trim() || undefined,
      });

      setTenants((current) =>
        current.map((t) => (t.id === updatedTenant.id ? updatedTenant : t)),
      );
      setCancelForm({ cancelAtPeriodEnd: true, reason: "", confirmed: false });
      setSuccessMessage(
        cancelForm.cancelAtPeriodEnd
          ? "Assinatura marcada para cancelamento ao fim do período."
          : "Assinatura cancelada imediatamente.",
      );
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao cancelar assinatura."));
    } finally {
      setIsCanceling(false);
    }
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>): void {
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
        eyebrow="Super Admin | Tenants"
        title="Governanca dos tenants da plataforma"
        description="Centralize cadastro, manutencao e contrato dos tenants sem depender de tabelas rigidas. O fluxo prioriza leitura rápida, seleção contextual e edição ao lado."
        actions={
          <Button
            type="button"
            onClick={() => {
              void loadData();
            }}
            disabled={isLoading}
            className="bg-white text-ink ring-1 ring-slate-200 hover:bg-slate-50"
          >
            {isLoading ? "Atualizando..." : "Atualizar lista"}
          </Button>
        }
      >
        <AdminMetricGrid items={tenantMetrics} isLoading={isLoading && tenants.length === 0} />
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,420px)]">
        <Card className="space-y-5">
          <AdminSectionHeader
            eyebrow="Carteira ativa"
            title="Tenants em operação"
            description="Use os filtros para reduzir ruido e selecione um tenant para editar nome, configuração e contrato no painel lateral."
            actions={<AdminCountBadge value={tenants.length} loading={isLoading} />}
          />

          <form className="grid gap-3 rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4 md:grid-cols-[minmax(0,1fr)_220px_auto_auto]" onSubmit={handleFilterSubmit}>
            <input
              type="text"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Buscar por nome ou slug"
              className={adminInputClassName}
            />
            <select
              value={statusDraft}
              onChange={(event) => setStatusDraft(event.target.value as TenantStatus | "")}
              className={adminSelectClassName}
            >
              <option value="">Todos os status</option>
              {TENANT_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {getTenantStatusLabel(status)}
                </option>
              ))}
            </select>
            <Button type="submit" className="w-full md:w-auto">
              Aplicar filtros
            </Button>
            <button
              type="button"
              onClick={clearFilters}
              className={buttonVariants({ variant: "secondary" })}
            >
              Limpar
            </button>
          </form>

          <AdminFilterSummary items={activeFilterSummary} onClear={clearFilters} />

          <div className="grid gap-3" aria-busy={isLoading}>
            {isLoading && tenants.length === 0 ? (
              <AdminCollectionSkeleton items={4} />
            ) : tenants.length > 0 ? (
              tenants.map((tenant) => {
                const isSelected = tenant.id === selectedTenantId;

                return (
                  <button
                    key={tenant.id}
                    type="button"
                    onClick={() => setSelectedTenantId(tenant.id)}
                    aria-pressed={isSelected}
                    className={`w-full rounded-[28px] border p-4 text-left transition ${
                      isSelected
                        ? "border-teal-300 bg-teal-50/80 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-ink">{tenant.name}</p>
                        <p className="mt-1 text-sm text-muted">{tenant.slug}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusPill
                          label={getTenantStatusLabel(tenant.status)}
                          tone={resolveTenantTone(tenant.status)}
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
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                          Timezone
                        </p>
                        <p className="mt-1 font-medium text-ink">{tenant.timezone}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                          Plano atual
                        </p>
                        <p className="mt-1 font-medium text-ink">
                          {tenant.currentPlan?.name ?? "Sem contrato ativo"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                          Atualizado em
                        </p>
                        <p className="mt-1 font-medium text-ink">
                          {formatDateTime(tenant.updatedAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <AdminEmptyState
                title={isLoading ? "Carregando tenants..." : "Nenhum tenant encontrado"}
                description={
                  hasActiveFilters
                    ? "Ajuste os filtros ou limpe a busca para recuperar a base completa."
                    : "Crie um tenant para iniciar o provisionamento da carteira da plataforma."
                }
                action={
                  hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className={buttonVariants({ variant: "secondary" })}
                    >
                      Limpar filtros
                    </button>
                  ) : (
                    <a
                      href="#novo-tenant"
                      className={buttonVariants({ variant: "accent" })}
                    >
                      Criar tenant
                    </a>
                  )
                }
              />
            )}
          </div>
        </Card>

        <div className="space-y-6 xl:sticky xl:top-28 xl:self-start">
          <Card id="novo-tenant" className="space-y-4">
            <AdminSectionHeader
              eyebrow="Provisionamento"
              title="Novo tenant"
              description="Crie a estrutura inicial com slug, timezone e configuração basica de locale e moeda."
            />

            <form className="space-y-3" onSubmit={(event) => void handleCreateTenant(event)}>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Slug
                </label>
                <input
                  type="text"
                  value={createForm.slug}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, slug: event.target.value }))
                  }
                  placeholder="clinica-porto"
                  className={adminInputClassName}
                  autoComplete="off"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Nome do tenant
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Clínica Porto"
                  className={adminInputClassName}
                  autoComplete="organization"
                  required
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                    Locale
                  </label>
                  <input
                    type="text"
                    value={createForm.locale}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, locale: event.target.value }))
                    }
                    className={adminInputClassName}
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
                      setCreateForm((current) => ({ ...current, currency: event.target.value }))
                    }
                    className={`${adminInputClassName} uppercase`}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Timezone
                </label>
                <input
                  type="text"
                  value={createForm.timezone}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, timezone: event.target.value }))
                  }
                  className={adminInputClassName}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isCreatingTenant}>
                {isCreatingTenant ? "Criando..." : "Criar tenant"}
              </Button>
            </form>
          </Card>

          <Card className="space-y-4">
            <AdminSectionHeader
              eyebrow="Tenant selecionado"
              title={selectedTenant ? selectedTenant.name : "Detalhes do tenant"}
              description={
                selectedTenant
                  ? "Atualize nome, status e configuração operacional sem sair da tela."
                  : "Selecione um tenant na lista para visualizar ou editar."
              }
            />

            {isLoading && !selectedTenant ? (
              <AdminFormSkeleton />
            ) : selectedTenant && detailForm ? (
              <form className="space-y-3" onSubmit={(event) => void handleUpdateTenant(event)}>
                <div className={adminMutedPanelClassName}>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill
                      label={getTenantStatusLabel(selectedTenant.status)}
                      tone={resolveTenantTone(selectedTenant.status)}
                    />
                    {selectedTenant.currentPlan ? (
                      <StatusPill
                        label={getSubscriptionStatusLabel(selectedTenant.currentPlan.status)}
                        tone={getSubscriptionStatusTone(selectedTenant.currentPlan.status)}
                      />
                    ) : (
                      <StatusPill label="Sem plano" tone="warning" />
                    )}
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-muted">
                    <p>ID: {selectedTenant.id}</p>
                    <p>Slug: {selectedTenant.slug}</p>
                    <p>Criado em: {formatDateTime(selectedTenant.createdAt)}</p>
                    <p>Atualizado em: {formatDateTime(selectedTenant.updatedAt)}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                      Nome
                    </label>
                    <input
                      type="text"
                      value={detailForm.name}
                      onChange={(event) =>
                        setDetailForm((current) =>
                          current
                            ? {
                                ...current,
                                name: event.target.value,
                              }
                            : current,
                        )
                      }
                      className={adminInputClassName}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                      Timezone
                    </label>
                    <input
                      type="text"
                      value={detailForm.timezone}
                      onChange={(event) =>
                        setDetailForm((current) =>
                          current
                            ? {
                                ...current,
                                timezone: event.target.value,
                              }
                            : current,
                        )
                      }
                      className={adminInputClassName}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                      Status
                    </label>
                    <select
                      value={detailForm.status}
                      onChange={(event) =>
                        setDetailForm((current) =>
                          current
                            ? {
                                ...current,
                                status: event.target.value as TenantStatus,
                              }
                            : current,
                        )
                      }
                      className={adminSelectClassName}
                    >
                      {TENANT_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {getTenantStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                      Locale
                    </label>
                    <input
                      type="text"
                      value={detailForm.locale}
                      onChange={(event) =>
                        setDetailForm((current) =>
                          current
                            ? {
                                ...current,
                                locale: event.target.value,
                              }
                            : current,
                        )
                      }
                      className={adminInputClassName}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                      Moeda
                    </label>
                    <input
                      type="text"
                      value={detailForm.currency}
                      onChange={(event) =>
                        setDetailForm((current) =>
                          current
                            ? {
                                ...current,
                                currency: event.target.value,
                              }
                            : current,
                        )
                      }
                      className={`${adminInputClassName} uppercase`}
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isUpdatingTenant}>
                  {isUpdatingTenant ? "Salvando..." : "Salvar alteracoes"}
                </Button>
              </form>
            ) : (
              <AdminEmptyState
                title="Nenhum tenant selecionado"
                description="Escolha um tenant na coluna principal para habilitar a edição contextual."
                action={
                  <a
                    href="#novo-tenant"
                    className={buttonVariants({ variant: "accent" })}
                  >
                    Criar tenant
                  </a>
                }
              />
            )}
          </Card>

          <Card className="space-y-4">
            <AdminSectionHeader
              eyebrow="Contrato"
              title="Plano do tenant"
              description="Troque o plano com leitura clara do contrato atual para evitar mudancas cegas."
            />

            {isLoading && !selectedTenant ? (
              <AdminFormSkeleton fields={3} />
            ) : selectedTenant ? (
              <>
                <div className={adminMutedPanelClassName}>
                  <p className="text-sm font-semibold text-ink">
                    {selectedTenant.currentPlan?.name ?? "Sem plano ativo"}
                  </p>
                  <div className="mt-2 space-y-1 text-sm text-muted">
                    <p>Codigo: {selectedTenant.currentPlan?.code ?? "-"}</p>
                    <p>
                      Status:{" "}
                      {selectedTenant.currentPlan
                        ? getSubscriptionStatusLabel(selectedTenant.currentPlan.status)
                        : "-"}
                    </p>
                  </div>
                </div>

                <form className="space-y-3" onSubmit={(event) => void handleChangePlan(event)}>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                      Novo plano
                    </label>
                    <select
                      value={selectedPlanId}
                      onChange={(event) => setSelectedPlanId(event.target.value)}
                      className={adminSelectClassName}
                    >
                      <option value="">Selecione um plano</option>
                      {activePlans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.code} - {plan.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isChangingPlan || !selectedPlanId}
                  >
                    {isChangingPlan ? "Atualizando..." : "Trocar plano"}
                  </Button>
                </form>
              </>
            ) : (
              <AdminEmptyState
                title="Plano indisponivel"
                description="Selecione um tenant para revisar ou trocar o contrato atual."
                action={
                  <a
                    href="#novo-tenant"
                    className={buttonVariants({ variant: "secondary" })}
                  >
                    Provisionar tenant
                  </a>
                }
              />
            )}
          </Card>
          {/* Cancel subscription card */}
          {(() => {
            const cancelableStatuses = ["TRIAL", "ACTIVE", "PAST_DUE"];
            const isCancelable =
              selectedTenant?.currentPlan &&
              cancelableStatuses.includes(selectedTenant.currentPlan.status);

            if (!selectedTenant || !isCancelable) return null;

            return (
              <Card className="space-y-4 border-red-200">
                <AdminSectionHeader
                  eyebrow="Zona de risco"
                  title="Cancelar assinatura"
                  description="Cancela o contrato ativo deste tenant no Stripe. Ação registrada em audit log."
                />

                <div className="rounded-[20px] border border-red-100 bg-red-50/60 px-4 py-3">
                  <p className="text-sm font-semibold text-red-800">
                    {selectedTenant.name}
                  </p>
                  <p className="mt-1 text-xs text-red-600">
                    Plano: {selectedTenant.currentPlan?.name} ·{" "}
                    {selectedTenant.currentPlan
                      ? getSubscriptionStatusLabel(selectedTenant.currentPlan.status)
                      : ""}
                  </p>
                </div>

                <form
                  className="space-y-4"
                  onSubmit={(e) => void handleCancelSubscription(e)}
                >
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                      Modo de cancelamento
                    </p>
                    <label className="flex cursor-pointer items-start gap-3 rounded-[16px] border border-slate-200 bg-white px-4 py-3 text-sm">
                      <input
                        type="radio"
                        name="cancelMode"
                        checked={cancelForm.cancelAtPeriodEnd === true}
                        onChange={() =>
                          setCancelForm((c) => ({ ...c, cancelAtPeriodEnd: true }))
                        }
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-semibold text-ink">Ao fim do período atual</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          Acesso mantido até o fim do ciclo de cobrança. Recomendado.
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-[16px] border border-red-200 bg-red-50/40 px-4 py-3 text-sm">
                      <input
                        type="radio"
                        name="cancelMode"
                        checked={cancelForm.cancelAtPeriodEnd === false}
                        onChange={() =>
                          setCancelForm((c) => ({ ...c, cancelAtPeriodEnd: false }))
                        }
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-semibold text-red-700">Imediatamente</span>
                        <span className="mt-0.5 block text-xs text-red-500">
                          Acesso encerrado agora. Sem estorno proporcional.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                      Motivo (opcional)
                    </label>
                    <input
                      type="text"
                      value={cancelForm.reason}
                      onChange={(e) =>
                        setCancelForm((c) => ({ ...c, reason: e.target.value }))
                      }
                      placeholder="Ex.: Solicitação do cliente, inadimplência"
                      className={adminInputClassName}
                      maxLength={255}
                    />
                  </div>

                  <label className="flex cursor-pointer items-center gap-3 rounded-[16px] border border-red-200 bg-red-50/60 px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      checked={cancelForm.confirmed}
                      onChange={(e) =>
                        setCancelForm((c) => ({ ...c, confirmed: e.target.checked }))
                      }
                    />
                    <span className="font-medium text-red-700">
                      Confirmo que desejo cancelar a assinatura de{" "}
                      <strong>{selectedTenant.name}</strong>
                    </span>
                  </label>

                  <Button
                    type="submit"
                    className="w-full border border-red-300 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    disabled={isCanceling || !cancelForm.confirmed}
                  >
                    {isCanceling
                      ? "Cancelando..."
                      : cancelForm.cancelAtPeriodEnd
                        ? "Cancelar ao fim do período"
                        : "Cancelar imediatamente"}
                  </Button>
                </form>
              </Card>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
