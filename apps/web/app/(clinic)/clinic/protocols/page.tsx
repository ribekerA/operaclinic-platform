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
  adminSelectClassName,
  adminTextareaClassName,
} from "@/components/platform/platform-admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { UpsellCard } from "@/components/plan/upsell-card";
import { useSession } from "@/hooks/use-session";
import { toErrorMessage } from "@/lib/client/http";
import {
  ConsultationTypeResponse,
  createProcedureProtocol,
  listConsultationTypes,
  listProcedureProtocols,
  ProcedureProtocolResponse,
  updateProcedureProtocol,
} from "@/lib/client/clinic-structure-api";
import { getPlanUpsellInfo, PlanUpsellInfo } from "@/lib/client/plan-entitlements-api";
import { formatDateTime } from "@/lib/formatters";

interface ProtocolFormState {
  consultationTypeId: string;
  name: string;
  description: string;
  totalSessions: number;
  intervalBetweenSessionsDays: number;
  isActive: boolean;
}

const defaultForm: ProtocolFormState = {
  consultationTypeId: "",
  name: "",
  description: "",
  totalSessions: 4,
  intervalBetweenSessionsDays: 7,
  isActive: true,
};

export default function ClinicProtocolsPage() {
  const { user } = useSession({ expectedProfile: "clinic" });
  const canManage = useMemo(() => {
    if (!user) return false;
    return user.roles.includes("TENANT_ADMIN") || user.roles.includes("CLINIC_MANAGER");
  }, [user]);

  const [protocols, setProtocols] = useState<ProcedureProtocolResponse[]>([]);
  const [consultationTypes, setConsultationTypes] = useState<ConsultationTypeResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [upsellInfo, setUpsellInfo] = useState<PlanUpsellInfo | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [createForm, setCreateForm] = useState<ProtocolFormState>(defaultForm);
  const [isCreating, setIsCreating] = useState(false);

  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProtocolFormState | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const selectedProtocol = useMemo(
    () => protocols.find((p) => p.id === selectedProtocolId) ?? null,
    [selectedProtocolId, protocols],
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setUpsellInfo(null);
    try {
      const [nextProtocols, nextTypes] = await Promise.all([
        listProcedureProtocols(),
        listConsultationTypes(),
      ]);
      setProtocols(nextProtocols);
      setConsultationTypes(nextTypes);
      setSelectedProtocolId((current) => {
        if (current && nextProtocols.some((p) => p.id === current)) return current;
        return nextProtocols[0]?.id ?? null;
      });
    } catch (requestError) {
      const upsell = getPlanUpsellInfo(requestError);
      if (upsell) {
        setUpsellInfo(upsell);
      } else {
        setError(toErrorMessage(requestError, "Não foi possível carregar protocolos."));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedProtocol) {
      setEditForm(null);
      return;
    }
    setEditForm({
      consultationTypeId: selectedProtocol.consultationTypeId,
      name: selectedProtocol.name,
      description: selectedProtocol.description ?? "",
      totalSessions: selectedProtocol.totalSessions,
      intervalBetweenSessionsDays: selectedProtocol.intervalBetweenSessionsDays,
      isActive: selectedProtocol.isActive,
    });
  }, [selectedProtocol]);

  const metrics = useMemo(() => {
    const activeCount = protocols.filter((p) => p.isActive).length;
    const avgSessions =
      protocols.length > 0
        ? Math.round(protocols.reduce((sum, p) => sum + p.totalSessions, 0) / protocols.length)
        : 0;

    return [
      {
        label: "Protocolos",
        value: String(protocols.length),
        helper: "Protocolos de tratamento cadastrados.",
      },
      {
        label: "Ativos",
        value: String(activeCount),
        helper: "Disponíveis para inscrição de pacientes.",
        tone: "accent" as const,
      },
      {
        label: "Inativos",
        value: String(protocols.length - activeCount),
        helper: "Fora de uso no momento.",
      },
      {
        label: "Média de sessões",
        value: avgSessions > 0 ? String(avgSessions) : "—",
        helper: "Sessões por protocolo em média.",
      },
    ];
  }, [protocols]);

  const shortcutItems = useMemo(
    () => [
      {
        label: "Novo protocolo",
        description: "Ir para o formulário de cadastro.",
        href: "#novo-protocolo",
      },
      {
        label: "Procedimentos estéticos",
        description: "Gerenciar tipos de procedimento.",
        href: "/clinic/consultation-types",
      },
      {
        label: "Pacientes",
        description: "Inscrever pacientes em protocolos.",
        href: "/clinic/patients",
      },
    ],
    [],
  );

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canManage) return;
    setIsCreating(true);
    setError(null);
    setUpsellInfo(null);
    setSuccess(null);
    try {
      await createProcedureProtocol({
        consultationTypeId: createForm.consultationTypeId,
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        totalSessions: createForm.totalSessions,
        intervalBetweenSessionsDays: createForm.intervalBetweenSessionsDays,
        isActive: createForm.isActive,
      });
      setCreateForm(defaultForm);
      setSuccess("Protocolo criado com sucesso.");
      await loadData();
    } catch (requestError) {
      const upsell = getPlanUpsellInfo(requestError);
      if (upsell) {
        setUpsellInfo(upsell);
      } else {
        setError(toErrorMessage(requestError, "Falha ao criar protocolo."));
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canManage || !selectedProtocol || !editForm) return;
    setIsUpdating(true);
    setError(null);
    setUpsellInfo(null);
    setSuccess(null);
    try {
      const updated = await updateProcedureProtocol(selectedProtocol.id, {
        consultationTypeId: editForm.consultationTypeId,
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        totalSessions: editForm.totalSessions,
        intervalBetweenSessionsDays: editForm.intervalBetweenSessionsDays,
        isActive: editForm.isActive,
      });
      setProtocols((current) => current.map((p) => (p.id === updated.id ? updated : p)));
      setSuccess("Protocolo atualizado.");
    } catch (requestError) {
      const upsell = getPlanUpsellInfo(requestError);
      if (upsell) {
        setUpsellInfo(upsell);
      } else {
        setError(toErrorMessage(requestError, "Falha ao atualizar protocolo."));
      }
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clínica | Protocolos"
        title="Protocolos de tratamento"
        description="Configure protocolos multi-sessão para procedimentos estéticos e inscreva pacientes diretamente pelo cadastro."
        actions={
          <Button
            type="button"
            className="border border-slate-200 bg-white text-ink hover:bg-slate-50"
            onClick={() => void loadData()}
            disabled={isLoading}
          >
            {isLoading ? "Atualizando..." : "Atualizar protocolos"}
          </Button>
        }
      >
        <AdminMetricGrid items={metrics} isLoading={isLoading && protocols.length === 0} />
        <AdminShortcutPanel title="Ações rápidas" items={shortcutItems} />
      </AdminPageHeader>

      {!canManage ? (
        <Card className="border-amber-200 bg-amber-50" role="alert">
          <p className="text-sm text-amber-700">
            Apenas admin e gestor da clínica podem criar ou editar protocolos.
          </p>
        </Card>
      ) : null}

      {upsellInfo ? (
        <UpsellCard info={upsellInfo} />
      ) : error ? (
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
            title="Protocolos cadastrados"
            description="Cada protocolo define o número de sessões, intervalo e procedimento associado."
            actions={<AdminCountBadge value={protocols.length} loading={isLoading} />}
          />

          <div className="space-y-3">
            {isLoading && protocols.length === 0 ? (
              Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="animate-pulse rounded-[24px] border border-slate-200 bg-white p-4"
                >
                  <div className="h-4 w-48 rounded-full bg-slate-200" />
                  <div className="mt-3 h-3 w-32 rounded-full bg-slate-100" />
                  <div className="mt-4 h-3 w-56 rounded-full bg-slate-100" />
                </div>
              ))
            ) : protocols.length > 0 ? (
              protocols.map((protocol) => {
                const isSelected = selectedProtocolId === protocol.id;

                return (
                  <button
                    key={protocol.id}
                    type="button"
                    onClick={() => setSelectedProtocolId(protocol.id)}
                    className={`w-full rounded-[24px] border p-4 text-left transition ${
                      isSelected
                        ? "border-teal-300 bg-teal-50 shadow-sm"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-ink">{protocol.name}</p>
                          <StatusPill
                            label={protocol.isActive ? "Ativo" : "Inativo"}
                            tone={protocol.isActive ? "success" : "warning"}
                          />
                        </div>
                        <p className="text-sm text-muted">
                          {protocol.consultationTypeName} &middot;{" "}
                          {protocol.totalSessions} sessões &middot; intervalo de{" "}
                          {protocol.intervalBetweenSessionsDays} dia
                          {protocol.intervalBetweenSessionsDays !== 1 ? "s" : ""}
                        </p>
                        {protocol.description?.trim() ? (
                          <p className="text-sm text-muted">{protocol.description}</p>
                        ) : null}
                      </div>
                      <div className="space-y-2 text-sm text-muted lg:text-right">
                        <p>Atualizado em {formatDateTime(protocol.updatedAt)}</p>
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
                title="Nenhum protocolo cadastrado"
                description="Crie protocolos de tratamento para organizar sessões múltiplas por paciente."
                action={
                  canManage ? (
                    <Button
                      type="button"
                      className="bg-slate-950 text-white hover:bg-slate-800"
                      onClick={() => {
                        document
                          .getElementById("novo-protocolo")
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

        <Card id="novo-protocolo" className="space-y-4 scroll-mt-24">
          <AdminSectionHeader
            eyebrow="Cadastro"
            title="Novo protocolo"
            description="Defina o procedimento, número de sessões e intervalo entre elas."
            actions={
              <StatusPill
                label={canManage ? "Edição liberada" : "Somente leitura"}
                tone={canManage ? "success" : "warning"}
              />
            }
          />

          <form className="space-y-4" onSubmit={(event) => void handleCreate(event)}>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Procedimento estético
              </label>
              <select
                value={createForm.consultationTypeId}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    consultationTypeId: event.target.value,
                  }))
                }
                className={adminSelectClassName}
                required
                disabled={!canManage}
              >
                <option value="">Selecionar procedimento...</option>
                {consultationTypes.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Nome do protocolo
              </label>
              <input
                type="text"
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Ex: Protocolo Peeling Químico 4 sessões"
                className={adminInputClassName}
                required
                disabled={!canManage}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Sessões totais
                </label>
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={createForm.totalSessions}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      totalSessions: Number(event.target.value),
                    }))
                  }
                  className={adminInputClassName}
                  required
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Intervalo (dias)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={createForm.intervalBetweenSessionsDays}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      intervalBetweenSessionsDays: Number(event.target.value),
                    }))
                  }
                  className={adminInputClassName}
                  required
                  disabled={!canManage}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Descrição (opcional)
              </label>
              <textarea
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={3}
                placeholder="Orientações gerais do protocolo para a equipe."
                className={adminTextareaClassName}
                disabled={!canManage}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={createForm.isActive}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, isActive: event.target.checked }))
                }
                disabled={!canManage}
              />
              Protocolo ativo
            </label>

            <Button type="submit" className="w-full" disabled={!canManage || isCreating}>
              {isCreating ? "Criando..." : "Criar protocolo"}
            </Button>
          </form>
        </Card>
      </section>

      <Sheet
        open={selectedProtocolId !== null}
        onClose={() => setSelectedProtocolId(null)}
        title="Ficha do protocolo"
        description={selectedProtocol?.name}
      >
        {editForm && selectedProtocol ? (
          <div className="space-y-6">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  label={selectedProtocol.isActive ? "Ativo" : "Inativo"}
                  tone={selectedProtocol.isActive ? "success" : "warning"}
                />
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink">
                  {selectedProtocol.totalSessions} sessões
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink">
                  a cada {selectedProtocol.intervalBetweenSessionsDays} dia
                  {selectedProtocol.intervalBetweenSessionsDays !== 1 ? "s" : ""}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">
                {selectedProtocol.consultationTypeName}
              </p>
              <p className="mt-1 text-sm text-muted">
                Atualizado em {formatDateTime(selectedProtocol.updatedAt)}
              </p>
            </div>

            <form className="space-y-4" onSubmit={(event) => void handleUpdate(event)}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Dados do protocolo
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Procedimento estético
                </label>
                <select
                  value={editForm.consultationTypeId}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, consultationTypeId: event.target.value } : current,
                    )
                  }
                  className={adminSelectClassName}
                  required
                  disabled={!canManage}
                >
                  {consultationTypes.map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.name}
                    </option>
                  ))}
                </select>
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Sessões totais
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={editForm.totalSessions}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? { ...current, totalSessions: Number(event.target.value) }
                          : current,
                      )
                    }
                    className={adminInputClassName}
                    required
                    disabled={!canManage}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Intervalo (dias)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={editForm.intervalBetweenSessionsDays}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              intervalBetweenSessionsDays: Number(event.target.value),
                            }
                          : current,
                      )
                    }
                    className={adminInputClassName}
                    required
                    disabled={!canManage}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Descrição
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
                Protocolo ativo
              </label>

              <Button type="submit" className="w-full" disabled={!canManage || isUpdating}>
                {isUpdating ? "Salvando..." : "Salvar alterações"}
              </Button>
            </form>
          </div>
        ) : (
          <AdminEmptyState
            title="Selecione um protocolo"
            description="Abra um item da lista para editar os dados do protocolo."
          />
        )}
      </Sheet>
    </div>
  );
}
