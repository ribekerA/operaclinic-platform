"use client";

import type {
  ReceptionAgendaAppointment,
  ReceptionAppointmentDetail,
  ReceptionDashboardResponse,
  ReceptionOperationalStatusAction,
  ReceptionPatientSummary,
} from "@operaclinic/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionHeader,
  AdminShortcutPanel,
  adminInputClassName,
  adminMutedPanelClassName,
  adminSelectClassName,
  adminTextareaClassName,
} from "@/components/platform/platform-admin";
import { AppointmentActionDialog } from "@/components/reception/appointment-action-dialog";
import { AppointmentDrawer } from "@/components/reception/appointment-drawer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  listProcedureProtocols,
  listConsultationTypes,
  listProfessionals,
  listUnits,
} from "@/lib/client/clinic-structure-api";
import { toErrorMessage } from "@/lib/client/http";
import {
  createReceptionAppointment,
  getReceptionAppointment,
  getReceptionDashboard,
  getReceptionDayAgenda,
  searchReceptionAvailability,
  searchReceptionPatients,
  updateReceptionAppointmentStatus,
  type ReceptionAvailabilitySlot,
} from "@/lib/client/reception-api";
import { findOrMergePatient } from "@/lib/client/patients-api";
import {
  formatDateLabel,
  formatDateTime,
  formatTime,
  getAppointmentStatusLabel,
  getAppointmentStatusTone,
} from "@/lib/formatters";
import { useSession } from "@/hooks/use-session";

interface ReferenceOption {
  id: string;
  name: string;
}

interface ProcedureProtocolOption {
  id: string;
  name: string;
  consultationTypeId: string;
  totalSessions: number;
  intervalBetweenSessionsDays: number;
}

interface ActionDialogState {
  appointmentId: string;
  patientName: string;
  status: "CANCELED" | "NO_SHOW";
  requireReason: boolean;
}

function getActionKey(id: string, status: ReceptionOperationalStatusAction): string {
  return `${id}:${status}`;
}

function getMinutesFromNow(target: string, now: number): number {
  return Math.max(0, Math.round((new Date(target).getTime() - now) / 60000));
}

function getMinutesElapsed(start: string, now: number): number {
  return Math.max(0, Math.round((now - new Date(start).getTime()) / 60000));
}

function formatMinutesLabel(minutes: number): string {
  if (minutes <= 0) {
    return "agora";
  }

  if (minutes === 1) {
    return "1 min";
  }

  return `${minutes} min`;
}

function getQueueUrgency(waitMinutes: number): {
  label: string;
  cardClassName: string;
  badgeClassName: string;
  progressClassName: string;
} {
  if (waitMinutes >= 20) {
    return {
      label: "Crítico",
      cardClassName: "border-rose-300 bg-rose-50",
      badgeClassName: "bg-rose-100 text-rose-700",
      progressClassName: "bg-rose-500",
    };
  }

  if (waitMinutes >= 10) {
    return {
      label: "Atenção",
      cardClassName: "border-amber-300 bg-amber-50",
      badgeClassName: "bg-amber-100 text-amber-700",
      progressClassName: "bg-amber-500",
    };
  }

  return {
    label: "No ritmo",
    cardClassName: "border-emerald-300 bg-emerald-50",
    badgeClassName: "bg-emerald-100 text-emerald-700",
    progressClassName: "bg-emerald-500",
  };
}

function getWaitProgress(waitMinutes: number): number {
  return Math.min(100, Math.max(8, Math.round((waitMinutes / 20) * 100)));
}

function getQueueEtaMinutes(index: number): number {
  return Math.max(0, index * 8);
}

function getSlotPeriod(startsAt: string, timeZone?: string): "Manh\u00e3" | "Tarde" | "Noite" {
  const hour = parseInt(
    new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone }).format(
      new Date(startsAt),
    ),
    10,
  );
  if (hour < 12) return "Manh\u00e3";
  if (hour < 18) return "Tarde";
  return "Noite";
}

function playCriticalAlertTone(): void {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextConstructor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextConstructor) {
    return;
  }

  const context = new AudioContextConstructor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  gain.gain.setValueAtTime(0.001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start();
  oscillator.stop(context.currentTime + 0.35);

  oscillator.onended = () => {
    void context.close();
  };
}

export default function ReceptionPage() {
  const { user } = useSession({ expectedProfile: "clinic" });
  const [requestedDate, setRequestedDate] = useState<string | undefined>(undefined);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [timezone, setTimezone] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<ReceptionDashboardResponse | null>(null);
  const [agenda, setAgenda] = useState<ReceptionAgendaAppointment[]>([]);
  const [patients, setPatients] = useState<ReceptionPatientSummary[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<ReceptionPatientSummary | null>(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [quickPatient, setQuickPatient] = useState({
    fullName: "",
    contactType: "WHATSAPP" as "PHONE" | "WHATSAPP",
    contactValue: "",
    birthDate: "",
    documentNumber: "",
    notes: "",
  });
  const [appointmentDetail, setAppointmentDetail] =
    useState<ReceptionAppointmentDetail | null>(null);
  const [units, setUnits] = useState<ReferenceOption[]>([]);
  const [professionals, setProfessionals] = useState<ReferenceOption[]>([]);
  const [consultationTypes, setConsultationTypes] = useState<ReferenceOption[]>([]);
  const [procedureProtocols, setProcedureProtocols] = useState<ProcedureProtocolOption[]>([]);
  const [agendaFilters, setAgendaFilters] = useState({ professionalId: "", unitId: "" });
  const [form, setForm] = useState({
    date: "",
    professionalId: "",
    consultationTypeId: "",
    procedureProtocolId: "",
    unitId: "",
    room: "",
    notes: "",
  });
  const [slots, setSlots] = useState<ReceptionAvailabilitySlot[]>([]);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);
  const [isCreatingPatient, setIsCreatingPatient] = useState(false);
  const [isSearchingSlots, setIsSearchingSlots] = useState(false);
  const [hasSearchedSlots, setHasSearchedSlots] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isAgendaModalOpen, setIsAgendaModalOpen] = useState(false);
  const [isBoardMode, setIsBoardMode] = useState(false);
  const [isAlertSoundEnabled, setIsAlertSoundEnabled] = useState(false);
  const [hasAutoOpenedAgenda, setHasAutoOpenedAgenda] = useState(false);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [lastAutoRefreshAt, setLastAutoRefreshAt] = useState<number | null>(null);
  const [lastCriticalAlertKey, setLastCriticalAlertKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentDate = requestedDate ?? effectiveDate;

  const pendingConfirmation = useMemo(
    () => agenda.filter((item) => ["BOOKED", "RESCHEDULED"].includes(item.status)),
    [agenda],
  );
  const queue = useMemo(
    () => agenda.filter((item) => item.status === "CHECKED_IN"),
    [agenda],
  );
  const awaitingPayment = useMemo(
    () =>
      agenda
        .filter((item) => item.status === "AWAITING_PAYMENT")
        .sort((left, right) =>
          (left.awaitingPaymentAt ?? left.closureReadyAt ?? left.startsAt).localeCompare(
            right.awaitingPaymentAt ?? right.closureReadyAt ?? right.startsAt,
          ),
        ),
    [agenda],
  );
  const delayedAppointments = useMemo(
    () =>
      agenda
        .filter((item) => ["BOOKED", "CONFIRMED", "RESCHEDULED"].includes(item.status))
        .filter((item) => new Date(item.startsAt).getTime() < nowTimestamp)
        .sort(
          (left, right) =>
            new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
        ),
    [agenda, nowTimestamp],
  );
  const nextAgendaItems = useMemo(
    () =>
      agenda
        .filter((item) => ["BOOKED", "CONFIRMED", "RESCHEDULED"].includes(item.status))
        .filter((item) => new Date(item.startsAt).getTime() >= nowTimestamp)
        .sort(
          (left, right) =>
            new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
        ),
    [agenda, nowTimestamp],
  );
  const spotlightAppointment = useMemo(
    () =>
      queue[0] ??
      awaitingPayment[0] ??
      delayedAppointments[0] ??
      nextAgendaItems[0] ??
      null,
    [awaitingPayment, delayedAppointments, nextAgendaItems, queue],
  );
  const criticalQueueItems = useMemo(
    () =>
      queue.filter(
        (item) =>
          getMinutesElapsed(item.checkedInAt ?? item.startsAt, nowTimestamp) >= 20,
      ),
    [nowTimestamp, queue],
  );
  const criticalAlertKey = useMemo(
    () =>
      criticalQueueItems
        .map((item) => `${item.id}:${getMinutesElapsed(item.checkedInAt ?? item.startsAt, nowTimestamp)}`)
        .join("|"),
    [criticalQueueItems, nowTimestamp],
  );
  const selectedPatientContact = useMemo(
    () =>
      selectedPatient?.contacts.find((contact) => contact.isPrimary)?.value ??
      selectedPatient?.contacts[0]?.value ??
      null,
    [selectedPatient],
  );
  const receptionMetrics = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    return [
      {
        label: "Hoje",
        value: String(dashboard.totals.totalAppointments),
        helper: "Atendimentos previstos no dia.",
      },
      {
        label: "Confirmações",
        value: String(dashboard.totals.pendingConfirmation),
        helper: "Pacientes para confirmar.",
        tone:
          dashboard.totals.pendingConfirmation > 0
            ? ("warning" as const)
            : ("default" as const),
      },
      {
        label: "Fila",
        value: String(dashboard.totals.checkedIn),
        helper: "Pacientes aguardando chamada.",
        tone:
          dashboard.totals.checkedIn > 0 ? ("accent" as const) : ("default" as const),
      },
      {
        label: "Retorno",
        value: String(dashboard.totals.awaitingPayment),
        helper: "Pacientes de volta para pagamento e baixa.",
        tone:
          dashboard.totals.awaitingPayment > 0
            ? ("accent" as const)
            : ("default" as const),
      },
      {
        label: "No-show",
        value: String(dashboard.totals.noShow),
        helper: "Perda operacional do dia.",
        tone:
          dashboard.totals.noShow > 0 ? ("danger" as const) : ("default" as const),
      },
    ];
  }, [dashboard]);
  const shortcutItems = useMemo(
    () => [
      {
        label: "Pacientes",
        description: "Abrir busca e cadastro rápido.",
        href: "#pacientes",
      },
      {
        label: "Novo agendamento",
        description: "Pular para slots e criação manual.",
        href: "#novo-agendamento",
      },
      {
        label: "Agenda do dia",
        description: "Ir direto para a fila operacional.",
        href: "#agenda-dia",
      },
    ],
    [],
  );

  const loadReferences = useCallback(async () => {
    const [unitList, professionalList, consultationTypeList, procedureProtocolList] = await Promise.all([
      listUnits(),
      listProfessionals(),
      listConsultationTypes(),
      listProcedureProtocols({ isActive: true }),
    ]);

    setUnits(unitList.map((item) => ({ id: item.id, name: item.name })));
    setProfessionals(
      professionalList.map((item) => ({
        id: item.id,
        name: item.displayName || item.fullName,
      })),
    );
    setConsultationTypes(
      consultationTypeList
        .filter((item) => item.isActive)
        .map((item) => ({ id: item.id, name: item.name })),
    );

    setProcedureProtocols(
      procedureProtocolList
        .filter((item) => item.isActive)
        .map((item) => ({
          id: item.id,
          name: item.name,
          consultationTypeId: item.consultationTypeId,
          totalSessions: item.totalSessions,
          intervalBetweenSessionsDays: item.intervalBetweenSessionsDays,
        })),
    );
  }, []);

  const selectedProtocol = useMemo(
    () =>
      procedureProtocols.find((item) => item.id === form.procedureProtocolId) ?? null,
    [form.procedureProtocolId, procedureProtocols],
  );

  const visibleProtocols = useMemo(
    () =>
      form.consultationTypeId
        ? procedureProtocols.filter(
            (item) => item.consultationTypeId === form.consultationTypeId,
          )
        : procedureProtocols,
    [form.consultationTypeId, procedureProtocols],
  );

  const loadReception = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [dashboardData, agendaData] = await Promise.all([
        getReceptionDashboard({ date: requestedDate }),
        getReceptionDayAgenda({
          date: requestedDate,
          professionalId: agendaFilters.professionalId || undefined,
          unitId: agendaFilters.unitId || undefined,
        }),
      ]);

      setDashboard(dashboardData);
      setAgenda(agendaData.appointments);
      setEffectiveDate(dashboardData.date);
      setTimezone(dashboardData.timezone);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Não foi possível carregar a recepção."));
    } finally {
      setIsLoading(false);
    }
  }, [agendaFilters.professionalId, agendaFilters.unitId, requestedDate]);

  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    void loadReception();
  }, [loadReception]);

  useEffect(() => {
    if (!currentDate) {
      return;
    }

    setForm((current) =>
      current.date ? current : { ...current, date: currentDate },
    );
  }, [currentDate]);

  useEffect(() => {
    setSlots([]);
    setHasSearchedSlots(false);
  }, [
    form.date,
    form.professionalId,
    form.consultationTypeId,
    form.procedureProtocolId,
    form.unitId,
    selectedPatient?.id,
  ]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user || isLoading || !dashboard || hasAutoOpenedAgenda) {
      return;
    }

    if (user.roles.includes("RECEPTION")) {
      setIsAgendaModalOpen(true);
      setIsBoardMode(true);
    }

    setHasAutoOpenedAgenda(true);
  }, [dashboard, hasAutoOpenedAgenda, isLoading, user]);

  useEffect(() => {
    if (!isAgendaModalOpen || !isBoardMode) {
      return;
    }

    const interval = window.setInterval(() => {
      setLastAutoRefreshAt(Date.now());
      void loadReception();
    }, 45000);

    return () => window.clearInterval(interval);
  }, [isAgendaModalOpen, isBoardMode, loadReception]);

  useEffect(() => {
    if (!isAgendaModalOpen || !isBoardMode || !isAlertSoundEnabled) {
      return;
    }

    if (!criticalAlertKey || criticalAlertKey === lastCriticalAlertKey) {
      return;
    }

    playCriticalAlertTone();
    setLastCriticalAlertKey(criticalAlertKey);
  }, [
    criticalAlertKey,
    isAgendaModalOpen,
    isAlertSoundEnabled,
    isBoardMode,
    lastCriticalAlertKey,
  ]);

  async function handleSearchPatients(): Promise<void> {
    setIsSearchingPatients(true);
    setError(null);

    try {
      setPatients(
        await searchReceptionPatients({
          search: patientSearch,
          limit: "12",
        }),
      );
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Não foi possível buscar pacientes."));
    } finally {
      setIsSearchingPatients(false);
    }
  }

  async function handleSearchSlots(): Promise<void> {
    if (!form.professionalId || !form.consultationTypeId || !form.date) {
      setError("Selecione data, profissional e tipo de consulta.");
      return;
    }

    setIsSearchingSlots(true);
    setError(null);

    try {
      setSlots(
        await searchReceptionAvailability({
          professionalId: form.professionalId,
          consultationTypeId: form.consultationTypeId,
          date: form.date,
          unitId: form.unitId || undefined,
        }),
      );
      setHasSearchedSlots(true);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Não foi possível buscar slots."));
    } finally {
      setIsSearchingSlots(false);
    }
  }

  async function handleQuickCreatePatient(): Promise<void> {
    if (!quickPatient.contactValue.trim()) {
      setError("Informe ao menos um contato para o paciente.");
      return;
    }

    setIsCreatingPatient(true);
    setError(null);

    try {
      const created = await findOrMergePatient({
        fullName: quickPatient.fullName.trim() || undefined,
        birthDate: quickPatient.birthDate || undefined,
        documentNumber: quickPatient.documentNumber.trim() || undefined,
        notes: quickPatient.notes.trim() || undefined,
        contacts: [
          {
            type: quickPatient.contactType,
            value: quickPatient.contactValue,
            isPrimary: true,
          },
        ],
      });

      const mapped: ReceptionPatientSummary = {
        id: created.id,
        fullName: created.fullName,
        birthDate: created.birthDate,
        documentNumber: created.documentNumber,
        notes: created.notes,
        isActive: created.isActive,
        contacts: created.contacts,
      };

      setPatients((current) => [mapped, ...current.filter((p) => p.id !== mapped.id)]);
      setSelectedPatient(mapped);
      setPatientSearch(quickPatient.contactValue);
      setQuickPatient({
        fullName: "",
        contactType: "WHATSAPP",
        contactValue: "",
        birthDate: "",
        documentNumber: "",
        notes: "",
      });
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Não foi possível cadastrar paciente."));
    } finally {
      setIsCreatingPatient(false);
    }
  }

  async function handleCreateAppointment(slot: ReceptionAvailabilitySlot): Promise<void> {
    if (!selectedPatient) {
      setError("Selecione um paciente.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const created = await createReceptionAppointment({
        patientId: selectedPatient.id,
        professionalId: form.professionalId,
        consultationTypeId: form.consultationTypeId,
        procedureProtocolId: form.procedureProtocolId || undefined,
        unitId: form.unitId || undefined,
        room: form.room || undefined,
        notes: form.notes || undefined,
        startsAt: slot.startsAt,
        idempotencyKey: crypto.randomUUID(),
      });
      setAppointmentDetail(created);
      setSlots([]);
      await loadReception();
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Não foi possível criar o agendamento."));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleOpenAppointment(appointmentId: string): Promise<void> {
    setError(null);

    try {
      setAppointmentDetail(await getReceptionAppointment(appointmentId));
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Não foi possível abrir o agendamento."));
    }
  }

  async function refreshDrawer(appointmentId: string): Promise<void> {
    if (appointmentDetail?.id !== appointmentId) {
      return;
    }

    setAppointmentDetail(await getReceptionAppointment(appointmentId));
  }

  async function handleStatusAction(
    appointmentId: string,
    status: ReceptionOperationalStatusAction,
    reason?: string,
  ): Promise<void> {
    setActiveAction(getActionKey(appointmentId, status));
    setError(null);

    try {
      await updateReceptionAppointmentStatus(appointmentId, { status, reason });
      await loadReception();
      await refreshDrawer(appointmentId);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Não foi possível atualizar o status."));
    } finally {
      setActiveAction(null);
    }
  }

  function openActionDialog(appointment: ReceptionAgendaAppointment, status: "CANCELED" | "NO_SHOW"): void {
    setActionDialog({
      appointmentId: appointment.id,
      patientName: appointment.patientName ?? "Paciente sem nome",
      status,
      requireReason: status === "CANCELED",
    });
    setActionReason("");
  }

  async function submitActionDialog(): Promise<void> {
    if (!actionDialog) {
      return;
    }

    if (actionDialog.requireReason && !actionReason.trim()) {
      setError("Informe o motivo desta ação.");
      return;
    }

    await handleStatusAction(
      actionDialog.appointmentId,
      actionDialog.status,
      actionReason.trim() || undefined,
    );
    setActionDialog(null);
    setActionReason("");
  }

  function isPending(id: string, status: ReceptionOperationalStatusAction): boolean {
    return activeAction === getActionKey(id, status);
  }

  function renderQuickActions(
    appointment: ReceptionAgendaAppointment,
    tone: "default" | "inverse" = "default",
  ) {
    const canChange = ["BOOKED", "CONFIRMED", "RESCHEDULED"].includes(appointment.status);
    const canConfirm = ["BOOKED", "RESCHEDULED"].includes(appointment.status);
    const canFinalize = appointment.status === "AWAITING_PAYMENT";
    const isInverse = tone === "inverse";
    const confirmClassName = isInverse
      ? "rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/25 disabled:opacity-60"
      : "rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60";
    const checkInClassName = isInverse
      ? "rounded-lg border border-sky-400/30 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/25 disabled:opacity-60"
      : "rounded-lg border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 disabled:opacity-60";
    const cancelClassName = isInverse
      ? "rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/25 disabled:opacity-60"
      : "rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60";
    const finalizeClassName = isInverse
      ? "rounded-lg border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-50 transition hover:bg-amber-500/25 disabled:opacity-60"
      : "rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-50 disabled:opacity-60";
    const detailsClassName = isInverse
      ? "rounded-2xl border border-white/25 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
      : "rounded-lg border border-border px-3 py-2 text-xs font-semibold text-ink transition hover:bg-accentSoft";

    return (
      <div className="flex flex-wrap gap-2">
        {canConfirm ? (
          <button
            type="button"
            onClick={() => void handleStatusAction(appointment.id, "CONFIRMED")}
            disabled={isPending(appointment.id, "CONFIRMED")}
            className={confirmClassName}
          >
            Confirmar
          </button>
        ) : null}
        {canChange ? (
          <button
            type="button"
            onClick={() => void handleStatusAction(appointment.id, "CHECKED_IN")}
            disabled={isPending(appointment.id, "CHECKED_IN")}
            className={checkInClassName}
          >
            Check-in
          </button>
        ) : null}
        {canChange ? (
          <button
            type="button"
            onClick={() => openActionDialog(appointment, "CANCELED")}
            disabled={isPending(appointment.id, "CANCELED")}
            className={cancelClassName}
          >
            Cancelar
          </button>
        ) : null}
        {canFinalize ? (
          <button
            type="button"
            onClick={() => void handleStatusAction(appointment.id, "COMPLETED")}
            disabled={isPending(appointment.id, "COMPLETED")}
            className={finalizeClassName}
          >
            Pagamento + baixa
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void handleOpenAppointment(appointment.id)}
          className={detailsClassName}
        >
          Ver ficha
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clínica | Recepção"
        title="Recepção ao vivo"
        description="Abertura rápida da fila, check-in e confirmações sem poluição visual nem excesso de detalhe."
        actions={
          <>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                Agenda
              </p>
              <p className="font-semibold text-ink">
                {currentDate
                  ? formatDateLabel(`${currentDate}T12:00:00.000Z`, {
                      timeZone: timezone ?? undefined,
                    })
                  : "--"}
              </p>
              <p className="text-xs text-muted">
                {queue.length} na fila - {pendingConfirmation.length} para confirmar
              </p>
            </div>
            <input
              type="date"
              value={currentDate}
              onChange={(event) => setRequestedDate(event.target.value || undefined)}
              className={adminInputClassName}
            />
            <button
              type="button"
              onClick={() => void loadReception()}
              disabled={isLoading}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50 disabled:opacity-60"
            >
              {isLoading ? "Atualizando..." : "Atualizar"}
            </button>
            <Button
              type="button"
              onClick={() => setIsAgendaModalOpen(true)}
            >
              Abrir fila
            </Button>
          </>
        }
      >
        <AdminMetricGrid items={receptionMetrics} isLoading={isLoading && !dashboard} />
        <AdminShortcutPanel title="Ações rápidas" items={shortcutItems} />
      </AdminPageHeader>

      <Card className="space-y-4">
        <AdminSectionHeader
          eyebrow="Chegada do dia"
          title="Próximos a chegar"
          description="Próximos pacientes previstos para hoje. Abra a ficha para fazer check-in ou confirmar."
          actions={<StatusPill label={`${dashboard?.nextAppointments.length ?? 0} ${(dashboard?.nextAppointments.length ?? 0) === 1 ? "item" : "itens"}`} />}
        />
        <div className="space-y-3">
          {dashboard?.nextAppointments.length ? dashboard.nextAppointments.map((item) => (
            <div key={item.id} className="rounded-2xl border border-border bg-panel/70 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{item.patientName ?? "Paciente sem nome"}</p>
                  <p className="text-xs text-muted">
                    {formatTime(item.startsAt, { timeZone: timezone ?? undefined })} · {item.professionalName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleOpenAppointment(item.id)}
                  className="whitespace-nowrap rounded-lg border border-border px-3 py-2 text-xs font-semibold text-ink transition hover:bg-accentSoft"
                >
                  Ver ficha
                </button>
              </div>
            </div>
          )) : (
            <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted">
              Nenhum atendimento previsto para hoje.
            </div>
          )}
        </div>
      </Card>

      {error ? <Card className="border-red-200 bg-red-50" role="alert"><p className="text-sm text-red-700">{error}</p></Card> : null}

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card id="pacientes" className="space-y-4 scroll-mt-24">
          <AdminSectionHeader
            eyebrow="Pacientes"
            title="Busca e cadastro rápido"
            description="Resolva busca por nome, documento ou telefone sem sair da recepção."
            actions={
              <Button
                type="button"
                onClick={() => void handleSearchPatients()}
                disabled={isSearchingPatients}
              >
                {isSearchingPatients ? "Buscando..." : "Buscar"}
              </Button>
            }
          />
          <input
            type="text"
            value={patientSearch}
            onChange={(event) => setPatientSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleSearchPatients();
              }
            }}
            placeholder="Nome, documento ou telefone"
            className={adminInputClassName}
          />
          <div className={`${adminMutedPanelClassName} border-dashed text-sm text-muted`}>
            <p className="font-semibold text-ink">Selecionado</p>
            <p>{selectedPatient?.fullName ?? "Nenhum paciente selecionado."}</p>
            <p>{selectedPatientContact ?? "Sem contato principal"}</p>
          </div>

          <div className={adminMutedPanelClassName}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Cadastro rápido</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <input
                type="text"
                value={quickPatient.fullName}
                onChange={(event) =>
                  setQuickPatient((current) => ({ ...current, fullName: event.target.value }))
                }
                placeholder="Nome do paciente"
                className={adminInputClassName}
              />
              <input
                type="text"
                value={quickPatient.contactValue}
                onChange={(event) =>
                  setQuickPatient((current) => ({ ...current, contactValue: event.target.value }))
                }
                placeholder="Contato (obrigatório)"
                className={adminInputClassName}
              />
              <select
                value={quickPatient.contactType}
                onChange={(event) =>
                  setQuickPatient((current) => ({
                    ...current,
                    contactType: event.target.value as "PHONE" | "WHATSAPP",
                  }))
                }
                className={adminSelectClassName}
              >
                <option value="WHATSAPP">WhatsApp</option>
                <option value="PHONE">Telefone</option>
              </select>
              <input
                type="date"
                value={quickPatient.birthDate}
                onChange={(event) =>
                  setQuickPatient((current) => ({ ...current, birthDate: event.target.value }))
                }
                className={adminInputClassName}
              />
              <input
                type="text"
                value={quickPatient.documentNumber}
                onChange={(event) =>
                  setQuickPatient((current) => ({
                    ...current,
                    documentNumber: event.target.value,
                  }))
                }
                placeholder="Documento"
                className={`${adminInputClassName} md:col-span-2`}
              />
              <textarea
                value={quickPatient.notes}
                onChange={(event) =>
                  setQuickPatient((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Observações"
                className={`${adminTextareaClassName} min-h-20 md:col-span-2`}
              />
            </div>
            <div className="mt-2 flex justify-end">
              <Button type="button" onClick={() => void handleQuickCreatePatient()} disabled={isCreatingPatient}>
                {isCreatingPatient ? "Salvando..." : "Cadastrar e selecionar"}
              </Button>
            </div>
          </div>

          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {patients.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted">Nenhum paciente carregado ainda.</div>
            ) : patients.map((patient) => (
              <button
                key={patient.id}
                type="button"
                onClick={() => setSelectedPatient(patient)}
                className={`w-full rounded-2xl border px-4 py-4 text-left transition ${selectedPatient?.id === patient.id ? "border-accent bg-accentSoft" : "border-border bg-white hover:bg-accentSoft"}`}
              >
                <p className="font-semibold text-ink">{patient.fullName ?? "Paciente sem nome"}</p>
                <p className="text-xs text-muted">{patient.contacts[0]?.value ?? "Sem contato principal"}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card id="novo-agendamento" className="space-y-4 scroll-mt-24">
          <AdminSectionHeader
            eyebrow="Agendamento"
            title="Novo agendamento manual"
            description="Selecione um slot real e gere o atendimento estetico direto da recepção."
            actions={
              <Button
                type="button"
                onClick={() => void handleSearchSlots()}
                disabled={isSearchingSlots || isCreating}
              >
                {isSearchingSlots ? "Buscando..." : "Buscar slots"}
              </Button>
            }
          />
          {selectedPatient ? (
            <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm">
              <span className="font-semibold text-sky-700">{selectedPatient.fullName}</span>
              <span className="text-muted">· paciente selecionado</span>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Selecione um paciente no painel ao lado antes de buscar os slots.
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="date"
              value={form.date}
              onChange={(event) =>
                setForm((current) => ({ ...current, date: event.target.value }))
              }
              className={adminInputClassName}
            />
            <select className={adminSelectClassName} value={form.professionalId} onChange={(event) => setForm((current) => ({ ...current, professionalId: event.target.value }))}>
              <option value="">Profissional</option>
              {professionals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select
              className={adminSelectClassName}
              value={form.procedureProtocolId}
              onChange={(event) => {
                const nextProtocolId = event.target.value;
                const selected = procedureProtocols.find(
                  (item) => item.id === nextProtocolId,
                );

                setForm((current) => ({
                  ...current,
                  procedureProtocolId: nextProtocolId,
                  consultationTypeId:
                    selected?.consultationTypeId ?? current.consultationTypeId,
                }));
              }}
            >
              <option value="">Protocolo (opcional)</option>
              {visibleProtocols.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.totalSessions} sessoes)
                </option>
              ))}
            </select>
            <select className={adminSelectClassName} value={form.consultationTypeId} onChange={(event) => setForm((current) => {
              const nextConsultationTypeId = event.target.value;
              const protocolStillCompatible = current.procedureProtocolId
                ? procedureProtocols.some(
                    (item) =>
                      item.id === current.procedureProtocolId &&
                      item.consultationTypeId === nextConsultationTypeId,
                  )
                : true;

              return {
                ...current,
                consultationTypeId: nextConsultationTypeId,
                procedureProtocolId: protocolStillCompatible
                  ? current.procedureProtocolId
                  : "",
              };
            })}>
              <option value="">Procedimento estetico</option>
              {consultationTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select className={adminSelectClassName} value={form.unitId} onChange={(event) => setForm((current) => ({ ...current, unitId: event.target.value }))}>
              <option value="">Unidade (opcional)</option>
              {units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <input type="text" placeholder="Sala (opcional)" value={form.room} onChange={(event) => setForm((current) => ({ ...current, room: event.target.value }))} className={adminInputClassName} />
          </div>
          {selectedProtocol ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Protocolo selecionado: <strong>{selectedProtocol.name}</strong> com {selectedProtocol.totalSessions} sessoes e intervalo sugerido de {selectedProtocol.intervalBetweenSessionsDays} dias.
            </div>
          ) : null}
          <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Observações do atendimento" className={adminTextareaClassName} />
          {slots.length > 0 ? (() => {
            const PERIODS = ["Manh\u00e3", "Tarde", "Noite"] as const;
            const grouped = slots.reduce<Record<string, ReceptionAvailabilitySlot[]>>(
              (acc, slot) => {
                const period = getSlotPeriod(slot.startsAt, timezone ?? undefined);
                if (!acc[period]) acc[period] = [];
                acc[period].push(slot);
                return acc;
              },
              {},
            );
            return (
              <div className="space-y-5">
                {PERIODS.filter((p) => grouped[p]?.length).map((period) => (
                  <div key={period}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{period}</p>
                    <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
                      {grouped[period].map((slot) => (
                        <button
                          key={slot.startsAt}
                          type="button"
                          onClick={() => void handleCreateAppointment(slot)}
                          className="rounded-xl border border-border bg-white px-3 py-3 text-left transition hover:border-sky-300 hover:bg-sky-50 disabled:opacity-60"
                          disabled={isCreating}
                        >
                          <p className="text-sm font-semibold text-ink">
                            {formatTime(slot.startsAt, { timeZone: timezone ?? undefined })} – {formatTime(slot.endsAt, { timeZone: timezone ?? undefined })}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })() : hasSearchedSlots ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted">
              Nenhum slot encontrado para a data selecionada. Ajuste data, profissional, procedimento ou unidade e tente novamente.
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted">
              Busque slots para montar o novo agendamento manual.
            </div>
          )}
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.22fr_0.78fr]">
        <Card id="agenda-dia" className="space-y-4 scroll-mt-24">
          <AdminSectionHeader
            eyebrow="Fila"
            title="Agenda do dia"
            description="Use a fila em tela cheia para chamar, confirmar e acompanhar atrasos sem se perder."
            actions={
              <Button
                type="button"
                className="bg-slate-950 text-white hover:bg-slate-800"
                onClick={() => setIsAgendaModalOpen(true)}
              >
                Abrir agenda interativa
              </Button>
            }
          />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                Próximo a chamar
              </p>
              <p className="mt-3 text-lg font-semibold text-ink">
                {queue[0]?.patientName ?? nextAgendaItems[0]?.patientName ?? "Fila vazia"}
              </p>
              <p className="mt-2 text-sm text-muted">
                {queue[0]
                  ? `Aguardando h\u00e1 ${getMinutesElapsed(
                      queue[0].checkedInAt ?? queue[0].startsAt,
                      nowTimestamp,
                    )} min`
                  : nextAgendaItems[0]
                    ? `Chega em ${getMinutesFromNow(nextAgendaItems[0].startsAt, nowTimestamp)} min`
                    : "Nenhum paciente previsto agora."}
              </p>
            </div>
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                Pedem atenção
              </p>
              <p className="mt-3 text-3xl font-semibold text-ink">
                {delayedAppointments.length + pendingConfirmation.length}
              </p>
              <p className="mt-2 text-sm text-muted">
                {delayedAppointments.length} atrasados e {pendingConfirmation.length} confirmações.
              </p>
            </div>
            <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Fluxo do dia
              </p>
              <p className="mt-3 text-3xl font-semibold text-ink">{agenda.length}</p>
              <p className="mt-2 text-sm text-muted">
                Agenda total com {queue.length} em recepção agora.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <select className={adminSelectClassName} value={agendaFilters.professionalId} onChange={(event) => setAgendaFilters((current) => ({ ...current, professionalId: event.target.value }))}>
              <option value="">Todos os profissionais</option>
              {professionals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select className={adminSelectClassName} value={agendaFilters.unitId} onChange={(event) => setAgendaFilters((current) => ({ ...current, unitId: event.target.value }))}>
              <option value="">Todas as unidades</option>
              {units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>

          <div className="space-y-3">
            {agenda.slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-2xl border border-border bg-white px-4 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{item.patientName ?? "-"}</p>
                      <StatusPill
                        label={getAppointmentStatusLabel(item.status)}
                        tone={getAppointmentStatusTone(item.status)}
                      />
                    </div>
                    <p className="text-sm text-muted">
                      {formatTime(item.startsAt, { timeZone: timezone ?? undefined })} - {item.professionalName}
                    </p>
                    <p className="text-xs text-muted">
                      {item.patientPrimaryContact ?? "Sem contato principal"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {renderQuickActions(item)}
                  </div>
                </div>
              </div>
            ))}
            {agenda.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted">
                Nenhum atendimento encontrado para os filtros atuais.
              </div>
            ) : null}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="text-lg font-semibold text-ink">Confirmações</h2><p className="text-sm text-muted">Pendências operacionais do dia.</p></div>
              <StatusPill label={`${pendingConfirmation.length} pendências`} tone="warning" />
            </div>
            {pendingConfirmation.length === 0 ? <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted">Nenhuma confirmação pendente.</div> : pendingConfirmation.slice(0, 8).map((item) => (
              <div key={item.id} className="rounded-2xl border border-border bg-panel/70 px-4 py-4">
                <p className="font-semibold text-ink">{item.patientName ?? "-"}</p>
                <p className="text-xs text-muted">{formatTime(item.startsAt, { timeZone: timezone ?? undefined })} - {item.professionalName}</p>
                <div className="mt-3 flex gap-2">
                  <Button type="button" onClick={() => void handleStatusAction(item.id, "CONFIRMED")} disabled={isPending(item.id, "CONFIRMED")}>Confirmar</Button>
                  <button type="button" onClick={() => void handleOpenAppointment(item.id)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accentSoft">Ver ficha</button>
                </div>
              </div>
            ))}
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="text-lg font-semibold text-ink">Check-in / fila</h2><p className="text-sm text-muted">Pacientes em operação na recepção.</p></div>
              <StatusPill label={`${queue.length} em fila`} tone="success" />
            </div>
            {queue.length === 0 ? <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted">Nenhum paciente em fila.</div> : queue.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border bg-panel/70 px-4 py-4">
                <p className="font-semibold text-ink">{item.patientName ?? "-"}</p>
                <p className="text-xs text-muted">Check-in: {item.checkedInAt ? formatDateTime(item.checkedInAt, { timeZone: timezone ?? undefined }) : "-"}</p>
                <div className="mt-3 flex gap-2">
                  <Button type="button" className="flex-1" onClick={() => void handleOpenAppointment(item.id)}>Chamar / Ver ficha</Button>
                  <button type="button" onClick={() => openActionDialog(item, "NO_SHOW")} disabled={isPending(item.id, "NO_SHOW")} className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60">No-show</button>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </section>

      {isAgendaModalOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm">
          <div className="absolute inset-0 overflow-hidden bg-slate-100 shadow-2xl">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Agenda ao vivo
                </p>
                <h2 className="text-2xl font-semibold text-ink">Fila e chamados do dia</h2>
                <p className="mt-1 text-sm text-muted">
                  Veja quem chamar agora, o que atrasou e o que ainda precisa de confirmação.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Resumo
                  </p>
                  <p className="font-semibold text-ink">
                    {queue.length} na fila · {pendingConfirmation.length} confirmações
                  </p>
                </div>
                <button
                  type="button"
                  className={`inline-flex h-11 items-center justify-center rounded-2xl px-4 text-sm font-semibold transition ${
                    isBoardMode
                      ? "bg-sky-600 text-white hover:bg-sky-500"
                      : "border border-slate-200 bg-white text-ink hover:bg-slate-50"
                  }`}
                  onClick={() => setIsBoardMode((current) => !current)}
                >
                  {isBoardMode ? "Modo detalhado" : "Modo painel"}
                </button>
                <button
                  type="button"
                  className={`inline-flex h-11 items-center justify-center rounded-2xl px-4 text-sm font-semibold transition ${
                    isAlertSoundEnabled
                      ? "bg-rose-600 text-white hover:bg-rose-500"
                      : "border border-slate-200 bg-white text-ink hover:bg-slate-50"
                  }`}
                  onClick={() => setIsAlertSoundEnabled((current) => !current)}
                >
                  {isAlertSoundEnabled ? "Som ligado" : "Ativar som"}
                </button>
                <button
                  type="button"
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-500"
                  onClick={() => void loadReception()}
                >
                  Atualizar fila
                </button>
                <button
                  type="button"
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
                  onClick={() => setIsAgendaModalOpen(false)}
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="h-[calc(100%-88px)] overflow-y-auto p-4">
              <div
                className={`grid gap-4 ${
                  isBoardMode ? "xl:grid-cols-[1.3fr_0.7fr]" : "xl:grid-cols-[1.2fr_0.8fr]"
                }`}
              >
              <div className={`space-y-4 ${isBoardMode ? "xl:pr-3" : ""}`}>
                <div className={`grid gap-3 ${isBoardMode ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
                  <div className="rounded-[24px] border border-sky-200 bg-white p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                      Chamando agora
                    </p>
                    <p className="mt-3 text-lg font-semibold text-ink">
                      {queue[0]?.patientName ?? delayedAppointments[0]?.patientName ?? "Sem fila"}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      {queue[0]
                        ? `Na recepção há ${getMinutesElapsed(
                            queue[0].checkedInAt ?? queue[0].startsAt,
                            nowTimestamp,
                          )} min`
                        : delayedAppointments[0]
                          ? `Atrasado há ${getMinutesElapsed(
                              delayedAppointments[0].startsAt,
                              nowTimestamp,
                            )} min`
                          : "Nenhum paciente esperando agora."}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-amber-200 bg-white p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                      Precisam de ação
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-ink">
                      {pendingConfirmation.length + delayedAppointments.length}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      Confirmações e atrasos para tratar agora.
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-emerald-200 bg-white p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                      Recebidos
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-ink">{queue.length}</p>
                    <p className="mt-2 text-sm text-muted">
                      Pacientes ja com check-in aguardando chamada.
                    </p>
                  </div>
                  {isBoardMode ? (
                    <div className="rounded-[24px] border border-violet-200 bg-violet-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                        Auto-sync
                      </p>
                      <p className="mt-3 text-3xl font-semibold text-ink">45s</p>
                      <p className="mt-2 text-sm text-muted">
                        {lastAutoRefreshAt
                          ? `Última sync há ${formatMinutesLabel(
                              getMinutesElapsed(
                                new Date(lastAutoRefreshAt).toISOString(),
                                nowTimestamp,
                              ),
                            )}`
                          : "Painel sincroniza automaticamente a cada 45 segundos."}
                      </p>
                    </div>
                  ) : null}
                </div>

                {criticalQueueItems.length > 0 ? (
                  <div className="rounded-[28px] border border-rose-400 bg-rose-50 p-5 shadow-sm ring-4 ring-rose-100">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700">
                          Alerta de fila
                        </p>
                        <h3 className="mt-1 text-2xl font-semibold text-rose-900">
                          {criticalQueueItems.length} paciente{criticalQueueItems.length > 1 ? "s" : ""} em espera critica
                        </h3>
                        <p className="mt-2 text-sm text-rose-800">
                          {criticalQueueItems[0]?.patientName ?? "Paciente"} esta aguardando ha{" "}
                          {formatMinutesLabel(
                            getMinutesElapsed(
                              criticalQueueItems[0]!.checkedInAt ??
                                criticalQueueItems[0]!.startsAt,
                              nowTimestamp,
                            ),
                          )}
                          . Priorize a chamada imediata.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          className="bg-rose-600 text-white hover:bg-rose-500"
                          onClick={() => void handleOpenAppointment(criticalQueueItems[0]!.id)}
                        >
                          Abrir paciente critico
                        </Button>
                        {isAlertSoundEnabled ? (
                          <Button
                            type="button"
                            className="border border-rose-200 bg-white text-rose-700 hover:bg-rose-100"
                            onClick={() => playCriticalAlertTone()}
                          >
                            Testar som
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {spotlightAppointment ? (
                  <div className="rounded-[28px] border border-sky-400 bg-[linear-gradient(135deg,#020617,#0f172a,#1e3a8a)] p-5 text-white shadow-xl">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="space-y-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                          Painel de chamada
                        </p>
                        <h3 className="text-4xl font-semibold">
                          {spotlightAppointment.patientName}
                        </h3>
                        <p className="text-sm text-slate-300">
                          {formatTime(spotlightAppointment.startsAt, {
                            timeZone: timezone ?? undefined,
                          })}{" "}
                          - {spotlightAppointment.professionalName}
                        </p>
                      </div>
                      <div className="min-w-[240px] rounded-[24px] bg-white/15 p-4 ring-1 ring-white/10">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                          Tempo de espera
                        </p>
                        <p className="mt-2 text-5xl font-semibold">
                          {formatMinutesLabel(
                            spotlightAppointment.status === "CHECKED_IN"
                              ? getMinutesElapsed(
                                  spotlightAppointment.checkedInAt ??
                                    spotlightAppointment.startsAt,
                                  nowTimestamp,
                                )
                              : spotlightAppointment.status === "AWAITING_PAYMENT"
                                ? getMinutesElapsed(
                                    spotlightAppointment.awaitingPaymentAt ??
                                      spotlightAppointment.closureReadyAt ??
                                      spotlightAppointment.startsAt,
                                    nowTimestamp,
                                  )
                                : getMinutesFromNow(
                                    spotlightAppointment.startsAt,
                                    nowTimestamp,
                                  ),
                          )}
                        </p>
                        <p className="mt-2 text-sm text-slate-300">
                          {spotlightAppointment.status === "CHECKED_IN"
                            ? "Paciente aguardando chamada."
                            : spotlightAppointment.status === "AWAITING_PAYMENT"
                              ? "Paciente aguardando pagamento e baixa."
                              : "Tempo estimado para chegada."}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex h-14 items-center justify-center rounded-2xl bg-white px-6 text-base font-semibold text-slate-950 shadow-sm transition hover:bg-slate-200"
                        onClick={() => void handleOpenAppointment(spotlightAppointment.id)}
                      >
                        Chamar / abrir ficha
                      </button>
                      {renderQuickActions(spotlightAppointment, "inverse")}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                          Painel de chamada
                        </p>
                        <h3 className="text-3xl font-semibold text-ink">Nenhum paciente na vez</h3>
                        <p className="text-sm text-muted">
                          A fila esta limpa neste momento. Use a agenda para acompanhar os proximos atendimentos.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            className="bg-slate-950 text-white hover:bg-slate-800"
                            onClick={() => {
                              setIsAgendaModalOpen(false);
                              const section = document.getElementById("novo-agendamento");
                              section?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                          >
                            Criar agendamento
                          </Button>
                          <button
                            type="button"
                            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accentSoft"
                            onClick={() => {
                              setIsAgendaModalOpen(false);
                              const section = document.getElementById("agenda-dia");
                              section?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                          >
                            Ir para agenda do dia
                          </button>
                        </div>
                      </div>
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                          Tempo de espera
                        </p>
                        <p className="mt-2 text-4xl font-semibold text-ink">--</p>
                        <p className="mt-2 text-sm text-muted">Sem proximo atendimento.</p>
                      </div>
                    </div>
                  </div>
                )}

                <Card className="space-y-4">
                  <AdminSectionHeader
                    eyebrow="Fila"
                    title="Pacientes aguardando"
                    description="Quem já chegou fica no topo para a equipe chamar rápido."
                    actions={<StatusPill label={`${queue.length} aguardando`} tone="success" />}
                  />
                  <div className="space-y-3">
                    {queue.length > 0 ? (
                      queue.map((item, index) => (
                        <div
                          key={item.id}
                          className={`rounded-[24px] border p-4 ${
                            index === 0
                              ? "border-sky-300 bg-sky-50 shadow-sm"
                              : getQueueUrgency(
                                  getMinutesElapsed(
                                    item.checkedInAt ?? item.startsAt,
                                    nowTimestamp,
                                  ),
                                ).cardClassName
                          }`}
                        >
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
                                  {index === 0 ? "Chamar agora" : `${index + 1} na fila`}
                                </span>
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                    getQueueUrgency(
                                      getMinutesElapsed(
                                        item.checkedInAt ?? item.startsAt,
                                        nowTimestamp,
                                      ),
                                    ).badgeClassName
                                  }`}
                                >
                                  {
                                    getQueueUrgency(
                                      getMinutesElapsed(
                                        item.checkedInAt ?? item.startsAt,
                                        nowTimestamp,
                                      ),
                                    ).label
                                  }
                                </span>
                                <StatusPill
                                  label={getAppointmentStatusLabel(item.status)}
                                  tone={getAppointmentStatusTone(item.status)}
                                />
                              </div>
                              <p className="text-lg font-semibold text-ink">
                                {item.patientName ?? "Paciente sem nome"}
                              </p>
                              <p className="text-sm text-muted">
                                {item.professionalName} -{" "}
                                {formatTime(item.startsAt, { timeZone: timezone ?? undefined })}
                              </p>
                              <p className="text-sm text-muted">
                                Espera de{" "}
                                {getMinutesElapsed(
                                  item.checkedInAt ?? item.startsAt,
                                  nowTimestamp,
                                )}{" "}
                                min
                              </p>
                              <p className="text-sm font-semibold text-ink">
                                Estimativa de chamada:{" "}
                                {index === 0
                                  ? "agora"
                                  : `em ${formatMinutesLabel(getQueueEtaMinutes(index))}`}
                              </p>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-white/80">
                                <div
                                  className={`h-full rounded-full ${
                                    getQueueUrgency(
                                      getMinutesElapsed(
                                        item.checkedInAt ?? item.startsAt,
                                        nowTimestamp,
                                      ),
                                    ).progressClassName
                                  }`}
                                  style={{
                                    width: `${getWaitProgress(
                                      getMinutesElapsed(
                                        item.checkedInAt ?? item.startsAt,
                                        nowTimestamp,
                                      ),
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                className="bg-slate-950 text-white hover:bg-slate-800"
                                onClick={() => void handleOpenAppointment(item.id)}
                              >
                                {index === 0 ? "Chamar paciente" : "Preparar chamada"}
                              </Button>
                              {renderQuickActions(item)}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="space-y-3 rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted">
                        <p>Ninguem em fila neste momento.</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-ink transition hover:bg-accentSoft"
                            onClick={() => {
                              setIsAgendaModalOpen(false);
                              const section = document.getElementById("agenda-dia");
                              section?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                          >
                            Revisar agenda
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-ink transition hover:bg-accentSoft"
                            onClick={() => void loadReception()}
                          >
                            Sincronizar agora
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                <Card className="space-y-4">
                  <AdminSectionHeader
                    eyebrow="Próximos"
                    title="Chegadas e atrasos"
                    description="Veja quem esta vindo e quem ja deveria ter chegado."
                  />
                  <div className="space-y-3">
                    {[...delayedAppointments.slice(0, 3), ...nextAgendaItems.slice(0, 5)].map((item) => {
                      const isDelayed = new Date(item.startsAt).getTime() < nowTimestamp;

                      return (
                        <div
                          key={item.id}
                          className={`rounded-[24px] border p-4 ${
                            isDelayed
                              ? "border-rose-300 bg-rose-50"
                              : "border-emerald-300 bg-white"
                          }`}
                        >
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isDelayed ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                                  {isDelayed
                                    ? `Atrasado ${getMinutesElapsed(item.startsAt, nowTimestamp)} min`
                                    : `Chega em ${getMinutesFromNow(item.startsAt, nowTimestamp)} min`}
                                </span>
                                <StatusPill
                                  label={getAppointmentStatusLabel(item.status)}
                                  tone={getAppointmentStatusTone(item.status)}
                                />
                              </div>
                              <p className="text-lg font-semibold text-ink">
                                {item.patientName ?? "Paciente sem nome"}
                              </p>
                              <p className="text-sm text-muted">
                                {formatTime(item.startsAt, { timeZone: timezone ?? undefined })} - {item.professionalName}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">{renderQuickActions(item)}</div>
                          </div>
                        </div>
                      );
                    })}
                    {delayedAppointments.length === 0 && nextAgendaItems.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted">
                        Nenhum atendimento pendente para a agenda atual.
                      </div>
                    ) : null}
                  </div>
                </Card>
              </div>

              <div className={`space-y-4 ${isBoardMode ? "xl:pl-1" : ""}`}>
                <Card className="space-y-4">
                  <AdminSectionHeader
                    eyebrow="Confirmacoes"
                    title={isBoardMode ? "Pendências antes da chegada" : "Antes de lotar a recepção"}
                    description={
                      isBoardMode
                        ? "Confirme rápido para evitar fila desnecessária."
                        : "Use estas ações para limpar pendências antes da chegada dos pacientes."
                    }
                    actions={
                      <StatusPill
                        label={`${pendingConfirmation.length} pendencias`}
                        tone="warning"
                      />
                    }
                  />
                  <div className="space-y-3">
                    {pendingConfirmation.length > 0 ? (
                      pendingConfirmation.slice(0, 8).map((item) => (
                        <div key={item.id} className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-ink">{item.patientName ?? "-"}</p>
                              <p className="mt-1 text-sm text-muted">
                                {formatTime(item.startsAt, { timeZone: timezone ?? undefined })} - {item.professionalName}
                              </p>
                            </div>
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-700">
                              {formatMinutesLabel(getMinutesFromNow(item.startsAt, nowTimestamp))}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              onClick={() => void handleStatusAction(item.id, "CONFIRMED")}
                              disabled={isPending(item.id, "CONFIRMED")}
                            >
                              Confirmar
                            </Button>
                            <button
                              type="button"
                              onClick={() => void handleOpenAppointment(item.id)}
                              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accentSoft"
                            >
                              Ver ficha
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted">
                        Todas as confirmações do recorte atual já foram tratadas.
                      </div>
                    )}
                  </div>
                </Card>

                <Card className="space-y-4">
                  <AdminSectionHeader
                    eyebrow="Feedback do fluxo"
                    title="Como a recepcao esta agora"
                    description="Uma leitura visual da pressão operacional do momento."
                  />
                  <div className="space-y-3">
                    <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-ink">Fila ocupada</p>
                        <span className="text-sm font-semibold text-ink">{queue.length}</span>
                      </div>
                      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{ width: `${Math.min(100, Math.max(10, queue.length * 18))}%` }}
                        />
                      </div>
                    </div>
                    <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-ink">Pendências</p>
                        <span className="text-sm font-semibold text-ink">
                          {pendingConfirmation.length + delayedAppointments.length}
                        </span>
                      </div>
                      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(
                                10,
                                (pendingConfirmation.length + delayedAppointments.length) * 16,
                              ),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-ink">Faltas do dia</p>
                        <span className="text-sm font-semibold text-ink">
                          {dashboard?.totals.noShow ?? 0}
                        </span>
                      </div>
                      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-rose-500"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(10, (dashboard?.totals.noShow ?? 0) * 22),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
            </div>
          </div>
        </div>
      ) : null}

      <AppointmentDrawer
        appointment={appointmentDetail}
        timezone={timezone}
        onClose={() => setAppointmentDetail(null)}
        onUpdated={(updated) => {
          setAppointmentDetail(updated);
          void loadReception();
        }}
      />

      <AppointmentActionDialog
        open={Boolean(actionDialog)}
        title={actionDialog?.status === "CANCELED" ? `Cancelar ${actionDialog.patientName}` : `Marcar no-show para ${actionDialog?.patientName ?? "o paciente"}`}
        description={actionDialog?.status === "CANCELED" ? "Registre o motivo do cancelamento para manter a operação consistente." : "Use esta ação quando o paciente não comparecer ao atendimento."}
        confirmLabel={actionDialog?.status === "CANCELED" ? "Cancelar agendamento" : "Marcar no-show"}
        reasonLabel="Motivo"
        reasonPlaceholder="Descreva o motivo operacional"
        reason={actionReason}
        requireReason={actionDialog?.requireReason}
        isSubmitting={actionDialog ? isPending(actionDialog.appointmentId, actionDialog.status) : false}
        onReasonChange={setActionReason}
        onConfirm={() => void submitActionDialog()}
        onClose={() => {
          setActionDialog(null);
          setActionReason("");
        }}
      />
    </div>
  );
}
