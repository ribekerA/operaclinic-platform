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
  adminTextareaClassName,
} from "@/components/platform/platform-admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { useSession } from "@/hooks/use-session";
import { toErrorMessage } from "@/lib/client/http";
import {
  createPatient,
  listPatients,
  PatientContactInputPayload,
  PatientContactType,
  PatientSummaryResponse,
  updatePatient,
} from "@/lib/client/patients-api";
import { formatDateTime } from "@/lib/formatters";

interface PatientFormState {
  fullName: string;
  birthDate: string;
  documentNumber: string;
  notes: string;
  isActive: boolean;
  contactType: PatientContactType;
  contactValue: string;
}

const defaultCreateForm: PatientFormState = {
  fullName: "",
  birthDate: "",
  documentNumber: "",
  notes: "",
  isActive: true,
  contactType: "WHATSAPP",
  contactValue: "",
};

function resolvePrimaryContact(patient: PatientSummaryResponse): string {
  return (
    patient.contacts.find((contact) => contact.isPrimary)?.value ??
    patient.contacts[0]?.value ??
    "Sem contato"
  );
}

function buildContacts(form: PatientFormState): PatientContactInputPayload[] {
  const value = form.contactValue.trim();

  if (!value) {
    return [];
  }

  return [
    {
      type: form.contactType,
      value,
      isPrimary: true,
    },
  ];
}

function getPatientActiveProtocolCount(patient: PatientSummaryResponse): number {
  return patient.protocolInstances.filter((protocol) => protocol.status === "ACTIVE")
    .length;
}

function getPatientNextProtocolDate(
  patient: PatientSummaryResponse,
): string | null {
  const nextDates = patient.protocolInstances
    .map((protocol) => protocol.nextSessionDate)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));

  return nextDates[0] ?? null;
}

function getProtocolStatusTone(
  status: string,
): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "ACTIVE":
      return "neutral";
    case "COMPLETED":
      return "success";
    case "ABANDONED":
    case "CANCELED":
      return "warning";
    default:
      return "neutral";
  }
}

export default function ClinicPatientsPage() {
  const { user } = useSession({ expectedProfile: "clinic" });

  const canManage = useMemo(() => {
    if (!user) {
      return false;
    }

    return (
      user.roles.includes("TENANT_ADMIN") ||
      user.roles.includes("CLINIC_MANAGER") ||
      user.roles.includes("RECEPTION")
    );
  }, [user]);

  const [patients, setPatients] = useState<PatientSummaryResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [createForm, setCreateForm] = useState<PatientFormState>(defaultCreateForm);
  const [isCreating, setIsCreating] = useState(false);

  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PatientFormState | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) ?? null,
    [patients, selectedPatientId],
  );

  const loadPatients = useCallback(async (query?: string) => {
    setError(null);

    try {
      const items = await listPatients({
        search: query?.trim() || undefined,
        isActive: "true",
        limit: "100",
      });

      setPatients(items);
      setSelectedPatientId((current) => {
        if (current && items.some((item) => item.id === current)) {
          return current;
        }

        return items[0]?.id ?? null;
      });
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Nao foi possivel carregar pacientes."));
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    void loadPatients().finally(() => setIsLoading(false));
  }, [loadPatients]);

  useEffect(() => {
    if (!selectedPatient) {
      setEditForm(null);
      return;
    }

    setEditForm({
      fullName: selectedPatient.fullName ?? "",
      birthDate: selectedPatient.birthDate
        ? new Date(selectedPatient.birthDate).toISOString().slice(0, 10)
        : "",
      documentNumber: selectedPatient.documentNumber ?? "",
      notes: selectedPatient.notes ?? "",
      isActive: selectedPatient.isActive,
      contactType: selectedPatient.contacts[0]?.type ?? "WHATSAPP",
      contactValue: selectedPatient.contacts[0]?.value ?? "",
    });
  }, [selectedPatient]);

  const handleClearSearch = useCallback(async () => {
    setSearch("");
    setIsSearching(true);
    await loadPatients();
    setIsSearching(false);
  }, [loadPatients]);

  const patientMetrics = useMemo(() => {
    const withContactCount = patients.filter((patient) => patient.contacts.length > 0).length;
    const withNotesCount = patients.filter((patient) => Boolean(patient.notes?.trim())).length;
    const withActiveProtocolCount = patients.filter(
      (patient) => getPatientActiveProtocolCount(patient) > 0,
    ).length;

    return [
      {
        label: "Pacientes",
        value: String(patients.length),
        helper: "Base ativa carregada na clinica estetica.",
      },
      {
        label: "Com contato",
        value: String(withContactCount),
        helper: "Prontos para recepcao e retorno.",
        tone: "accent" as const,
      },
      {
        label: "Com observacoes",
        value: String(withNotesCount),
        helper: "Registros com contexto adicional.",
      },
      {
        label: "Em tratamento",
        value: String(withActiveProtocolCount),
        helper: "Pacientes com protocolo ativo em andamento.",
      },
      {
        label: "Busca atual",
        value: search.trim() ? "Filtrada" : "Completa",
        helper: search.trim() ? `Termo: ${search.trim()}` : "Sem filtro aplicado.",
      },
    ];
  }, [patients, search]);

  const shortcutItems = useMemo(() => {
    const items: Array<{
      label: string;
      description: string;
      href?: string;
      onClick?: () => void;
    }> = [
      {
        label: "Novo paciente",
        description: "Ir direto ao cadastro rapido.",
        href: "#novo-paciente",
      },
      {
        label: "Recepcao",
        description: "Voltar para agenda, fila e check-in.",
        href: "/clinic/reception",
      },
    ];

    if (search.trim()) {
      items.push({
        label: "Limpar busca",
        description: "Voltar para a base completa.",
        onClick: () => {
          void handleClearSearch();
        },
      });
    }

    return items;
  }, [handleClearSearch, search]);

  async function handleSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSearching(true);
    await loadPatients(search);
    setIsSearching(false);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    setError(null);
    setSuccess(null);
    setIsCreating(true);

    try {
      await createPatient({
        fullName: createForm.fullName.trim() || undefined,
        birthDate: createForm.birthDate || undefined,
        documentNumber: createForm.documentNumber.trim() || undefined,
        notes: createForm.notes.trim() || undefined,
        isActive: createForm.isActive,
        contacts: buildContacts(createForm),
      });

      setCreateForm(defaultCreateForm);
      setSuccess("Paciente cadastrado com sucesso.");
      await loadPatients(search);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao cadastrar paciente."));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canManage || !selectedPatient || !editForm) {
      return;
    }

    setError(null);
    setSuccess(null);
    setIsUpdating(true);

    try {
      const updated = await updatePatient(selectedPatient.id, {
        fullName: editForm.fullName.trim() || undefined,
        birthDate: editForm.birthDate || undefined,
        documentNumber: editForm.documentNumber.trim() || undefined,
        notes: editForm.notes.trim() || undefined,
        isActive: editForm.isActive,
        contacts: buildContacts(editForm),
      });

      setPatients((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSuccess("Paciente atualizado.");
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao atualizar paciente."));
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clinica | Pacientes"
        title="Pacientes"
        description="Base mais fluida para recepcao e equipe encontrarem rapido quem precisa ser atendido ou atualizado."
        actions={
          <Button
            type="button"
            className="border border-slate-200 bg-white text-ink hover:bg-slate-50"
            onClick={() => {
              void loadPatients(search);
            }}
            disabled={isLoading || isSearching}
          >
            {isLoading || isSearching ? "Atualizando..." : "Atualizar base"}
          </Button>
        }
      >
        <AdminMetricGrid items={patientMetrics} isLoading={isLoading && patients.length === 0} />
        <AdminShortcutPanel title="Acoes rapidas" items={shortcutItems} />
      </AdminPageHeader>

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

      <Card className="space-y-4">
        <AdminSectionHeader
          eyebrow="Busca"
          title="Encontre sem perder tempo"
          description="Use nome, documento ou telefone e limpe a busca sem recarregar a tela toda."
          actions={
            search.trim() ? (
              <Button
                type="button"
                className="border border-slate-200 bg-white text-ink hover:bg-slate-50"
                onClick={() => {
                  void handleClearSearch();
                }}
              >
                Limpar
              </Button>
            ) : undefined
          }
        />

        <form className="flex flex-col gap-3 lg:flex-row" onSubmit={(event) => void handleSearch(event)}>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, documento ou telefone"
            className={`flex-1 ${adminInputClassName}`}
          />
          <Button type="submit" disabled={isSearching}>
            {isSearching ? "Buscando..." : "Buscar paciente"}
          </Button>
        </form>
      </Card>

      <AdminFilterSummary
        items={search.trim() ? [`Busca: ${search.trim()}`] : []}
        onClear={
          search.trim()
            ? () => {
                void handleClearSearch();
              }
            : undefined
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Base"
            title="Pacientes encontrados"
            description="Lista direta para abrir ficha, ver contato e localizar o registro certo."
            actions={<AdminCountBadge value={patients.length} loading={isLoading} />}
          />

          <div className="space-y-3">
            {isLoading && patients.length === 0 ? (
              Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="animate-pulse rounded-[24px] border border-slate-200 bg-white p-4">
                  <div className="h-4 w-40 rounded-full bg-slate-200" />
                  <div className="mt-3 h-3 w-28 rounded-full bg-slate-100" />
                  <div className="mt-4 h-3 w-52 rounded-full bg-slate-100" />
                </div>
              ))
            ) : patients.length > 0 ? (
              patients.map((patient) => {
                const isSelected = selectedPatientId === patient.id;
                const activeProtocolCount = getPatientActiveProtocolCount(patient);
                const nextProtocolDate = getPatientNextProtocolDate(patient);

                return (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => setSelectedPatientId(patient.id)}
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
                            {patient.fullName ?? "Paciente sem nome"}
                          </p>
                          <StatusPill
                            label={patient.isActive ? "Ativo" : "Inativo"}
                            tone={patient.isActive ? "success" : "warning"}
                          />
                          {activeProtocolCount > 0 ? (
                            <StatusPill
                              label={`${activeProtocolCount} em tratamento`}
                              tone="neutral"
                            />
                          ) : null}
                        </div>
                        <p className="text-sm text-muted">{resolvePrimaryContact(patient)}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted">
                          <span>{patient.documentNumber ?? "Sem documento"}</span>
                          <span>{patient.notes?.trim() ? "Com observacoes" : "Sem observacoes"}</span>
                          {nextProtocolDate ? (
                            <span>Proxima sessao: {formatDateTime(nextProtocolDate)}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="space-y-2 text-sm text-muted lg:text-right">
                        <p>Atualizado em {formatDateTime(patient.updatedAt)}</p>
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
                title="Nenhum paciente encontrado"
                description="Ajuste a busca ou cadastre um novo paciente para continuar a operacao."
                action={
                  canManage ? (
                    <Button
                      type="button"
                      className="bg-slate-950 text-white hover:bg-slate-800"
                      onClick={() => {
                        document
                          .getElementById("novo-paciente")
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

        <Card id="novo-paciente" className="space-y-4 scroll-mt-24">
          <AdminSectionHeader
            eyebrow="Cadastro"
            title="Novo paciente"
            description="Cadastro curto, orientado para recepcao e agendamento."
            actions={
              <StatusPill
                label={canManage ? "Edicao liberada" : "Somente leitura"}
                tone={canManage ? "success" : "warning"}
              />
            }
          />

          <form className="space-y-4" onSubmit={(event) => void handleCreate(event)}>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Nome
              </label>
              <input
                type="text"
                value={createForm.fullName}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, fullName: event.target.value }))
                }
                className={adminInputClassName}
                disabled={!canManage}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Tipo contato
                </label>
                <select
                  value={createForm.contactType}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      contactType: event.target.value as PatientContactType,
                    }))
                  }
                  className={adminSelectClassName}
                  disabled={!canManage}
                >
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="PHONE">Telefone</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Contato
                </label>
                <input
                  type="text"
                  value={createForm.contactValue}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, contactValue: event.target.value }))
                  }
                  placeholder="(11) 99999-9999"
                  className={adminInputClassName}
                  disabled={!canManage}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Data nascimento
                </label>
                <input
                  type="date"
                  value={createForm.birthDate}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, birthDate: event.target.value }))
                  }
                  className={adminInputClassName}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Documento
                </label>
                <input
                  type="text"
                  value={createForm.documentNumber}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      documentNumber: event.target.value,
                    }))
                  }
                  className={adminInputClassName}
                  disabled={!canManage}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Observacoes
              </label>
              <textarea
                rows={4}
                value={createForm.notes}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, notes: event.target.value }))
                }
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
              Paciente ativo
            </label>

            <Button type="submit" className="w-full" disabled={!canManage || isCreating}>
              {isCreating ? "Salvando..." : "Cadastrar paciente"}
            </Button>
          </form>
        </Card>
      </section>

      <Sheet
        open={selectedPatientId !== null}
        onClose={() => setSelectedPatientId(null)}
        title="Ficha do paciente"
        description={selectedPatient?.fullName ?? "Paciente"}
      >
        {editForm && selectedPatient ? (
          <div className="space-y-6">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  label={selectedPatient.isActive ? "Ativo" : "Inativo"}
                  tone={selectedPatient.isActive ? "success" : "warning"}
                />
                <StatusPill
                  label={selectedPatient.documentNumber ? "Documento ok" : "Sem documento"}
                  tone={selectedPatient.documentNumber ? "neutral" : "warning"}
                />
              </div>
              <p className="mt-3 text-sm text-muted">
                Contato principal: {resolvePrimaryContact(selectedPatient)}
              </p>
              <p className="mt-1 text-sm text-muted">
                Atualizado em {formatDateTime(selectedPatient.updatedAt)}
              </p>
            </div>

            <div className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                    Tratamento estetico
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Veja protocolos ativos, progresso de sessoes e a proxima etapa prevista.
                  </p>
                </div>
                <AdminCountBadge
                  value={selectedPatient.protocolInstances.length}
                  loading={false}
                />
              </div>

              {selectedPatient.protocolInstances.length > 0 ? (
                <div className="space-y-3">
                  {selectedPatient.protocolInstances.map((protocol) => (
                    <div
                      key={protocol.id}
                      className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-ink">
                              {protocol.procedureProtocolName}
                            </p>
                            <StatusPill
                              label={protocol.status}
                              tone={getProtocolStatusTone(protocol.status)}
                            />
                          </div>
                          <p className="text-sm text-muted">
                            {protocol.consultationTypeName}
                          </p>
                          <div className="flex flex-wrap gap-3 text-xs text-muted">
                            <span>
                              {protocol.sessionsCompleted}/{protocol.sessionsPlanned} concluida(s)
                            </span>
                            <span>
                              {protocol.sessionsScheduled} sessao(oes) ja programada(s)
                            </span>
                            {protocol.nextSessionDate ? (
                              <span>
                                Proxima sessao: {formatDateTime(protocol.nextSessionDate)}
                              </span>
                            ) : null}
                            {protocol.expectedCompletionAt ? (
                              <span>
                                Previsao final: {formatDateTime(protocol.expectedCompletionAt)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="w-full max-w-[260px] space-y-2">
                          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                            <span>Progresso</span>
                            <span>
                              {protocol.sessionsPlanned > 0
                                ? Math.round(
                                    (protocol.sessionsCompleted / protocol.sessionsPlanned) *
                                      100,
                                  )
                                : 0}
                              %
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-200">
                            <div
                              className="h-2 rounded-full bg-teal-500 transition-[width]"
                              style={{
                                width: `${
                                  protocol.sessionsPlanned > 0
                                    ? Math.min(
                                        100,
                                        Math.round(
                                          (protocol.sessionsCompleted /
                                            protocol.sessionsPlanned) *
                                            100,
                                        ),
                                      )
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                          <p className="text-xs text-muted">
                            Atualizado em {formatDateTime(protocol.updatedAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <AdminEmptyState
                  title="Sem protocolo vinculado"
                  description="Esse paciente ainda nao possui plano de sessoes associado a um procedimento."
                />
              )}
            </div>

            <form className="space-y-4 pb-28" onSubmit={(event) => void handleUpdate(event)}>
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
                  value={editForm.fullName}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, fullName: event.target.value } : current,
                    )
                  }
                  className={adminInputClassName}
                  disabled={!canManage}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Tipo contato
                  </label>
                  <select
                    value={editForm.contactType}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              contactType: event.target.value as PatientContactType,
                            }
                          : current,
                      )
                    }
                    className={adminSelectClassName}
                    disabled={!canManage}
                  >
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="PHONE">Telefone</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Contato
                  </label>
                  <input
                    type="text"
                    value={editForm.contactValue}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current ? { ...current, contactValue: event.target.value } : current,
                      )
                    }
                    className={adminInputClassName}
                    disabled={!canManage}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Data nascimento
                  </label>
                  <input
                    type="date"
                    value={editForm.birthDate}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current ? { ...current, birthDate: event.target.value } : current,
                      )
                    }
                    className={adminInputClassName}
                    disabled={!canManage}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Documento
                  </label>
                  <input
                    type="text"
                    value={editForm.documentNumber}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current ? { ...current, documentNumber: event.target.value } : current,
                      )
                    }
                    className={adminInputClassName}
                    disabled={!canManage}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Observacoes
                </label>
                <textarea
                  rows={4}
                  value={editForm.notes}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, notes: event.target.value } : current,
                    )
                  }
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
                Paciente ativo
              </label>

              <div className="sticky bottom-0 -mx-6 border-t border-slate-200 bg-white/95 px-6 pb-1 pt-4 backdrop-blur">
                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    onClick={() => setSelectedPatientId(null)}
                    className="border border-border bg-white text-ink hover:bg-accentSoft"
                  >
                    Fechar
                  </Button>
                  <Button type="submit" disabled={!canManage || isUpdating}>
                    {isUpdating ? "Salvando..." : "Salvar alteracoes"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        ) : (
          <AdminEmptyState
            title="Selecione um paciente"
            description="Abra um registro da lista para editar os dados principais."
          />
        )}
      </Sheet>
    </div>
  );
}
