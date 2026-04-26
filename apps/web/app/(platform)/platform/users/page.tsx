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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { toErrorMessage } from "@/lib/client/http";
import {
  CLINIC_ROLE_OPTIONS,
  createUser,
  listTenants,
  listUsers,
  RoleCode,
  TenantSummaryResponse,
  updateUser,
  updateUserRoles,
  UserStatus,
  USER_STATUS_OPTIONS,
  UserSummaryResponse,
} from "@/lib/client/platform-identity-api";
import { formatDateTime, getRoleLabel, getUserStatusLabel } from "@/lib/formatters";

interface CreateUserFormState {
  email: string;
  fullName: string;
  password: string;
  tenantId: string;
  status: UserStatus;
  roleCodes: RoleCode[];
}

interface UpdateUserFormState {
  fullName: string;
  status: UserStatus;
  password: string;
}

interface UserFilterState {
  search?: string;
  status?: UserStatus;
  roleCode?: RoleCode;
  tenantId?: string;
}

const defaultCreateUserForm: CreateUserFormState = {
  email: "",
  fullName: "",
  password: "",
  tenantId: "",
  status: "ACTIVE",
  roleCodes: ["TENANT_ADMIN"],
};

function toClinicRoleCodes(value: RoleCode[]): RoleCode[] {
  return value.filter((roleCode) => CLINIC_ROLE_OPTIONS.includes(roleCode));
}

function getUserRolesForTenant(user: UserSummaryResponse, tenantId: string): RoleCode[] {
  return user.roleAssignments
    .filter((assignment) => assignment.tenantId === tenantId)
    .map((assignment) => assignment.roleCode)
    .filter((roleCode): roleCode is RoleCode => CLINIC_ROLE_OPTIONS.includes(roleCode));
}

function resolveUserTone(status: UserStatus): "success" | "warning" | "danger" {
  if (status === "ACTIVE") {
    return "success";
  }

  if (status === "SUSPENDED") {
    return "danger";
  }

  return "warning";
}

export default function PlatformUsersPage() {
  const [users, setUsers] = useState<UserSummaryResponse[]>([]);
  const [tenants, setTenants] = useState<TenantSummaryResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [filters, setFilters] = useState<UserFilterState>({});
  const [searchDraft, setSearchDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<UserStatus | "">("");
  const [roleDraft, setRoleDraft] = useState<RoleCode | "">("");
  const [tenantDraft, setTenantDraft] = useState("");

  const [createForm, setCreateForm] = useState<CreateUserFormState>(
    defaultCreateUserForm,
  );
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [updateForm, setUpdateForm] = useState<UpdateUserFormState | null>(null);
  const [roleTenantId, setRoleTenantId] = useState("");
  const [roleCodes, setRoleCodes] = useState<RoleCode[]>([]);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [isUpdatingRoles, setIsUpdatingRoles] = useState(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const userMetrics = useMemo(() => {
    const activeCount = users.filter((user) => user.status === "ACTIVE").length;
    const invitedCount = users.filter((user) => user.status === "INVITED").length;
    const pendingProfessionalLinkCount = users.filter(
      (user) => user.requiresProfessionalLink,
    ).length;

    return [
      {
        label: "Usuarios carregados",
        value: String(users.length),
        helper: "Base filtrada para administracao da plataforma.",
      },
      {
        label: "Ativos",
        value: String(activeCount),
        helper: "Usuarios aptos para operar.",
        tone: "accent" as const,
      },
      {
        label: "Convites pendentes",
        value: String(invitedCount),
        helper: "Aguardando primeiro acesso.",
      },
      {
        label: "Vinculo profissional",
        value: String(pendingProfessionalLinkCount),
        helper: "Usuarios que ainda exigem vinculo operacional.",
        tone:
          pendingProfessionalLinkCount > 0 ? ("danger" as const) : ("default" as const),
      },
    ];
  }, [users]);

  const hasActiveFilters = Boolean(
    filters.search || filters.status || filters.roleCode || filters.tenantId,
  );
  const activeFilterSummary = useMemo(() => {
    const items: string[] = [];

    if (filters.search) {
      items.push(`Busca: ${filters.search}`);
    }

    if (filters.status) {
      items.push(`Status: ${getUserStatusLabel(filters.status)}`);
    }

    if (filters.roleCode) {
      items.push(`Role: ${getRoleLabel(filters.roleCode)}`);
    }

    if (filters.tenantId) {
      const tenantName =
        tenants.find((tenant) => tenant.id === filters.tenantId)?.name ?? filters.tenantId;
      items.push(`Tenant: ${tenantName}`);
    }

    return items;
  }, [filters, tenants]);
  const shortcutItems = useMemo(
    () => [
      {
        label: "Novo usuario",
        description: "Abrir cadastro inicial do acesso operacional.",
        href: "#novo-usuario",
      },
      {
        label: "Tenants",
        description: "Validar tenant antes de ajustar papeis.",
        href: "/platform/tenants",
      },
      {
        label: "Pagamentos",
        description: "Cruzar onboarding com provisionamento de acesso.",
        href: "/platform/payments",
      },
    ],
    [],
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextUsers, nextTenants] = await Promise.all([
        listUsers(filters),
        listTenants({ status: "ACTIVE" }),
      ]);

      setUsers(nextUsers);
      setTenants(nextTenants);

      setSelectedUserId((current) => {
        if (current && nextUsers.some((user) => user.id === current)) {
          return current;
        }

        return nextUsers[0]?.id ?? null;
      });
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Nao foi possivel carregar os usuarios."));
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (tenants.length === 0) {
      return;
    }

    setCreateForm((current) => ({
      ...current,
      tenantId: current.tenantId || tenants[0].id,
    }));
  }, [tenants]);

  useEffect(() => {
    if (!selectedUser) {
      setUpdateForm(null);
      setRoleTenantId("");
      setRoleCodes([]);
      return;
    }

    setUpdateForm({
      fullName: selectedUser.fullName,
      status: selectedUser.status,
      password: "",
    });

    const defaultTenantId = selectedUser.tenantIds[0] ?? "";
    setRoleTenantId(defaultTenantId);
    setRoleCodes(defaultTenantId ? getUserRolesForTenant(selectedUser, defaultTenantId) : []);
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedUser || !roleTenantId) {
      return;
    }

    setRoleCodes(getUserRolesForTenant(selectedUser, roleTenantId));
  }, [roleTenantId, selectedUser]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsCreatingUser(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await createUser({
        email: createForm.email.trim().toLowerCase(),
        fullName: createForm.fullName.trim(),
        password: createForm.password.trim(),
        tenantId: createForm.tenantId.trim(),
        status: createForm.status,
        roleCodes: toClinicRoleCodes(createForm.roleCodes),
      });

      setCreateForm((current) => ({
        ...defaultCreateUserForm,
        tenantId: current.tenantId,
      }));
      setSuccessMessage("Usuario criado com sucesso.");
      await loadData();
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao criar usuario."));
    } finally {
      setIsCreatingUser(false);
    }
  }

  async function handleUpdateUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedUser || !updateForm) {
      return;
    }

    setIsUpdatingUser(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const payload: {
        fullName?: string;
        status?: UserStatus;
        password?: string;
      } = {
        fullName: updateForm.fullName.trim(),
        status: updateForm.status,
      };

      if (updateForm.password.trim()) {
        payload.password = updateForm.password.trim();
      }

      const updatedUser = await updateUser(selectedUser.id, payload);

      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
      );
      setSuccessMessage("Dados basicos do usuario atualizados.");
      setUpdateForm((current) =>
        current
          ? {
              ...current,
              password: "",
            }
          : current,
      );
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao atualizar usuario."));
    } finally {
      setIsUpdatingUser(false);
    }
  }

  async function handleUpdateRoles(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedUser || !roleTenantId) {
      setError("Selecione um tenant para atualizar roles.");
      return;
    }

    setIsUpdatingRoles(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updatedUser = await updateUserRoles(selectedUser.id, {
        tenantId: roleTenantId,
        roleCodes: toClinicRoleCodes(roleCodes),
      });

      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
      );
      setSuccessMessage("Roles do usuario atualizadas.");
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao atualizar roles."));
    } finally {
      setIsUpdatingRoles(false);
    }
  }

  function toggleRole(
    currentRoles: RoleCode[],
    roleCode: RoleCode,
    nextChecked: boolean,
  ): RoleCode[] {
    if (nextChecked) {
      return [...new Set([...currentRoles, roleCode])];
    }

    return currentRoles.filter((item) => item !== roleCode);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    setFilters({
      search: searchDraft.trim() || undefined,
      status: statusDraft || undefined,
      roleCode: roleDraft || undefined,
      tenantId: tenantDraft.trim() || undefined,
    });
  }

  function clearFilters(): void {
    setSearchDraft("");
    setStatusDraft("");
    setRoleDraft("");
    setTenantDraft("");
    setFilters({});
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Super Admin | Usuarios"
        title="Acessos e papeis da operacao das clinicas esteticas"
        description="Gerencie identidade, ativacao e papeis por tenant em uma superficie que funciona melhor no desktop e no mobile, com foco em selecao rapida e contexto lateral."
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
        <AdminMetricGrid items={userMetrics} isLoading={isLoading && users.length === 0} />
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
            eyebrow="Identidade operacional"
            title="Usuarios carregados"
            description="Filtre por tenant, papel e status. Selecione um usuario para editar dados basicos e substituir roles por contexto."
            actions={<AdminCountBadge value={users.length} loading={isLoading} />}
          />

          <form className="grid gap-3 rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={applyFilters}>
            <input
              type="text"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Buscar nome ou email"
              className={adminInputClassName}
            />
            <select
              value={statusDraft}
              onChange={(event) => setStatusDraft(event.target.value as UserStatus | "")}
              className={adminSelectClassName}
            >
              <option value="">Todos status</option>
              {USER_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {getUserStatusLabel(status)}
                </option>
              ))}
            </select>
            <select
              value={roleDraft}
              onChange={(event) => setRoleDraft(event.target.value as RoleCode | "")}
              className={adminSelectClassName}
            >
              <option value="">Todas roles</option>
              {CLINIC_ROLE_OPTIONS.map((roleCode) => (
                <option key={roleCode} value={roleCode}>
                  {getRoleLabel(roleCode)}
                </option>
              ))}
            </select>
            <select
              value={tenantDraft}
              onChange={(event) => setTenantDraft(event.target.value)}
              className={adminSelectClassName}
            >
              <option value="">Todos tenants</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
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
            {isLoading && users.length === 0 ? (
              <AdminCollectionSkeleton items={4} />
            ) : users.length > 0 ? (
              users.map((user) => {
                const isSelected = user.id === selectedUserId;

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUserId(user.id)}
                    aria-pressed={isSelected}
                    className={`w-full rounded-[28px] border p-4 text-left transition ${
                      isSelected
                        ? "border-teal-300 bg-teal-50/80 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-ink">{user.fullName}</p>
                        <p className="mt-1 text-sm text-muted">{user.email}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusPill
                          label={getUserStatusLabel(user.status)}
                          tone={resolveUserTone(user.status)}
                        />
                        {user.requiresProfessionalLink ? (
                          <StatusPill label="Vinculo pendente" tone="warning" />
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {user.roleAssignments.length > 0 ? (
                        user.roleAssignments.map((assignment, index) => (
                          <span
                            key={`${assignment.roleCode}-${assignment.tenantId ?? "global"}-${index}`}
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
                          >
                            {getRoleLabel(assignment.roleCode)}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-muted">Sem roles</span>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                          Tenants
                        </p>
                        <p className="mt-1 font-medium text-ink">
                          {user.tenantIds.length ? user.tenantIds.length : "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                          Atualizado em
                        </p>
                        <p className="mt-1 font-medium text-ink">
                          {formatDateTime(user.updatedAt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                          Profissional
                        </p>
                        <p className="mt-1 font-medium text-ink">
                          {user.linkedProfessional?.displayName ?? "Nao vinculado"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <AdminEmptyState
                title={isLoading ? "Carregando usuarios..." : "Nenhum usuario encontrado"}
                description={
                  hasActiveFilters
                    ? "Ajuste os filtros para recuperar usuarios da base ou limpe a busca atual."
                    : "Crie o primeiro usuario operacional para um tenant ativo."
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
                      href="#novo-usuario"
                      className="inline-flex h-11 items-center justify-center rounded-2xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      Criar usuario
                    </a>
                  )
                }
              />
            )}
          </div>
        </Card>

        <div className="space-y-6 xl:sticky xl:top-28 xl:self-start">
          <Card id="novo-usuario" className="space-y-4">
            <AdminSectionHeader
              eyebrow="Provisionamento"
              title="Novo usuario"
              description="Cadastre o acesso inicial com tenant, status e roles da clinica estetica logo na mesma tela."
            />

            <form className="space-y-3" onSubmit={(event) => void handleCreateUser(event)}>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Email
                </label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, email: event.target.value }))
                  }
                  className={adminInputClassName}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Nome completo
                </label>
                <input
                  type="text"
                  value={createForm.fullName}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, fullName: event.target.value }))
                  }
                  className={adminInputClassName}
                  autoComplete="name"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Senha
                </label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, password: event.target.value }))
                  }
                  className={adminInputClassName}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                    Tenant
                  </label>
                  <select
                    value={createForm.tenantId}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        tenantId: event.target.value,
                      }))
                    }
                    className={adminSelectClassName}
                    required
                  >
                    <option value="">Selecione</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                    Status
                  </label>
                  <select
                    value={createForm.status}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        status: event.target.value as UserStatus,
                      }))
                    }
                    className={adminSelectClassName}
                  >
                    {USER_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {getUserStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={adminMutedPanelClassName}>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Roles iniciais
                </p>
                <div className="mt-3 space-y-2">
                  {CLINIC_ROLE_OPTIONS.map((roleCode) => (
                    <label key={roleCode} className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={createForm.roleCodes.includes(roleCode)}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            roleCodes: toggleRole(
                              current.roleCodes,
                              roleCode,
                              event.target.checked,
                            ),
                          }))
                        }
                      />
                      {getRoleLabel(roleCode)}
                    </label>
                  ))}
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isCreatingUser}>
                {isCreatingUser ? "Criando..." : "Criar usuario"}
              </Button>
            </form>
          </Card>

          <Card className="space-y-4">
            <AdminSectionHeader
              eyebrow="Usuario selecionado"
              title={selectedUser ? selectedUser.fullName : "Dados basicos"}
              description={
                selectedUser
                  ? "Edite nome, status e senha sem sair da pagina."
                  : "Selecione um usuario para editar dados basicos."
              }
            />

            {isLoading && !selectedUser ? (
              <AdminFormSkeleton />
            ) : selectedUser && updateForm ? (
              <form className="space-y-3" onSubmit={(event) => void handleUpdateUser(event)}>
                <div className={adminMutedPanelClassName}>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill
                      label={getUserStatusLabel(selectedUser.status)}
                      tone={resolveUserTone(selectedUser.status)}
                    />
                    {selectedUser.requiresProfessionalLink ? (
                      <StatusPill label="Vinculo pendente" tone="warning" />
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-muted">
                    <p>ID: {selectedUser.id}</p>
                    <p>Email: {selectedUser.email}</p>
                    <p>Criado em: {formatDateTime(selectedUser.createdAt)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                    Nome completo
                  </label>
                  <input
                    type="text"
                    value={updateForm.fullName}
                    onChange={(event) =>
                      setUpdateForm((current) =>
                        current
                          ? {
                              ...current,
                              fullName: event.target.value,
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
                    Status
                  </label>
                  <select
                    value={updateForm.status}
                    onChange={(event) =>
                      setUpdateForm((current) =>
                        current
                          ? {
                              ...current,
                              status: event.target.value as UserStatus,
                            }
                          : current,
                      )
                    }
                    className={adminSelectClassName}
                  >
                    {USER_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {getUserStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                    Nova senha (opcional)
                  </label>
                  <input
                    type="password"
                    value={updateForm.password}
                    onChange={(event) =>
                      setUpdateForm((current) =>
                        current
                          ? {
                              ...current,
                              password: event.target.value,
                            }
                          : current,
                      )
                    }
                    className={adminInputClassName}
                    autoComplete="new-password"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isUpdatingUser}>
                  {isUpdatingUser ? "Salvando..." : "Salvar dados basicos"}
                </Button>
              </form>
            ) : (
              <AdminEmptyState
                title="Nenhum usuario selecionado"
                description="Escolha um usuario na lista principal para habilitar a edicao contextual."
                action={
                  <a
                    href="#novo-usuario"
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    Criar usuario
                  </a>
                }
              />
            )}
          </Card>

          <Card className="space-y-4">
            <AdminSectionHeader
              eyebrow="Roles por tenant"
              title="Substituir roles"
              description="Ajuste o conjunto de papeis do usuario dentro do tenant escolhido."
            />

            {isLoading && !selectedUser ? (
              <AdminFormSkeleton fields={3} />
            ) : selectedUser ? (
              <form className="space-y-3" onSubmit={(event) => void handleUpdateRoles(event)}>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                    Tenant do contexto
                  </label>
                  <select
                    value={roleTenantId}
                    onChange={(event) => setRoleTenantId(event.target.value)}
                    className={adminSelectClassName}
                    required
                  >
                    <option value="">Selecione</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={adminMutedPanelClassName}>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                    Roles de clinica
                  </p>
                  <div className="mt-3 space-y-2">
                    {CLINIC_ROLE_OPTIONS.map((roleCode) => (
                      <label key={roleCode} className="flex items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={roleCodes.includes(roleCode)}
                          onChange={(event) =>
                            setRoleCodes((current) =>
                              toggleRole(current, roleCode, event.target.checked),
                            )
                          }
                        />
                        {getRoleLabel(roleCode)}
                      </label>
                    ))}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isUpdatingRoles || !roleTenantId}
                >
                  {isUpdatingRoles ? "Atualizando..." : "Substituir roles"}
                </Button>
              </form>
            ) : (
              <AdminEmptyState
                title="Roles indisponiveis"
                description="Selecione um usuario para gerenciar roles por tenant."
                action={
                  <a
                    href="#novo-usuario"
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
                  >
                    Cadastrar acesso
                  </a>
                }
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
