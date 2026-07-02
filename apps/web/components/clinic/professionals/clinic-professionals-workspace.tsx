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
} from "@/components/platform/platform-admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { useSession } from "@/hooks/use-session";
import {
  createProfessional,
  createSchedule,
  createScheduleBlock,
  listProfessionals,
  listScheduleBlocks,
  listSchedules,
  listSpecialties,
  listUnits,
  ProfessionalResponse,
  ScheduleBlockResponse,
  ScheduleDayOfWeek,
  ScheduleResponse,
  SpecialtyResponse,
  UnitResponse,
  updateProfessional,
  updateSchedule,
  updateScheduleBlock,
} from "@/lib/client/clinic-structure-api";
import { toErrorMessage } from "@/lib/client/http";
import { formatDateTime, getUserStatusLabel } from "@/lib/formatters";

// ── Constants ────────────────────────────────────────────────────────────────

const DAY_ORDER: ScheduleDayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

const DAY_LABELS: Record<ScheduleDayOfWeek, string> = {
  MONDAY: "Segunda-feira",
  TUESDAY: "Terça-feira",
  WEDNESDAY: "Quarta-feira",
  THURSDAY: "Quinta-feira",
  FRIDAY: "Sexta-feira",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo",
};

const SLOT_INTERVALS = [
  { label: "10 min", value: 10 },
  { label: "15 min", value: 15 },
  { label: "20 min", value: 20 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "60 min", value: 60 },
];

type SheetTab = "dados" | "horarios" | "bloqueios";

// ── Professional form ─────────────────────────────────────────────────────────

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
  if (checked) return [...new Set([...list, value])];
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
    specialtyIds: professional.specialties.map((s) => s.id),
    unitIds: professional.units.map((u) => u.id),
  };
}

function formatProfessionalCredential(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "Credencial não informada";
  return `Credencial ${normalized}`;
}

// ── Schedule form ─────────────────────────────────────────────────────────────

interface ScheduleFormState {
  dayOfWeek: ScheduleDayOfWeek;
  startTime: string;
  endTime: string;
  slotIntervalMinutes: number;
  unitId: string;
  isActive: boolean;
}

const defaultScheduleForm: ScheduleFormState = {
  dayOfWeek: "MONDAY",
  startTime: "08:00",
  endTime: "18:00",
  slotIntervalMinutes: 15,
  unitId: "",
  isActive: true,
};

// ── Schedule block form ───────────────────────────────────────────────────────

interface BlockFormState {
  startsAt: string;
  endsAt: string;
  reason: string;
  room: string;
  unitId: string;
  isActive: boolean;
}

const defaultBlockForm: BlockFormState = {
  startsAt: "",
  endsAt: "",
  reason: "",
  room: "",
  unitId: "",
  isActive: true,
};

function toIsoInstant(localDatetime: string): string {
  return new Date(localDatetime).toISOString();
}

function formatBlockDatetime(isoString: string): string {
  return new Date(isoString).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClinicProfessionalsWorkspace() {
  const { user } = useSession({ expectedProfile: "clinic" });
  const canManage = useMemo(
    () =>
      Boolean(
        user?.roles.includes("TENANT_ADMIN") || user?.roles.includes("CLINIC_MANAGER"),
      ),
    [user],
  );

  // Core data
  const [professionals, setProfessionals] = useState<ProfessionalResponse[]>([]);
  const [units, setUnits] = useState<UnitResponse[]>([]);
  const [specialties, setSpecialties] = useState<SpecialtyResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Create form
  const [createForm, setCreateForm] = useState<ProfessionalFormState>(defaultProfessionalForm);
  const [isCreating, setIsCreating] = useState(false);

  // Selection + edit
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProfessionalFormState | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Sheet tab
  const [sheetTab, setSheetTab] = useState<SheetTab>("dados");

  // Schedules state
  const [schedules, setSchedules] = useState<ScheduleResponse[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(defaultScheduleForm);
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);

  // Schedule blocks state
  const [blocks, setBlocks] = useState<ScheduleBlockResponse[]>([]);
  const [isLoadingBlocks, setIsLoadingBlocks] = useState(false);
  const [blockForm, setBlockForm] = useState<BlockFormState>(defaultBlockForm);
  const [isCreatingBlock, setIsCreatingBlock] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [blockSuccess, setBlockSuccess] = useState<string | null>(null);

  const selectedProfessional = useMemo(
    () => professionals.find((p) => p.id === selectedProfessionalId) ?? null,
    [professionals, selectedProfessionalId],
  );

  // ── Loaders ──────────────────────────────────────────────────────────────

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
        current && nextProfessionals.some((p) => p.id === current)
          ? current
          : (nextProfessionals[0]?.id ?? null),
      );
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Não foi possível carregar profissionais."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadSchedules = useCallback(async (professionalId: string) => {
    setIsLoadingSchedules(true);
    setScheduleError(null);

    try {
      const data = await listSchedules(professionalId);
      setSchedules(data);
    } catch (requestError) {
      setScheduleError(toErrorMessage(requestError, "Não foi possível carregar horários."));
    } finally {
      setIsLoadingSchedules(false);
    }
  }, []);

  const loadBlocks = useCallback(async (professionalId: string) => {
    setIsLoadingBlocks(true);
    setBlockError(null);

    try {
      const data = await listScheduleBlocks(professionalId);
      setBlocks(data);
    } catch (requestError) {
      setBlockError(toErrorMessage(requestError, "Não foi possível carregar bloqueios."));
    } finally {
      setIsLoadingBlocks(false);
    }
  }, []);

  // ── Effects ───────────────────────────────────────────────────────────────

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

  // Reset tab when professional changes
  useEffect(() => {
    setSheetTab("dados");
    setSchedules([]);
    setBlocks([]);
    setScheduleError(null);
    setScheduleSuccess(null);
    setBlockError(null);
    setBlockSuccess(null);
  }, [selectedProfessionalId]);

  // Load tab data on demand
  useEffect(() => {
    if (!selectedProfessionalId) return;

    if (sheetTab === "horarios") {
      void loadSchedules(selectedProfessionalId);
    } else if (sheetTab === "bloqueios") {
      void loadBlocks(selectedProfessionalId);
    }
  }, [sheetTab, selectedProfessionalId, loadSchedules, loadBlocks]);

  // ── Metrics ───────────────────────────────────────────────────────────────

  const professionalMetrics = useMemo(() => {
    const activeCount = professionals.filter((p) => p.isActive).length;
    const loginReadyCount = professionals.filter((p) => p.linkedUser).length;
    const selfBookingCount = professionals.filter((p) => p.visibleForSelfBooking).length;

    return [
      { label: "Profissionais", value: String(professionals.length), helper: "Equipe cadastrada na clínica." },
      { label: "Ativos", value: String(activeCount), helper: "Aptos para agenda e operação.", tone: "accent" as const },
      { label: "Login pronto", value: String(loginReadyCount), helper: "Com acesso já vinculado." },
      { label: "Autoagendamento", value: String(selfBookingCount), helper: "Visíveis para agendamento próprio." },
    ];
  }, [professionals]);

  const shortcutItems = useMemo(
    () => [
      { label: "Novo profissional", description: "Ir direto ao cadastro da equipe.", href: "#novo-profissional" },
      { label: "Usuários", description: "Cruzar acessos e vínculos.", href: "/clinic/users" },
      { label: "Recepção", description: "Voltar para agenda e fila do dia.", href: "/clinic/reception" },
    ],
    [],
  );

  // ── Handlers — Professional ───────────────────────────────────────────────

  async function handleCreateProfessional(event: FormEvent<HTMLFormElement>): Promise<void> {
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

  async function handleUpdateProfessional(event: FormEvent<HTMLFormElement>): Promise<void> {
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

  // ── Handlers — Schedules ──────────────────────────────────────────────────

  async function handleCreateSchedule(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canManage || !selectedProfessionalId) return;

    setIsCreatingSchedule(true);
    setScheduleError(null);
    setScheduleSuccess(null);

    try {
      await createSchedule({
        professionalId: selectedProfessionalId,
        dayOfWeek: scheduleForm.dayOfWeek,
        startTime: scheduleForm.startTime,
        endTime: scheduleForm.endTime,
        slotIntervalMinutes: scheduleForm.slotIntervalMinutes,
        unitId: scheduleForm.unitId || undefined,
        isActive: scheduleForm.isActive,
      });

      setScheduleForm(defaultScheduleForm);
      setScheduleSuccess("Horário criado com sucesso.");
      await loadSchedules(selectedProfessionalId);
    } catch (requestError) {
      setScheduleError(toErrorMessage(requestError, "Falha ao criar horário."));
    } finally {
      setIsCreatingSchedule(false);
    }
  }

  async function handleToggleSchedule(schedule: ScheduleResponse): Promise<void> {
    if (!canManage) return;

    setScheduleError(null);
    setScheduleSuccess(null);

    try {
      await updateSchedule(schedule.id, { isActive: !schedule.isActive });
      setScheduleSuccess(schedule.isActive ? "Horário desativado." : "Horário reativado.");
      if (selectedProfessionalId) await loadSchedules(selectedProfessionalId);
    } catch (requestError) {
      setScheduleError(toErrorMessage(requestError, "Falha ao atualizar horário."));
    }
  }

  // ── Handlers — Blocks ─────────────────────────────────────────────────────

  async function handleCreateBlock(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canManage || !selectedProfessionalId) return;

    setIsCreatingBlock(true);
    setBlockError(null);
    setBlockSuccess(null);

    try {
      await createScheduleBlock({
        professionalId: selectedProfessionalId,
        startsAt: toIsoInstant(blockForm.startsAt),
        endsAt: toIsoInstant(blockForm.endsAt),
        reason: blockForm.reason.trim() || undefined,
        room: blockForm.room.trim() || undefined,
        unitId: blockForm.unitId || undefined,
        isActive: blockForm.isActive,
      });

      setBlockForm(defaultBlockForm);
      setBlockSuccess("Bloqueio criado com sucesso.");
      await loadBlocks(selectedProfessionalId);
    } catch (requestError) {
      setBlockError(toErrorMessage(requestError, "Falha ao criar bloqueio."));
    } finally {
      setIsCreatingBlock(false);
    }
  }

  async function handleToggleBlock(block: ScheduleBlockResponse): Promise<void> {
    if (!canManage) return;

    setBlockError(null);
    setBlockSuccess(null);

    try {
      await updateScheduleBlock(block.id, { isActive: !block.isActive });
      setBlockSuccess(block.isActive ? "Bloqueio desativado." : "Bloqueio reativado.");
      if (selectedProfessionalId) await loadBlocks(selectedProfessionalId);
    } catch (requestError) {
      setBlockError(toErrorMessage(requestError, "Falha ao atualizar bloqueio."));
    }
  }

  // ── Sheet tab: Dados ──────────────────────────────────────────────────────

  function renderDadosTab() {
    if (!editForm || !selectedProfessional) return null;

    return (
      <div className="space-y-6">
        <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              label={selectedProfessional.isActive ? "Ativo" : "Inativo"}
              tone={selectedProfessional.isActive ? "success" : "warning"}
            />
            <StatusPill
              label={selectedProfessional.linkedUser ? "Login pronto" : "Sem login vinculado"}
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

        <form className="space-y-4" onSubmit={(e) => void handleUpdateProfessional(e)}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Dados principais
          </p>

          <input
            className={adminInputClassName}
            value={editForm.fullName}
            onChange={(e) =>
              setEditForm((cur) => (cur ? { ...cur, fullName: e.target.value } : cur))
            }
            placeholder="Nome completo"
            required
            disabled={!canManage}
          />
          <input
            className={adminInputClassName}
            value={editForm.displayName}
            onChange={(e) =>
              setEditForm((cur) => (cur ? { ...cur, displayName: e.target.value } : cur))
            }
            placeholder="Nome de exibição"
            required
            disabled={!canManage}
          />
          <input
            className={adminInputClassName}
            value={editForm.professionalRegister}
            onChange={(e) =>
              setEditForm((cur) =>
                cur ? { ...cur, professionalRegister: e.target.value } : cur,
              )
            }
            placeholder="Ex.: ESTETICA-RESP-001"
            required
            disabled={!canManage}
          />

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Especialidades
            </p>
            <div className="max-h-32 space-y-2 overflow-y-auto rounded-[20px] border border-slate-200 bg-white p-3">
              {specialties.length > 0 ? (
                specialties.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={editForm.specialtyIds.includes(s.id)}
                      onChange={(e) =>
                        setEditForm((cur) =>
                          cur
                            ? {
                                ...cur,
                                specialtyIds: toggleSelection(
                                  cur.specialtyIds,
                                  s.id,
                                  e.target.checked,
                                ),
                              }
                            : cur,
                        )
                      }
                      disabled={!canManage}
                    />
                    {s.name}
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
                units.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={editForm.unitIds.includes(u.id)}
                      onChange={(e) =>
                        setEditForm((cur) =>
                          cur
                            ? {
                                ...cur,
                                unitIds: toggleSelection(cur.unitIds, u.id, e.target.checked),
                              }
                            : cur,
                        )
                      }
                      disabled={!canManage}
                    />
                    {u.name}
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
              onChange={(e) =>
                setEditForm((cur) =>
                  cur ? { ...cur, visibleForSelfBooking: e.target.checked } : cur,
                )
              }
              disabled={!canManage}
            />
            Visível para autoagendamento
          </label>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={editForm.isActive}
              onChange={(e) =>
                setEditForm((cur) => (cur ? { ...cur, isActive: e.target.checked } : cur))
              }
              disabled={!canManage}
            />
            Profissional ativo
          </label>

          <Button type="submit" className="w-full" disabled={!canManage || isUpdating}>
            {isUpdating ? "Salvando..." : "Salvar alterações"}
          </Button>
        </form>

        <Card className="space-y-3 bg-white">
          <AdminSectionHeader
            eyebrow="Acesso"
            title="Login do profissional"
            description="Mostra se este profissional já consegue entrar com o próprio acesso."
          />
          {selectedProfessional.linkedUser ? (
            <>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm">
                <p className="font-semibold text-ink">{selectedProfessional.linkedUser.email}</p>
                <p className="mt-1 text-muted">{selectedProfessional.linkedUser.fullName}</p>
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
              Este profissional ainda não tem acesso vinculado. Os próximos cadastros já devem
              nascer com login pronto.
            </p>
          )}
        </Card>
      </div>
    );
  }

  // ── Sheet tab: Horários ───────────────────────────────────────────────────

  function renderHorariosTab() {
    const schedulesByDay = new Map<ScheduleDayOfWeek, ScheduleResponse[]>();

    for (const s of schedules) {
      const list = schedulesByDay.get(s.dayOfWeek) ?? [];
      list.push(s);
      schedulesByDay.set(s.dayOfWeek, list);
    }

    return (
      <div className="space-y-5">
        {scheduleError ? (
          <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{scheduleError}</p>
          </div>
        ) : null}

        {scheduleSuccess ? (
          <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm text-emerald-700">{scheduleSuccess}</p>
          </div>
        ) : null}

        {/* Day-by-day grid */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Horários por dia da semana
          </p>

          {isLoadingSchedules ? (
            Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-[18px] border border-slate-200 bg-white px-4 py-3"
              >
                <div className="h-3 w-32 rounded-full bg-slate-200" />
                <div className="mt-2 h-3 w-48 rounded-full bg-slate-100" />
              </div>
            ))
          ) : (
            DAY_ORDER.map((day) => {
              const daySchedules = schedulesByDay.get(day) ?? [];

              return (
                <div
                  key={day}
                  className="rounded-[18px] border border-slate-200 bg-white px-4 py-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                    {DAY_LABELS[day]}
                  </p>

                  {daySchedules.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {daySchedules.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
                            <span className="font-semibold tabular-nums">
                              {s.startTime} – {s.endTime}
                            </span>
                            <span className="text-xs text-muted">
                              {s.slotIntervalMinutes} min
                            </span>
                            <StatusPill
                              label={s.isActive ? "Ativo" : "Inativo"}
                              tone={s.isActive ? "success" : "warning"}
                            />
                          </div>
                          {canManage ? (
                            <button
                              type="button"
                              onClick={() => void handleToggleSchedule(s)}
                              className="shrink-0 text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                            >
                              {s.isActive ? "Desativar" : "Reativar"}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted">Sem horário configurado.</p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Add schedule form */}
        {canManage ? (
          <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Adicionar horário
            </p>

            <form className="space-y-3" onSubmit={(e) => void handleCreateSchedule(e)}>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Dia da semana</label>
                  <select
                    className={adminSelectClassName}
                    value={scheduleForm.dayOfWeek}
                    onChange={(e) =>
                      setScheduleForm((cur) => ({
                        ...cur,
                        dayOfWeek: e.target.value as ScheduleDayOfWeek,
                      }))
                    }
                    required
                  >
                    {DAY_ORDER.map((day) => (
                      <option key={day} value={day}>
                        {DAY_LABELS[day]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Intervalo de slot</label>
                  <select
                    className={adminSelectClassName}
                    value={scheduleForm.slotIntervalMinutes}
                    onChange={(e) =>
                      setScheduleForm((cur) => ({
                        ...cur,
                        slotIntervalMinutes: Number(e.target.value),
                      }))
                    }
                  >
                    {SLOT_INTERVALS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Início</label>
                  <input
                    type="time"
                    className={adminInputClassName}
                    value={scheduleForm.startTime}
                    onChange={(e) =>
                      setScheduleForm((cur) => ({ ...cur, startTime: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Término</label>
                  <input
                    type="time"
                    className={adminInputClassName}
                    value={scheduleForm.endTime}
                    onChange={(e) =>
                      setScheduleForm((cur) => ({ ...cur, endTime: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>

              {units.length > 0 ? (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">
                    Unidade (opcional)
                  </label>
                  <select
                    className={adminSelectClassName}
                    value={scheduleForm.unitId}
                    onChange={(e) =>
                      setScheduleForm((cur) => ({ ...cur, unitId: e.target.value }))
                    }
                  >
                    <option value="">Todas as unidades</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={scheduleForm.isActive}
                  onChange={(e) =>
                    setScheduleForm((cur) => ({ ...cur, isActive: e.target.checked }))
                  }
                />
                Horário ativo
              </label>

              <Button
                type="submit"
                className="w-full"
                disabled={isCreatingSchedule}
              >
                {isCreatingSchedule ? "Salvando..." : "Adicionar horário"}
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    );
  }

  // ── Sheet tab: Bloqueios ──────────────────────────────────────────────────

  function renderBloqueiosTab() {
    return (
      <div className="space-y-5">
        {blockError ? (
          <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{blockError}</p>
          </div>
        ) : null}

        {blockSuccess ? (
          <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm text-emerald-700">{blockSuccess}</p>
          </div>
        ) : null}

        {/* Block list */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Bloqueios cadastrados
          </p>

          {isLoadingBlocks ? (
            Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-[18px] border border-slate-200 bg-white px-4 py-3"
              >
                <div className="h-3 w-40 rounded-full bg-slate-200" />
                <div className="mt-2 h-3 w-28 rounded-full bg-slate-100" />
              </div>
            ))
          ) : blocks.length === 0 ? (
            <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
              <p className="text-sm text-muted">Nenhum bloqueio cadastrado.</p>
            </div>
          ) : (
            blocks.map((block) => (
              <div
                key={block.id}
                className="rounded-[18px] border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-ink">
                      {formatBlockDatetime(block.startsAt)} →{" "}
                      {formatBlockDatetime(block.endsAt)}
                    </p>
                    {block.reason ? (
                      <p className="text-xs text-muted">{block.reason}</p>
                    ) : null}
                    {block.room ? (
                      <p className="text-xs text-muted">Sala: {block.room}</p>
                    ) : null}
                    <StatusPill
                      label={block.isActive ? "Ativo" : "Inativo"}
                      tone={block.isActive ? "warning" : "neutral"}
                    />
                  </div>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => void handleToggleBlock(block)}
                      className="shrink-0 text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                    >
                      {block.isActive ? "Desativar" : "Reativar"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add block form */}
        {canManage ? (
          <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Novo bloqueio
            </p>

            <form className="space-y-3" onSubmit={(e) => void handleCreateBlock(e)}>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Início</label>
                  <input
                    type="datetime-local"
                    className={adminInputClassName}
                    value={blockForm.startsAt}
                    onChange={(e) =>
                      setBlockForm((cur) => ({ ...cur, startsAt: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Término</label>
                  <input
                    type="datetime-local"
                    className={adminInputClassName}
                    value={blockForm.endsAt}
                    onChange={(e) =>
                      setBlockForm((cur) => ({ ...cur, endsAt: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted">Motivo (opcional)</label>
                <input
                  className={adminInputClassName}
                  value={blockForm.reason}
                  onChange={(e) =>
                    setBlockForm((cur) => ({ ...cur, reason: e.target.value }))
                  }
                  placeholder="Ex.: Almoço, Consultoria externa"
                  maxLength={255}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted">Sala (opcional)</label>
                <input
                  className={adminInputClassName}
                  value={blockForm.room}
                  onChange={(e) =>
                    setBlockForm((cur) => ({ ...cur, room: e.target.value }))
                  }
                  placeholder="Ex.: Sala 3"
                  maxLength={80}
                />
              </div>

              {units.length > 0 ? (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">
                    Unidade (opcional)
                  </label>
                  <select
                    className={adminSelectClassName}
                    value={blockForm.unitId}
                    onChange={(e) =>
                      setBlockForm((cur) => ({ ...cur, unitId: e.target.value }))
                    }
                  >
                    <option value="">Todas as unidades</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={blockForm.isActive}
                  onChange={(e) =>
                    setBlockForm((cur) => ({ ...cur, isActive: e.target.checked }))
                  }
                />
                Bloqueio ativo imediatamente
              </label>

              <Button
                type="submit"
                className="w-full"
                disabled={isCreatingBlock}
              >
                {isCreatingBlock ? "Salvando..." : "Criar bloqueio"}
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clínica | Profissionais"
        title="Profissionais"
        description="Equipe mais fácil de visualizar, com acesso, agenda e disponibilidade organizados na mesma superfície."
        actions={
          <Button
            type="button"
            className="border border-slate-200 bg-white text-ink hover:bg-slate-50"
            onClick={() => void loadData()}
            disabled={isLoading}
          >
            {isLoading ? "Atualizando..." : "Atualizar equipe"}
          </Button>
        }
      >
        <AdminMetricGrid
          items={professionalMetrics}
          isLoading={isLoading && professionals.length === 0}
        />
        <AdminShortcutPanel title="Ações rápidas" items={shortcutItems} />
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
        {/* Professional list */}
        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Equipe"
            title="Profissionais cadastrados"
            description="Abrir ficha, validar acesso e revisar vínculos sem depender de tabela fixa."
            actions={<AdminCountBadge value={professionals.length} loading={isLoading} />}
          />

          <div className="space-y-3">
            {isLoading && professionals.length === 0 ? (
              Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-[24px] border border-slate-200 bg-white p-4"
                >
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
                            tone={professional.visibleForSelfBooking ? "success" : "neutral"}
                          />
                        </div>
                        <p className="text-sm text-muted">{professional.fullName}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted">
                          <span>
                            {formatProfessionalCredential(professional.professionalRegister)}
                          </span>
                          <span>{professional.specialties.length} especialidades</span>
                          <span>{professional.units.length} unidades</span>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm text-muted lg:text-right">
                        <StatusPill
                          label={professional.linkedUser ? "Login pronto" : "Sem login"}
                          tone={professional.linkedUser ? "success" : "warning"}
                        />
                        <p>
                          {professional.linkedUser?.email ??
                            "Cadastro sem acesso vinculado"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <AdminEmptyState
                title="Nenhum profissional cadastrado"
                description="Cadastre a equipe para habilitar agenda, vínculos e acesso clínico."
                action={
                  canManage ? (
                    <Button
                      type="button"
                      className="bg-slate-950 text-white hover:bg-slate-800"
                      onClick={() =>
                        document
                          .getElementById("novo-profissional")
                          ?.scrollIntoView({ behavior: "smooth" })
                      }
                    >
                      Ir para cadastro
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        </Card>

        {/* Create form */}
        <Card id="novo-profissional" className="space-y-4 scroll-mt-24">
          <AdminSectionHeader
            eyebrow="Cadastro"
            title="Novo profissional"
            description="Crie o profissional e o acesso inicial no mesmo fluxo, sem telas paralelas."
            actions={
              <StatusPill
                label={canManage ? "Edição liberada" : "Somente leitura"}
                tone={canManage ? "success" : "warning"}
              />
            }
          />

          <form
            className="space-y-4"
            onSubmit={(e) => void handleCreateProfessional(e)}
          >
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Nome completo
              </label>
              <input
                className={adminInputClassName}
                value={createForm.fullName}
                onChange={(e) =>
                  setCreateForm((cur) => ({ ...cur, fullName: e.target.value }))
                }
                required
                disabled={!canManage}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Nome de exibição
              </label>
              <input
                className={adminInputClassName}
                value={createForm.displayName}
                onChange={(e) =>
                  setCreateForm((cur) => ({ ...cur, displayName: e.target.value }))
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
                onChange={(e) =>
                  setCreateForm((cur) => ({ ...cur, professionalRegister: e.target.value }))
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
                  onChange={(e) =>
                    setCreateForm((cur) => ({ ...cur, accessEmail: e.target.value }))
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
                  onChange={(e) =>
                    setCreateForm((cur) => ({ ...cur, accessPassword: e.target.value }))
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
                  specialties.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={createForm.specialtyIds.includes(s.id)}
                        onChange={(e) =>
                          setCreateForm((cur) => ({
                            ...cur,
                            specialtyIds: toggleSelection(
                              cur.specialtyIds,
                              s.id,
                              e.target.checked,
                            ),
                          }))
                        }
                        disabled={!canManage}
                      />
                      {s.name}
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
                  units.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={createForm.unitIds.includes(u.id)}
                        onChange={(e) =>
                          setCreateForm((cur) => ({
                            ...cur,
                            unitIds: toggleSelection(cur.unitIds, u.id, e.target.checked),
                          }))
                        }
                        disabled={!canManage}
                      />
                      {u.name}
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
                onChange={(e) =>
                  setCreateForm((cur) => ({
                    ...cur,
                    visibleForSelfBooking: e.target.checked,
                  }))
                }
                disabled={!canManage}
              />
              Visível para autoagendamento
            </label>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={createForm.isActive}
                onChange={(e) =>
                  setCreateForm((cur) => ({ ...cur, isActive: e.target.checked }))
                }
                disabled={!canManage}
              />
              Profissional ativo
            </label>

            <Button
              type="submit"
              className="w-full"
              disabled={!canManage || isCreating}
            >
              {isCreating ? "Criando..." : "Criar profissional"}
            </Button>
          </form>
        </Card>
      </section>

      {/* Sheet: professional detail with tabs */}
      <Sheet
        open={selectedProfessionalId !== null}
        onClose={() => setSelectedProfessionalId(null)}
        title="Ficha do profissional"
        description={selectedProfessional?.displayName}
      >
        {selectedProfessional ? (
          <div className="space-y-5">
            {/* Tab switcher */}
            <div className="flex gap-1 rounded-[16px] border border-slate-200 bg-slate-100/80 p-1">
              {(
                [
                  { key: "dados", label: "Dados" },
                  { key: "horarios", label: "Horários" },
                  { key: "bloqueios", label: "Bloqueios" },
                ] as { key: SheetTab; label: string }[]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSheetTab(key)}
                  className={`flex-1 rounded-[12px] px-3 py-1.5 text-xs font-semibold transition ${
                    sheetTab === key
                      ? "bg-white text-ink shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {sheetTab === "dados" && renderDadosTab()}
            {sheetTab === "horarios" && renderHorariosTab()}
            {sheetTab === "bloqueios" && renderBloqueiosTab()}
          </div>
        ) : (
          <AdminEmptyState
            title="Selecione um profissional"
            description="Abra uma ficha da lista para editar cadastro, vínculos e acesso."
          />
        )}
      </Sheet>
    </div>
  );
}
