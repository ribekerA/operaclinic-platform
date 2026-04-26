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
  adminTextareaClassName,
} from "@/components/platform/platform-admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { useSession } from "@/hooks/use-session";
import { toErrorMessage } from "@/lib/client/http";
import {
  createSpecialty,
  listSpecialties,
  SpecialtyResponse,
  updateSpecialty,
} from "@/lib/client/clinic-structure-api";
import { formatDateTime } from "@/lib/formatters";

interface SpecialtyFormState {
  name: string;
  description: string;
  isActive: boolean;
}

const defaultForm: SpecialtyFormState = {
  name: "",
  description: "",
  isActive: true,
};

const AESTHETIC_SPECIALTY_PRESETS = [
  "Estetica facial",
  "Harmonizacao orofacial",
  "Estetica corporal",
  "Tecnologias a laser",
  "Tricologia estetica",
  "Cosmiatria",
] as const;

export default function ClinicSpecialtiesPage() {
  const { user } = useSession({ expectedProfile: "clinic" });
  const canManage = useMemo(() => {
    if (!user) {
      return false;
    }

    return (
      user.roles.includes("TENANT_ADMIN") || user.roles.includes("CLINIC_MANAGER")
    );
  }, [user]);

  const [specialties, setSpecialties] = useState<SpecialtyResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [createForm, setCreateForm] = useState<SpecialtyFormState>(defaultForm);
  const [isCreating, setIsCreating] = useState(false);

  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SpecialtyFormState | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const selectedSpecialty = useMemo(
    () => specialties.find((specialty) => specialty.id === selectedSpecialtyId) ?? null,
    [selectedSpecialtyId, specialties],
  );

  const loadSpecialties = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextSpecialties = await listSpecialties();
      setSpecialties(nextSpecialties);
      setSelectedSpecialtyId((current) => {
        if (current && nextSpecialties.some((specialty) => specialty.id === current)) {
          return current;
        }

        return nextSpecialties[0]?.id ?? null;
      });
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Nao foi possivel carregar especialidades esteticas."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSpecialties();
  }, [loadSpecialties]);

  useEffect(() => {
    if (!selectedSpecialty) {
      setEditForm(null);
      return;
    }

    setEditForm({
      name: selectedSpecialty.name,
      description: selectedSpecialty.description ?? "",
      isActive: selectedSpecialty.isActive,
    });
  }, [selectedSpecialty]);

  const specialtyMetrics = useMemo(() => {
    const activeCount = specialties.filter((item) => item.isActive).length;
    const describedCount = specialties.filter((item) => Boolean(item.description?.trim())).length;

    return [
      {
        label: "Especialidades",
        value: String(specialties.length),
        helper: "Base de especialidades esteticas cadastrada.",
      },
      {
        label: "Ativas",
        value: String(activeCount),
        helper: "Disponiveis para uso na rotina da estetica.",
        tone: "accent" as const,
      },
      {
        label: "Com descricao",
        value: String(describedCount),
        helper: "Com contexto extra para a equipe.",
      },
      {
        label: "Sem descricao",
        value: String(specialties.length - describedCount),
        helper: "Podem precisar de mais contexto.",
      },
    ];
  }, [specialties]);

  const shortcutItems = useMemo(
    () => [
      {
        label: "Nova especialidade",
        description: "Ir direto para o cadastro.",
        href: "#nova-especialidade",
      },
      {
        label: "Profissionais",
        description: "Cruzar equipe com especialidades.",
        href: "/clinic/professionals",
      },
      {
        label: "Procedimentos esteticos",
        description: "Revisar configuracoes da agenda.",
        href: "/clinic/consultation-types",
      },
    ],
    [],
  );

  async function handleCreateSpecialty(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      await createSpecialty({
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        isActive: createForm.isActive,
      });

      setCreateForm(defaultForm);
      setSuccess("Especialidade criada com sucesso.");
      await loadSpecialties();
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao criar especialidade."));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdateSpecialty(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!canManage || !selectedSpecialty || !editForm) {
      return;
    }

    setIsUpdating(true);
    setError(null);
    setSuccess(null);

    try {
      const updatedSpecialty = await updateSpecialty(selectedSpecialty.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        isActive: editForm.isActive,
      });

      setSpecialties((currentSpecialties) =>
        currentSpecialties.map((specialty) =>
          specialty.id === updatedSpecialty.id ? updatedSpecialty : specialty,
        ),
      );
      setSuccess("Especialidade atualizada.");
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao atualizar especialidade."));
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clinica | Especialidades"
        title="Especialidades"
        description="Organize as especialidades esteticas da clinica com linguagem clara para a equipe operacional."
        actions={
          <Button
            type="button"
            className="border border-slate-200 bg-white text-ink hover:bg-slate-50"
            onClick={() => {
              void loadSpecialties();
            }}
            disabled={isLoading}
          >
            {isLoading ? "Atualizando..." : "Atualizar especialidades"}
          </Button>
        }
      >
        <AdminMetricGrid items={specialtyMetrics} isLoading={isLoading && specialties.length === 0} />
        <AdminShortcutPanel title="Acoes rapidas" items={shortcutItems} />
      </AdminPageHeader>

      {!canManage ? (
        <Card className="border-amber-200 bg-amber-50" role="alert">
          <p className="text-sm text-amber-700">
            Seu perfil possui leitura parcial. Apenas admin e gestor da clinica podem editar.
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

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Base"
            title="Especialidades cadastradas"
            description="Veja rapidamente nome, status e contexto de cada especialidade estetica."
            actions={<AdminCountBadge value={specialties.length} loading={isLoading} />}
          />

          <div className="space-y-3">
            {isLoading && specialties.length === 0 ? (
              Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="animate-pulse rounded-[24px] border border-slate-200 bg-white p-4">
                  <div className="h-4 w-40 rounded-full bg-slate-200" />
                  <div className="mt-3 h-3 w-28 rounded-full bg-slate-100" />
                  <div className="mt-4 h-3 w-52 rounded-full bg-slate-100" />
                </div>
              ))
            ) : specialties.length > 0 ? (
              specialties.map((specialty) => {
                const isSelected = selectedSpecialtyId === specialty.id;

                return (
                  <button
                    key={specialty.id}
                    type="button"
                    onClick={() => setSelectedSpecialtyId(specialty.id)}
                    className={`w-full rounded-[24px] border p-4 text-left transition ${
                      isSelected
                        ? "border-teal-300 bg-teal-50 shadow-sm"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-ink">{specialty.name}</p>
                          <StatusPill
                            label={specialty.isActive ? "Ativa" : "Inativa"}
                            tone={specialty.isActive ? "success" : "warning"}
                          />
                        </div>
                        <p className="text-sm text-muted">
                          {specialty.description?.trim() || "Sem descricao da especialidade."}
                        </p>
                      </div>
                      <div className="space-y-2 text-sm text-muted lg:text-right">
                        <p>Atualizado em {formatDateTime(specialty.updatedAt)}</p>
                        <span className="inline-flex rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-ink">
                          Abrir ficha
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <AdminEmptyState
                title="Nenhuma especialidade cadastrada"
                description="Crie as especialidades para organizar equipe, agenda e procedimentos esteticos."
                action={
                  canManage ? (
                    <Button
                      type="button"
                      className="bg-slate-950 text-white hover:bg-slate-800"
                      onClick={() => {
                        document
                          .getElementById("nova-especialidade")
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

        <Card id="nova-especialidade" className="space-y-4 scroll-mt-24">
          <AdminSectionHeader
            eyebrow="Cadastro"
            title="Nova especialidade"
            description="Cadastre a especialidade estetica com nome claro e descricao curta para a equipe."
            actions={
              <StatusPill
                label={canManage ? "Edicao liberada" : "Somente leitura"}
                tone={canManage ? "success" : "warning"}
              />
            }
          />

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Sugestoes rapidas
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {AESTHETIC_SPECIALTY_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-teal-300 hover:bg-teal-50"
                  onClick={() => setCreateForm((current) => ({ ...current, name: preset }))}
                  disabled={!canManage}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <form className="space-y-4" onSubmit={(event) => void handleCreateSpecialty(event)}>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Nome da especialidade
              </label>
              <input
                type="text"
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, name: event.target.value }))
                }
                className={adminInputClassName}
                required
                disabled={!canManage}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
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
                disabled={!canManage}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={createForm.isActive}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
                disabled={!canManage}
              />
              Especialidade ativa
            </label>

            <Button type="submit" className="w-full" disabled={!canManage || isCreating}>
              {isCreating ? "Criando..." : "Criar especialidade"}
            </Button>
          </form>
        </Card>
      </section>

      <Sheet
        open={selectedSpecialtyId !== null}
        onClose={() => setSelectedSpecialtyId(null)}
        title="Ficha da especialidade"
        description={selectedSpecialty?.name}
      >
        {editForm && selectedSpecialty ? (
          <div className="space-y-6">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  label={selectedSpecialty.isActive ? "Ativa" : "Inativa"}
                  tone={selectedSpecialty.isActive ? "success" : "warning"}
                />
              </div>
              <p className="mt-3 text-sm text-muted">
                Atualizado em {formatDateTime(selectedSpecialty.updatedAt)}
              </p>
            </div>

            <form className="space-y-4" onSubmit={(event) => void handleUpdateSpecialty(event)}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Dados principais
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Nome
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  className={adminInputClassName}
                  required
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Descricao
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, description: event.target.value } : current,
                    )
                  }
                  rows={4}
                  className={adminTextareaClassName}
                  disabled={!canManage}
                />
              </div>
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
                Especialidade ativa
              </label>
              <Button type="submit" className="w-full" disabled={!canManage || isUpdating}>
                {isUpdating ? "Salvando..." : "Salvar alteracoes"}
              </Button>
            </form>
          </div>
        ) : (
          <AdminEmptyState
            title="Selecione uma especialidade"
            description="Abra um item da lista para editar nome, descricao e status."
          />
        )}
      </Sheet>
    </div>
  );
}
