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
  createUnit,
  listUnits,
  UnitResponse,
  updateUnit,
} from "@/lib/client/clinic-structure-api";
import { formatDateTime } from "@/lib/formatters";

interface UnitFormState {
  name: string;
  description: string;
  isActive: boolean;
}

const defaultForm: UnitFormState = {
  name: "",
  description: "",
  isActive: true,
};

export default function ClinicUnitsPage() {
  const { user } = useSession({ expectedProfile: "clinic" });
  const canManage = useMemo(() => {
    if (!user) {
      return false;
    }

    return (
      user.roles.includes("TENANT_ADMIN") || user.roles.includes("CLINIC_MANAGER")
    );
  }, [user]);

  const [units, setUnits] = useState<UnitResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [createForm, setCreateForm] = useState<UnitFormState>(defaultForm);
  const [isCreating, setIsCreating] = useState(false);

  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UnitFormState | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const selectedUnit = useMemo(
    () => units.find((unit) => unit.id === selectedUnitId) ?? null,
    [selectedUnitId, units],
  );

  const loadUnits = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextUnits = await listUnits();
      setUnits(nextUnits);
      setSelectedUnitId((current) => {
        if (current && nextUnits.some((unit) => unit.id === current)) {
          return current;
        }

        return nextUnits[0]?.id ?? null;
      });
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Nao foi possivel carregar unidades."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  useEffect(() => {
    if (!selectedUnit) {
      setEditForm(null);
      return;
    }

    setEditForm({
      name: selectedUnit.name,
      description: selectedUnit.description ?? "",
      isActive: selectedUnit.isActive,
    });
  }, [selectedUnit]);

  const unitMetrics = useMemo(() => {
    const activeCount = units.filter((unit) => unit.isActive).length;
    const describedCount = units.filter((unit) => Boolean(unit.description?.trim())).length;

    return [
      {
        label: "Unidades",
        value: String(units.length),
        helper: "Estruturas operacionais cadastradas.",
      },
      {
        label: "Ativas",
        value: String(activeCount),
        helper: "Disponiveis para agenda e operacao.",
        tone: "accent" as const,
      },
      {
        label: "Com descricao",
        value: String(describedCount),
        helper: "Com contexto preenchido para equipe.",
      },
      {
        label: "Sem descricao",
        value: String(units.length - describedCount),
        helper: "Podem pedir mais contexto operacional.",
      },
    ];
  }, [units]);

  const shortcutItems = useMemo(
    () => [
      {
        label: "Nova unidade",
        description: "Ir direto para o cadastro.",
        href: "#nova-unidade",
      },
      {
        label: "Profissionais",
        description: "Cruzar equipe com unidades.",
        href: "/clinic/professionals",
      },
      {
        label: "Recepcao",
        description: "Voltar para agenda e fila do dia.",
        href: "/clinic/reception",
      },
    ],
    [],
  );

  async function handleCreateUnit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      await createUnit({
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        isActive: createForm.isActive,
      });

      setCreateForm(defaultForm);
      setSuccess("Unidade criada com sucesso.");
      await loadUnits();
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao criar unidade."));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdateUnit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canManage || !selectedUnit || !editForm) {
      return;
    }

    setIsUpdating(true);
    setError(null);
    setSuccess(null);

    try {
      const updatedUnit = await updateUnit(selectedUnit.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        isActive: editForm.isActive,
      });

      setUnits((currentUnits) =>
        currentUnits.map((unit) => (unit.id === updatedUnit.id ? updatedUnit : unit)),
      );
      setSuccess("Unidade atualizada.");
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao atualizar unidade."));
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clinica | Unidades"
        title="Unidades"
        description="Estrutura fisica da clinica organizada de forma mais clara, com menos ruído e edicao mais direta."
        actions={
          <Button
            type="button"
            className="border border-slate-200 bg-white text-ink hover:bg-slate-50"
            onClick={() => {
              void loadUnits();
            }}
            disabled={isLoading}
          >
            {isLoading ? "Atualizando..." : "Atualizar unidades"}
          </Button>
        }
      >
        <AdminMetricGrid items={unitMetrics} isLoading={isLoading && units.length === 0} />
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
            eyebrow="Estrutura"
            title="Unidades cadastradas"
            description="Veja rapidamente status e contexto de cada unidade sem depender de tabela fixa."
            actions={<AdminCountBadge value={units.length} loading={isLoading} />}
          />

          <div className="space-y-3">
            {isLoading && units.length === 0 ? (
              Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="animate-pulse rounded-[24px] border border-slate-200 bg-white p-4">
                  <div className="h-4 w-40 rounded-full bg-slate-200" />
                  <div className="mt-3 h-3 w-28 rounded-full bg-slate-100" />
                  <div className="mt-4 h-3 w-52 rounded-full bg-slate-100" />
                </div>
              ))
            ) : units.length > 0 ? (
              units.map((unit) => {
                const isSelected = selectedUnitId === unit.id;

                return (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={() => setSelectedUnitId(unit.id)}
                    className={`w-full rounded-[24px] border p-4 text-left transition ${
                      isSelected
                        ? "border-teal-300 bg-teal-50 shadow-sm"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-ink">{unit.name}</p>
                          <StatusPill
                            label={unit.isActive ? "Ativa" : "Inativa"}
                            tone={unit.isActive ? "success" : "warning"}
                          />
                        </div>
                        <p className="text-sm text-muted">
                          {unit.description?.trim() || "Sem descricao operacional."}
                        </p>
                      </div>
                      <div className="space-y-2 text-sm text-muted lg:text-right">
                        <p>Atualizado em {formatDateTime(unit.updatedAt)}</p>
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
                title="Nenhuma unidade cadastrada"
                description="Crie as unidades para organizar agenda, estrutura e equipe da clinica."
                action={
                  canManage ? (
                    <Button
                      type="button"
                      className="bg-slate-950 text-white hover:bg-slate-800"
                      onClick={() => {
                        document.getElementById("nova-unidade")?.scrollIntoView({ behavior: "smooth" });
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

        <Card id="nova-unidade" className="space-y-4 scroll-mt-24">
          <AdminSectionHeader
            eyebrow="Cadastro"
            title="Nova unidade"
            description="Cadastre a unidade com nome claro e contexto suficiente para a equipe."
            actions={
              <StatusPill
                label={canManage ? "Edicao liberada" : "Somente leitura"}
                tone={canManage ? "success" : "warning"}
              />
            }
          />

          <form className="space-y-4" onSubmit={(event) => void handleCreateUnit(event)}>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Nome
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
              Unidade ativa
            </label>

            <Button type="submit" className="w-full" disabled={!canManage || isCreating}>
              {isCreating ? "Criando..." : "Criar unidade"}
            </Button>
          </form>
        </Card>
      </section>

      <Sheet
        open={selectedUnitId !== null}
        onClose={() => setSelectedUnitId(null)}
        title="Ficha da unidade"
        description={selectedUnit?.name}
      >
        {editForm && selectedUnit ? (
          <div className="space-y-6">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  label={selectedUnit.isActive ? "Ativa" : "Inativa"}
                  tone={selectedUnit.isActive ? "success" : "warning"}
                />
              </div>
              <p className="mt-3 text-sm text-muted">
                Atualizado em {formatDateTime(selectedUnit.updatedAt)}
              </p>
            </div>

            <form className="space-y-4" onSubmit={(event) => void handleUpdateUnit(event)}>
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
                Unidade ativa
              </label>
              <Button type="submit" className="w-full" disabled={!canManage || isUpdating}>
                {isUpdating ? "Salvando..." : "Salvar alteracoes"}
              </Button>
            </form>
          </div>
        ) : (
          <AdminEmptyState
            title="Selecione uma unidade"
            description="Abra um item da lista para editar nome, descricao e status."
          />
        )}
      </Sheet>
    </div>
  );
}

