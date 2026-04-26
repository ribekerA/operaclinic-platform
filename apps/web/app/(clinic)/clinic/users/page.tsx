"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminCountBadge,
  AdminEmptyState,
  AdminFilterSummary,
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionHeader,
  AdminShortcutPanel,
  adminInputClassName,
  adminSelectClassName,
} from "@/components/platform/platform-admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { useSession } from "@/hooks/use-session";
import {
  CLINIC_ROLE_OPTIONS,
  createUser,
  deactivateUser,
  listUsers,
  reactivateUser,
  RoleCode,
  updateUser,
  updateUserRoles,
  UserStatus,
  UserSummaryResponse,
} from "@/lib/client/platform-identity-api";
import {
  listProfessionals,
  ProfessionalResponse,
} from "@/lib/client/clinic-structure-api";
import { toErrorMessage } from "@/lib/client/http";
import {
  formatDateTime,
  getRoleLabel,
  getUserStatusLabel,
} from "@/lib/formatters";

interface CreateFormState {
  email: string;
  fullName: string;
  password: string;
  status: UserStatus;
  roleCodes: RoleCode[];
  linkedProfessionalId: string | null;
}

interface EditFormState {
  fullName: string;
  linkedProfessionalId: string | null;
}

const createStatusOptions: UserStatus[] = ["ACTIVE", "INVITED"];

const defaultCreateForm: CreateFormState = {
  email: "",
  fullName: "",
  password: "",
  status: "ACTIVE",
  roleCodes: ["RECEPTION"],
  linkedProfessionalId: null,
};

function getUserRolesForTenant(
  user: UserSummaryResponse,
  tenantId: string,
): RoleCode[] {
  return user.roleAssignments
    .filter((assignment) => assignment.tenantId === tenantId)
    .map((assignment) => assignment.roleCode)
    .filter((code): code is RoleCode => CLINIC_ROLE_OPTIONS.includes(code));
}

function getUserStatusTone(
  status: UserStatus,
): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "INVITED":
      return "warning";
    case "SUSPENDED":
      return "danger";
    case "INACTIVE":
      return "neutral";
    default:
      return "neutral";
  }
}

function toggleRole(list: RoleCode[], code: RoleCode, checked: boolean): RoleCode[] {
  if (checked) {
    return [...new Set([...list, code])];
  }

  return list.filter((role) => role !== code);
}

function buildEditForm(user: UserSummaryResponse): EditFormState {
  return {
    fullName: user.fullName,
    linkedProfessionalId: user.linkedProfessional?.id ?? null,
  };
}

function getProfessionalOptions(
  professionals: ProfessionalResponse[],
  selectedUser: UserSummaryResponse | null,
): ProfessionalResponse[] {
  return professionals.filter((professional) => {
    if (!professional.linkedUser) {
      return true;
    }

    return professional.linkedUser.id === selectedUser?.id;
  });
}

export default function ClinicUsersPage() {
  const { user: sessionUser, loading: sessionLoading } = useSession({
    expectedProfile: "clinic",
  });

  const canManage = useMemo(
    () => sessionUser?.roles.includes("TENANT_ADMIN") ?? false,
    [sessionUser],
  );
  const activeTenantId = sessionUser?.activeTenantId ?? null;

  const [users, setUsers] = useState<UserSummaryResponse[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalResponse[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(defaultCreateForm);
  const [isCreating, setIsCreating] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editRoles, setEditRoles] = useState<RoleCode[]>([]);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingRoles, setIsSavingRoles] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const professionalOptions = useMemo(
    () => getProfessionalOptions(professionals, selectedUser),
    [professionals, selectedUser],
  );

  const orphanProfessionals = useMemo(
    () => professionals.filter((professional) => !professional.linkedUser),
    [professionals],
  );
  const userMetrics = useMemo(() => {
    const activeCount = users.filter((item) => item.status === "ACTIVE").length;
    const invitedCount = users.filter((item) => item.status === "INVITED").length;
    const pendingLinkCount = users.filter((item) => item.requiresProfessionalLink).length;

    return [
      {
        label: "Usuarios",
        value: String(users.length),
        helper: "Acessos carregados para a clinica ativa.",
      },
      {
        label: "Ativos",
        value: String(activeCount),
        helper: "Aptos para operar agora.",
        tone: "accent" as const,
      },
      {
        label: "Convites",
        value: String(invitedCount),
        helper: "Esperando primeiro acesso.",
      },
      {
        label: "Vinculos pendentes",
        value: String(pendingLinkCount),
        helper: "Profissionais ainda sem associacao correta.",
        tone: pendingLinkCount > 0 ? ("danger" as const) : ("default" as const),
      },
    ];
  }, [users]);
  const shortcutItems = useMemo(
    () => [
      {
        label: "Novo usuario",
        description: "Abrir cadastro inicial da equipe.",
        onClick: () => setShowCreateForm(true),
      },
      {
        label: "Profissionais",
        description: "Cruzar equipe clinica e vinculos.",
        href: "/clinic/professionals",
      },
      {
        label: "Minha conta",
        description: "Revisar seguranca e sessao atual.",
        href: "/clinic/account",
      },
    ],
    [],
  );
  const activeFilterSummary = useMemo(
    () => (search.trim() ? [`Busca: ${search.trim()}`] : []),
    [search],
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [usersResponse, professionalsResponse] = await Promise.all([
        listUsers(search.trim() ? { search: search.trim() } : undefined),
        listProfessionals(),
      ]);

      setUsers(usersResponse);
      setProfessionals(professionalsResponse);
    } catch (err) {
      setError(toErrorMessage(err, "Nao foi possivel carregar usuarios e profissionais."));
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (!sessionLoading && canManage) {
      void loadData();
      return;
    }

    if (!sessionLoading) {
      setIsLoading(false);
    }
  }, [canManage, loadData, sessionLoading]);

  useEffect(() => {
    if (!selectedUser || !activeTenantId) {
      setEditForm(null);
      setEditRoles([]);
      return;
    }

    setEditForm(buildEditForm(selectedUser));
    setEditRoles(getUserRolesForTenant(selectedUser, activeTenantId));
  }, [selectedUser, activeTenantId]);

  function openCreateForProfessional(professional: ProfessionalResponse): void {
    setCreateForm({
      ...defaultCreateForm,
      fullName: professional.fullName,
      roleCodes: ["PROFESSIONAL"],
      linkedProfessionalId: professional.id,
    });
    setShowCreateForm(true);
    setSelectedUserId(null);
    setError(null);
    setSuccess(null);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      await createUser({
        email: createForm.email.trim(),
        fullName: createForm.fullName.trim(),
        password: createForm.password.trim(),
        status: createForm.status,
        roleCodes: createForm.roleCodes,
        linkedProfessionalId: createForm.linkedProfessionalId,
      });

      setCreateForm(defaultCreateForm);
      setShowCreateForm(false);
      setSuccess("Usuario criado com sucesso.");
      await loadData();
    } catch (err) {
      setError(toErrorMessage(err, "Nao foi possivel criar o usuario."));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canManage || !selectedUserId || !editForm) {
      return;
    }

    setIsSavingProfile(true);
    setError(null);
    setSuccess(null);

    try {
      await updateUser(selectedUserId, {
        fullName: editForm.fullName.trim(),
        linkedProfessionalId: editForm.linkedProfessionalId,
      });
      setSuccess("Usuario atualizado.");
      await loadData();
    } catch (err) {
      setError(toErrorMessage(err, "Nao foi possivel salvar o usuario."));
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleSaveRoles(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canManage || !selectedUserId || !activeTenantId || !selectedUser) {
      return;
    }

    if (
      !editRoles.includes("PROFESSIONAL") &&
      selectedUser.linkedProfessional !== null
    ) {
      setError("Desvincule o profissional antes de remover o papel de profissional.");
      return;
    }

    setIsSavingRoles(true);
    setError(null);
    setSuccess(null);

    try {
      await updateUserRoles(selectedUserId, {
        tenantId: activeTenantId,
        roleCodes: editRoles,
      });
      setSuccess("Papeis atualizados.");
      await loadData();
    } catch (err) {
      setError(toErrorMessage(err, "Nao foi possivel atualizar os papeis."));
    } finally {
      setIsSavingRoles(false);
    }
  }

  async function handleStatusAction(nextAction: "deactivate" | "reactivate"): Promise<void> {
    if (!canManage || !selectedUserId) {
      return;
    }

    setIsUpdatingStatus(true);
    setError(null);
    setSuccess(null);

    try {
      if (nextAction === "deactivate") {
        await deactivateUser(selectedUserId);
        setSuccess("Usuario desativado.");
      } else {
        await reactivateUser(selectedUserId);
        setSuccess("Usuario reativado.");
      }

      await loadData();
    } catch (err) {
      setError(
        toErrorMessage(
          err,
          nextAction === "deactivate"
            ? "Nao foi possivel desativar o usuario."
            : "Nao foi possivel reativar o usuario.",
        ),
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  if (!sessionLoading && !canManage) {
    return (
      <AdminEmptyState
        title="Usuarios da clinica"
        description="Apenas o admin da clinica pode administrar usuarios, papeis e acessos."
      />
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clinica | Usuarios"
        title="Acessos e papeis da equipe"
        description="Controle quem entra no painel, quais papeis cada pessoa tem e quais profissionais ainda precisam de acesso vinculado."
        actions={
          <>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou email"
              className={`${adminInputClassName} w-64`}
            />
            <button
              type="button"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
              onClick={() => {
                void loadData();
              }}
            >
              Atualizar
            </button>
            <Button type="button" onClick={() => setShowCreateForm((current) => !current)}>
              {showCreateForm ? "Fechar criacao" : "Novo usuario"}
            </Button>
          </>
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

      {success ? (
        <Card className="border-emerald-200 bg-emerald-50" role="status" aria-live="polite">
          <p className="text-sm text-emerald-700">{success}</p>
        </Card>
      ) : null}

      <AdminFilterSummary
        items={activeFilterSummary}
        onClear={
          search.trim()
            ? () => {
                setSearch("");
              }
            : undefined
        }
      />

      {showCreateForm ? (
        <Card className="space-y-5">
          <AdminSectionHeader
            eyebrow="Provisionamento"
            title="Criar acesso da equipe"
            description="Cadastre o usuario inicial da clinica e resolva profissionais ainda sem login."
          />

          <form className="space-y-5" onSubmit={(event) => void handleCreate(event)}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Email
                </label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  className={adminInputClassName}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Nome completo
                </label>
                <input
                  type="text"
                  value={createForm.fullName}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      fullName: event.target.value,
                    }))
                  }
                  className={adminInputClassName}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Senha inicial
                </label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  className={adminInputClassName}
                  required
                />
                <p className="text-xs text-muted">
                  Use pelo menos 8 caracteres com letras maiusculas, minusculas e
                  numeros.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Estado inicial
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
                  {createStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {getUserStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Papeis
              </p>
              <div className="flex flex-wrap gap-3">
                {CLINIC_ROLE_OPTIONS.map((code) => (
                  <label key={code} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={createForm.roleCodes.includes(code)}
                      onChange={(event) =>
                        setCreateForm((current) => {
                          const nextRoles = toggleRole(
                            current.roleCodes,
                            code,
                            event.target.checked,
                          );

                          return {
                            ...current,
                            roleCodes: nextRoles,
                            linkedProfessionalId: nextRoles.includes("PROFESSIONAL")
                              ? current.linkedProfessionalId
                              : null,
                          };
                        })
                      }
                    />
                    {getRoleLabel(code)}
                  </label>
                ))}
              </div>
            </div>

            {createForm.roleCodes.includes("PROFESSIONAL") ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Vinculo com profissional
                </label>
                <select
                  value={createForm.linkedProfessionalId ?? ""}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      linkedProfessionalId: event.target.value || null,
                    }))
                  }
                  className={adminSelectClassName}
                >
                  <option value="">Selecione um profissional existente</option>
                  {professionals
                    .filter((professional) => !professional.linkedUser)
                    .map((professional) => (
                      <option key={professional.id} value={professional.id}>
                        {professional.displayName} - {professional.professionalRegister}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-muted">
                  Use este campo para resolver profissionais legados que ainda
                  estao sem acesso vinculado.
                </p>
              </div>
            ) : null}

            <Button type="submit" disabled={isCreating}>
              {isCreating ? "Criando..." : "Criar usuario"}
            </Button>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="p-0">
          {isLoading ? (
            <div className="px-6 py-8 text-sm text-muted">Carregando usuarios...</div>
          ) : users.length === 0 ? (
            <div className="px-6 py-8">
              <AdminEmptyState
                title="Nenhum usuario encontrado"
                description="Crie o primeiro acesso da equipe ou ajuste a busca para recuperar usuarios existentes."
                action={
                  <Button type="button" onClick={() => setShowCreateForm(true)}>
                    Novo usuario
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-panel text-left text-xs uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th className="px-4 py-3">Pessoa</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Papeis</th>
                    <th className="px-4 py-3">Vinculo profissional</th>
                    <th className="px-4 py-3">Criado em</th>
                    <th className="px-4 py-3">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-white">
                  {users.map((user) => {
                    const roles = activeTenantId
                      ? getUserRolesForTenant(user, activeTenantId)
                      : [];

                    return (
                      <tr key={user.id} className="align-top hover:bg-accentSoft/60">
                        <td className="px-4 py-4">
                          <p className="font-semibold text-ink">{user.fullName}</p>
                          <p className="text-xs text-muted">{user.email}</p>
                        </td>
                        <td className="px-4 py-4">
                          <StatusPill
                            label={getUserStatusLabel(user.status)}
                            tone={getUserStatusTone(user.status)}
                          />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1">
                            {roles.length > 0 ? (
                              roles.map((role) => (
                                <StatusPill key={role} label={getRoleLabel(role)} />
                              ))
                            ) : (
                              <span className="text-xs text-muted">Sem papel nesta clinica</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {user.linkedProfessional ? (
                            <div className="space-y-1">
                              <StatusPill
                                label={user.linkedProfessional.displayName}
                                tone={user.linkedProfessional.isActive ? "success" : "warning"}
                              />
                              <p className="text-xs text-muted">
                                {user.linkedProfessional.professionalRegister}
                              </p>
                            </div>
                          ) : user.requiresProfessionalLink ? (
                            <div className="space-y-1">
                              <StatusPill label="Vinculo pendente" tone="warning" />
                              <p className="text-xs text-muted">
                                Usuario profissional sem cadastro vinculado.
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted">Nao se aplica</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-xs text-muted">
                          {formatDateTime(user.createdAt)}
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => setSelectedUserId(user.id)}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-accentSoft"
                          >
                            Abrir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Pendencias de acesso"
            title="Profissionais sem login vinculado"
            description="Estes registros ja existem na clinica, mas ainda nao receberam um usuario valido."
            actions={<AdminCountBadge value={orphanProfessionals.length} loading={isLoading} />}
          />

          <div className="space-y-3">
            {orphanProfessionals.length > 0 ? (
              orphanProfessionals.map((professional) => (
                <div
                  key={professional.id}
                  className="rounded-2xl border border-border px-4 py-4"
                >
                  <p className="font-semibold text-ink">{professional.displayName}</p>
                  <p className="text-xs text-muted">{professional.professionalRegister}</p>
                  <p className="mt-2 text-xs text-muted">
                    {professional.fullName}
                  </p>
                  <button
                    type="button"
                    onClick={() => openCreateForProfessional(professional)}
                    className="mt-3 text-sm font-semibold text-accent transition hover:opacity-80"
                  >
                    Criar acesso para este profissional
                  </button>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-border px-4 py-4 text-sm text-muted">
                Nenhum profissional legado sem acesso foi encontrado.
              </div>
            )}
          </div>
        </Card>
      </div>

      <Sheet
        open={selectedUserId !== null}
        onClose={() => setSelectedUserId(null)}
        title="Detalhe do usuario"
        description={selectedUser?.email}
      >
        {selectedUser && editForm ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-panel/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  label={getUserStatusLabel(selectedUser.status)}
                  tone={getUserStatusTone(selectedUser.status)}
                />
                {selectedUser.requiresProfessionalLink ? (
                  <StatusPill label="Vinculo profissional pendente" tone="warning" />
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">
                Use este painel para ajustar dados basicos, papeis e estado do
                acesso.
              </p>
            </div>

            <form className="space-y-4" onSubmit={(event) => void handleSaveProfile(event)}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Dados do usuario
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Nome completo
                </label>
                <input
                  type="text"
                  value={editForm.fullName}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current
                        ? {
                            ...current,
                            fullName: event.target.value,
                          }
                        : current,
                    )
                  }
                  className={adminInputClassName}
                />
              </div>

              {editRoles.includes("PROFESSIONAL") || selectedUser.linkedProfessional ? (
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Vinculo com profissional
                  </label>
                  <select
                    value={editForm.linkedProfessionalId ?? ""}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              linkedProfessionalId: event.target.value || null,
                            }
                          : current,
                      )
                    }
                    className={adminSelectClassName}
                  >
                    <option value="">Sem vinculo</option>
                    {professionalOptions.map((professional) => (
                      <option key={professional.id} value={professional.id}>
                        {professional.displayName} - {professional.professionalRegister}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted">
                    Vincule o usuario ao cadastro do profissional para encerrar
                    pendencias legadas de acesso.
                  </p>
                </div>
              ) : null}

              <Button type="submit" className="w-full" disabled={isSavingProfile}>
                {isSavingProfile ? "Salvando..." : "Salvar dados"}
              </Button>
            </form>

            <form className="space-y-4 border-t border-border pt-5" onSubmit={(event) => void handleSaveRoles(event)}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Papeis na clinica
                </p>
              </div>

              <div className="space-y-2">
                {CLINIC_ROLE_OPTIONS.map((roleCode) => (
                  <label key={roleCode} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={editRoles.includes(roleCode)}
                      onChange={(event) =>
                        setEditRoles((current) => toggleRole(current, roleCode, event.target.checked))
                      }
                    />
                    {getRoleLabel(roleCode)}
                  </label>
                ))}
              </div>

              <Button type="submit" className="w-full" disabled={isSavingRoles}>
                {isSavingRoles ? "Atualizando..." : "Salvar papeis"}
              </Button>
            </form>

            <div className="space-y-4 border-t border-border pt-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Estado do acesso
                </p>
              </div>

              {selectedUser.status === "ACTIVE" || selectedUser.status === "INVITED" ? (
                <Button
                  type="button"
                  className="w-full bg-slate-100 text-ink hover:opacity-100 hover:bg-slate-200"
                  disabled={isUpdatingStatus}
                  onClick={() => void handleStatusAction("deactivate")}
                >
                  {isUpdatingStatus ? "Atualizando..." : "Desativar usuario"}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="w-full"
                  disabled={isUpdatingStatus}
                  onClick={() => void handleStatusAction("reactivate")}
                >
                  {isUpdatingStatus ? "Atualizando..." : "Reativar usuario"}
                </Button>
              )}

              <p className="text-xs leading-6 text-muted">
                A redefinicao de senha do proprio usuario fica em Minha conta. O
                fluxo publico de redefinicao por token fica na tela de login.
              </p>
            </div>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
