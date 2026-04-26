"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminCountBadge,
  AdminEmptyState,
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionHeader,
  AdminShortcutPanel,
  adminInputClassName,
} from "@/components/platform/platform-admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { useSession } from "@/hooks/use-session";
import {
  createProfessional,
  listProfessionals,
  listSpecialties,
  listUnits,
  ProfessionalResponse,
  SpecialtyResponse,
  UnitResponse,
  updateProfessional,
} from "@/lib/client/clinic-structure-api";
import { toErrorMessage } from "@/lib/client/http";
import { formatDateTime, getUserStatusLabel } from "@/lib/formatters";

interface ProfessionalFormState {
  fullName: string;
  displayName: string;
  professionalRegister: string;
  accessEmail: string;
  accessPassword: string;
  visibleForSelfBooking: boolean;
  isActive: boolean;
  specialtyIds: string[];
  unitIds: string[];
}

const defaultProfessionalForm: ProfessionalFormState = {
  fullName: "",
  displayName: "",
  professionalRegister: "",
  accessEmail: "",
  accessPassword: "",
  visibleForSelfBooking: false,
  isActive: true,
  specialtyIds: [],
  unitIds: [],
};

function toggleSelection(list: string[], value: string, checked: boolean): string[] {
  if (checked) {
    return [...new Set([...list, value])];
  }

  return list.filter((item) => item !== value);
}

function buildEditForm(professional: ProfessionalResponse): ProfessionalFormState {
  return {
    fullName: professional.fullName,
    displayName: professional.displayName,
    professionalRegister: professional.professionalRegister,
    accessEmail: professional.linkedUser?.email ?? "",
    accessPassword: "",
    visibleForSelfBooking: professional.visibleForSelfBooking,
    isActive: professional.isActive,
    specialtyIds: professional.specialties.map((specialty) => specialty.id),
    unitIds: professional.units.map((unit) => unit.id),
  };
}

function formatProfessionalCredential(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    return "Credencial nao informada";
  }

  return `Credencial ${normalized}`;
}

export function ClinicProfessionalsWorkspace() {
  const { user } = useSession({ expectedProfile: "clinic" });
  const canManage = useMemo(
    () =>
      Boolean(
        user?.roles.includes("TENANT_ADMIN") ||
          user?.roles.includes("CLINIC_MANAGER"),
      ),
    [user],
  );

  const [professionals, setProfessionals] = useState<ProfessionalResponse[]>([]);
  const [units, setUnits] = useState<UnitResponse[]>([]);
  const [specialties, setSpecialties] = useState<SpecialtyResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [createForm, setCreateForm] =
    useState<ProfessionalFormState>(defaultProfessionalForm);
  const [isCreating, setIsCreating] = useState(false);

  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(
    null,
  );
  const [editForm, setEditForm] = useState<ProfessionalFormState | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const selectedProfessional = useMemo(
    () =>
      professionals.find((professional) => professional.id === selectedProfessionalId) ??
      null,
    [professionals, selectedProfessionalId],
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextProfessionals, nextUnits, nextSpecialties] = await Promise.all([
        listProfessionals(),
        listUnits(),
        listSpecialties(),
      ]);

      setProfessionals(nextProfessionals);
      setUnits(nextUnits);
      setSpecialties(nextSpecialties);
      setSelectedProfessionalId((current) =>
        current && nextProfessionals.some((item) => item.id === current)
          ? current
          : (nextProfessionals[0]?.id ?? null),
      );
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Nao foi possivel carregar profissionais."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedProfessional) {
      setEditForm(null);
      return;
    }

    setEditForm(buildEditForm(selectedProfessional));
  }, [selectedProfessional]);

  const professionalMetrics = useMemo(() => {
    const activeCount = professionals.filter((item) => item.isActive).length;
    const loginReadyCount = professionals.filter((item) => item.linkedUser).length;
    const selfBookingCount = professionals.filter(
      (item) => item.visibleForSelfBooking,
    ).length;

    return [
      {
        label: "Profissionais",
        value: String(professionals.length),
        helper: "Equipe cadastrada na clinica.",
      },
      {
        label: "Ativos",
        value: String(activeCount),
        helper: "Aptos para agenda e operacao.",
        tone: "accent" as const,
      },
      {
        label: "Login pronto",
        value: String(loginReadyCount),
        helper: "Com acesso ja vinculado.",
      },
      {
        label: "Autoagendamento",
        value: String(selfBookingCount),
        helper: "Visiveis para agendamento proprio.",
      },
    ];
  }, [professionals]);

  const shortcutItems = useMemo(
    () => [
      {
        label: "Novo profissional",
        description: "Ir direto ao cadastro da equipe.",
        href: "#novo-profissional",
      },
      {
        label: "Usuarios",
        description: "Cruzar acessos e vinculos.",
        href: "/clinic/users",
      },
      {
        label: "Recepcao",
        description: "Voltar para agenda e fila do dia.",
        href: "/clinic/reception",
      },
    ],
    [],
  );

  async function handleCreateProfessional(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!canManage) return;

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      await createProfessional({
        fullName: createForm.fullName.trim(),
        displayName: createForm.displayName.trim(),
        professionalRegister: createForm.professionalRegister.trim(),
        accessEmail: createForm.accessEmail.trim(),
        accessPassword: createForm.accessPassword.trim(),
        visibleForSelfBooking: createForm.visibleForSelfBooking,
        isActive: createForm.isActive,
        specialtyIds: createForm.specialtyIds,
        unitIds: createForm.unitIds,
      });

      setCreateForm(defaultProfessionalForm);
      setSuccess("Profissional criado com sucesso.");
      await loadData();
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao criar profissional."));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdateProfessional(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!canManage || !selectedProfessional || !editForm) return;

    setIsUpdating(true);
    setError(null);
    setSuccess(null);

    try {
      await updateProfessional(selectedProfessional.id, {
        fullName: editForm.fullName.trim(),
        displayName: editForm.displayName.trim(),
        professionalRegister: editForm.professionalRegister.trim(),
        visibleForSelfBooking: editForm.visibleForSelfBooking,
        isActive: editForm.isActive,
        specialtyIds: editForm.specialtyIds,
        unitIds: editForm.unitIds,
      });

      setSuccess("Profissional atualizado.");
      await loadData();
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao atualizar profissional."));
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clinica | Profissionais"
        title="Profissionais"
        description="Equipe mais facil de visualizar, com acesso, agenda e disponibilidade organizados na mesma superficie."
        actions={
          <Button
            type="button"
            className="border border-slate-200 bg-white text-ink hover:bg-slate-50"
            onClick={() => {
              void loadData();
            }}
            disabled={isLoading}
          >
            {isLoading ? "Atualizando..." : "Atualizar equipe"}
          </Button>
        }
      >
        <AdminMetricGrid items={professionalMetrics} isLoading={isLoading && professionals.length === 0} />
        <AdminShortcutPanel title="Acoes rapidas" items={shortcutItems} />
      </AdminPageHeader>

      {!canManage ? (
        <Card className="border-amber-200 bg-amber-50" role="alert">
          <p className="text-sm text-amber-700">
            Seu perfil possui leitura parcial. Apenas Admin e Gestor podem editar.
          </p>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-red-200 bg-red-50" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      ) : null}

      {success ? (
        <Card className="border-emerald-200 bg-emerald-50" role="status">
          <p className="text-sm text-emerald-700">{success}</p>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Equipe"
            title="Profissionais cadastrados"
            description="Abrir ficha, validar acesso e revisar vinculos sem depender de tabela fixa."
            actions={<AdminCountBadge value={professionals.length} loading={isLoading} />}
          />

          <div className="space-y-3">
            {isLoading && professionals.length === 0 ? (
              Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="animate-pulse rounded-[24px] border border-slate-200 bg-white p-4">
                  <div className="h-4 w-40 rounded-full bg-slate-200" />
                  <div className="mt-3 h-3 w-28 rounded-full bg-slate-100" />
                  <div className="mt-4 h-3 w-52 rounded-full bg-slate-100" />
                </div>
              ))
            ) : professionals.length > 0 ? (
              professionals.map((professional) => {
                const isSelected = selectedProfessionalId === professional.id;

                return (
                  <button
                    key={professional.id}
                    type="button"
                    onClick={() => setSelectedProfessionalId(professional.id)}
                    className={`w-full rounded-[24px] border p-4 text-left transition ${
                      isSelected
                        ? "border-teal-300 bg-teal-50 shadow-sm"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-ink">
                            {professional.displayName}
                          </p>
                          <StatusPill
                            label={professional.isActive ? "Ativo" : "Inativo"}
                            tone={professional.isActive ? "success" : "warning"}
                          />
                          <StatusPill
                            label={
                              professional.visibleForSelfBooking
                                ? "Autoagendamento"
                                : "Sem autoagendamento"
                            }
                            tone={
                              professional.visibleForSelfBooking ? "success" : "neutral"
                            }
                          />
                        </div>
                        <p className="text-sm text-muted">{professional.fullName}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted">
                          <span>{formatProfessionalCredential(professional.professionalRegister)}</span>
                          <span>{professional.specialties.length} especialidades</span>
                          <span>{professional.units.length} unidades</span>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm text-muted lg:text-right">
                        <StatusPill
                          label={professional.linkedUser ? "Login pronto" : "Sem login"}
                          tone={professional.linkedUser ? "success" : "warning"}
                        />
                        <p>{professional.linkedUser?.email ?? "Cadastro sem acesso vinculado"}</p>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <AdminEmptyState
                title="Nenhum profissional cadastrado"
                description="Cadastre a equipe para habilitar agenda, vinculos e acesso clinico."
                action={
                  canManage ? (
                    <Button
                      type="button"
                      className="bg-slate-950 text-white hover:bg-slate-800"
                      onClick={() => {
                        document
                          .getElementById("novo-profissional")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      Ir para cadastro
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        </Card>

        <Card id="novo-profissional" className="space-y-4 scroll-mt-24">
          <AdminSectionHeader
            eyebrow="Cadastro"
            title="Novo profissional"
            description="Crie o profissional e o acesso inicial no mesmo fluxo, sem telas paralelas."
            actions={
              <StatusPill
                label={canManage ? "Edicao liberada" : "Somente leitura"}
                tone={canManage ? "success" : "warning"}
              />
            }
          />

          <form className="space-y-4" onSubmit={(event) => void handleCreateProfessional(event)}>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Nome completo
              </label>
              <input
                className={adminInputClassName}
                value={createForm.fullName}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, fullName: event.target.value }))
                }
                required
                disabled={!canManage}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Nome de exibicao
              </label>
              <input
                className={adminInputClassName}
                value={createForm.displayName}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, displayName: event.target.value }))
                }
                required
                disabled={!canManage}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Credencial interna
              </label>
              <input
                className={adminInputClassName}
                value={createForm.professionalRegister}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    professionalRegister: event.target.value,
                  }))
                }
                required
                disabled={!canManage}
                placeholder="Ex.: ESTETICA-RESP-001"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Email de acesso
                </label>
                <input
                  className={adminInputClassName}
                  type="email"
                  value={createForm.accessEmail}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, accessEmail: event.target.value }))
                  }
                  required
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Senha inicial
                </label>
                <input
                  className={adminInputClassName}
                  type="text"
                  value={createForm.accessPassword}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      accessPassword: event.target.value,
                    }))
                  }
                  required
                  disabled={!canManage}
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Especialidades
              </p>
              <div className="max-h-32 space-y-2 overflow-y-auto rounded-[20px] border border-slate-200 bg-white p-3">
                {specialties.length > 0 ? (
                  specialties.map((specialty) => (
                    <label key={specialty.id} className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={createForm.specialtyIds.includes(specialty.id)}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            specialtyIds: toggleSelection(
                              current.specialtyIds,
                              specialty.id,
                              event.target.checked,
                            ),
                          }))
                        }
                        disabled={!canManage}
                      />
                      {specialty.name}
                    </label>
                  ))
                ) : (
                  <p className="text-xs text-muted">Nenhuma especialidade cadastrada.</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Unidades
              </p>
              <div className="max-h-32 space-y-2 overflow-y-auto rounded-[20px] border border-slate-200 bg-white p-3">
                {units.length > 0 ? (
                  units.map((unit) => (
                    <label key={unit.id} className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={createForm.unitIds.includes(unit.id)}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            unitIds: toggleSelection(
                              current.unitIds,
                              unit.id,
                              event.target.checked,
                            ),
                          }))
                        }
                        disabled={!canManage}
                      />
                      {unit.name}
                    </label>
                  ))
                ) : (
                  <p className="text-xs text-muted">Nenhuma unidade cadastrada.</p>
                )}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={createForm.visibleForSelfBooking}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    visibleForSelfBooking: event.target.checked,
                  }))
                }
                disabled={!canManage}
              />
              Visivel para autoagendamento
            </label>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={createForm.isActive}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, isActive: event.target.checked }))
                }
                disabled={!canManage}
              />
              Profissional ativo
            </label>

            <Button type="submit" className="w-full" disabled={!canManage || isCreating}>
              {isCreating ? "Criando..." : "Criar profissional"}
            </Button>
          </form>
        </Card>
      </section>

      <Sheet
        open={selectedProfessionalId !== null}
        onClose={() => setSelectedProfessionalId(null)}
        title="Ficha do profissional"
        description={selectedProfessional?.displayName}
      >
        {editForm && selectedProfessional ? (
          <div className="space-y-6">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  label={selectedProfessional.isActive ? "Ativo" : "Inativo"}
                  tone={selectedProfessional.isActive ? "success" : "warning"}
                />
                <StatusPill
                  label={
                    selectedProfessional.linkedUser ? "Login pronto" : "Sem login vinculado"
                  }
                  tone={selectedProfessional.linkedUser ? "success" : "warning"}
                />
              </div>
              <p className="mt-3 text-sm text-muted">
                {formatProfessionalCredential(selectedProfessional.professionalRegister)}
              </p>
              <p className="mt-1 text-sm text-muted">
                Atualizado em {formatDateTime(selectedProfessional.updatedAt)}
              </p>
            </div>

            <form className="space-y-4" onSubmit={(event) => void handleUpdateProfessional(event)}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Dados principais
                </p>
              </div>

              <input
                className={adminInputClassName}
                value={editForm.fullName}
                onChange={(event) =>
                  setEditForm((current) =>
                    current ? { ...current, fullName: event.target.value } : current,
                  )
                }
                required
                disabled={!canManage}
              />
              <input
                className={adminInputClassName}
                value={editForm.displayName}
                onChange={(event) =>
                  setEditForm((current) =>
                    current ? { ...current, displayName: event.target.value } : current,
                  )
                }
                required
                disabled={!canManage}
              />
              <input
                className={adminInputClassName}
                value={editForm.professionalRegister}
                onChange={(event) =>
                  setEditForm((current) =>
                    current
                      ? { ...current, professionalRegister: event.target.value }
                      : current,
                  )
                }
                required
                disabled={!canManage}
                placeholder="Ex.: ESTETICA-RESP-001"
              />

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Especialidades
                </p>
                <div className="max-h-32 space-y-2 overflow-y-auto rounded-[20px] border border-slate-200 bg-white p-3">
                  {specialties.length > 0 ? (
                    specialties.map((specialty) => (
                      <label key={specialty.id} className="flex items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={editForm.specialtyIds.includes(specialty.id)}
                          onChange={(event) =>
                            setEditForm((current) =>
                              current
                                ? {
                                    ...current,
                                    specialtyIds: toggleSelection(
                                      current.specialtyIds,
                                      specialty.id,
                                      event.target.checked,
                                    ),
                                  }
                                : current,
                            )
                          }
                          disabled={!canManage}
                        />
                        {specialty.name}
                      </label>
                    ))
                  ) : (
                    <p className="text-xs text-muted">Nenhuma especialidade cadastrada.</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Unidades
                </p>
                <div className="max-h-32 space-y-2 overflow-y-auto rounded-[20px] border border-slate-200 bg-white p-3">
                  {units.length > 0 ? (
                    units.map((unit) => (
                      <label key={unit.id} className="flex items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={editForm.unitIds.includes(unit.id)}
                          onChange={(event) =>
                            setEditForm((current) =>
                              current
                                ? {
                                    ...current,
                                    unitIds: toggleSelection(
                                      current.unitIds,
                                      unit.id,
                                      event.target.checked,
                                    ),
                                  }
                                : current,
                            )
                          }
                          disabled={!canManage}
                        />
                        {unit.name}
                      </label>
                    ))
                  ) : (
                    <p className="text-xs text-muted">Nenhuma unidade cadastrada.</p>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={editForm.visibleForSelfBooking}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current
                        ? { ...current, visibleForSelfBooking: event.target.checked }
                        : current,
                    )
                  }
                  disabled={!canManage}
                />
                Visivel para autoagendamento
              </label>

              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, isActive: event.target.checked } : current,
                    )
                  }
                  disabled={!canManage}
                />
                Profissional ativo
              </label>

              <Button type="submit" className="w-full" disabled={!canManage || isUpdating}>
                {isUpdating ? "Salvando..." : "Salvar alteracoes"}
              </Button>
            </form>

            <Card className="space-y-3 bg-white">
              <AdminSectionHeader
                eyebrow="Acesso"
                title="Login do profissional"
                description="Mostra se este profissional ja consegue entrar com o proprio acesso."
              />

              {selectedProfessional.linkedUser ? (
                <>
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm">
                    <p className="font-semibold text-ink">
                      {selectedProfessional.linkedUser.email}
                    </p>
                    <p className="mt-1 text-muted">
                      {selectedProfessional.linkedUser.fullName}
                    </p>
                  </div>
                  <StatusPill
                    label={getUserStatusLabel(selectedProfessional.linkedUser.status)}
                    tone={
                      selectedProfessional.linkedUser.status === "ACTIVE"
                        ? "success"
                        : selectedProfessional.linkedUser.status === "SUSPENDED"
                          ? "danger"
                          : "warning"
                    }
                  />
                </>
              ) : (
                <p className="text-sm text-muted">
                  Este profissional ainda nao tem acesso vinculado. Os proximos cadastros ja
                  devem nascer com login pronto.
                </p>
              )}
            </Card>
          </div>
        ) : (
          <AdminEmptyState
            title="Selecione um profissional"
            description="Abra uma ficha da lista para editar cadastro, vinculos e acesso."
          />
        )}
      </Sheet>
    </div>
  );
}
