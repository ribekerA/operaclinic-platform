"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ProfessionalWorkspaceActionStatus,
  ProfessionalWorkspaceAgendaItem,
  ProfessionalWorkspaceAppointmentStatus,
  ProfessionalWorkspaceDashboardResponse,
  ProfessionalWorkspacePatientSummaryResponse,
} from "@operaclinic/shared";
import {
  AdminMetricGrid,
  AdminPageHeader,
  AdminShortcutPanel,
  adminInputClassName,
  adminSelectClassName,
  adminTextareaClassName,
} from "@/components/platform/platform-admin";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { toErrorMessage } from "@/lib/client/http";
import {
  getProfessionalWorkspaceDashboard,
  getProfessionalPatientSummary,
  updateProfessionalAppointmentNotes,
  updateProfessionalAppointmentStatus,
} from "@/lib/client/professional-api";
import {
  formatDateLabel,
  formatDateTime,
  formatTime,
  getAppointmentStatusLabel,
  getAppointmentStatusTone,
} from "@/lib/formatters";
import { useSession } from "@/hooks/use-session";

function resolveFocusLabel(
  item: ProfessionalWorkspaceAgendaItem | null,
  generatedAt: string | null,
): string | null {
  if (!item?.checkedInAt || !generatedAt) {
    return null;
  }

  const checkedInAt = new Date(item.checkedInAt);
  const reference = new Date(generatedAt);

  if (Number.isNaN(checkedInAt.getTime()) || Number.isNaN(reference.getTime())) {
    return null;
  }

  const waitMinutes = Math.max(
    0,
    Math.round((reference.getTime() - checkedInAt.getTime()) / 60000),
  );

  return `Na recepcao ha ${waitMinutes} min`;
}

function hasAppointmentStarted(
  appointment: ProfessionalWorkspaceAgendaItem,
  referenceInstant?: string | null,
): boolean {
  const reference = referenceInstant ? new Date(referenceInstant) : new Date();
  const startsAt = new Date(appointment.startsAt);

  if (Number.isNaN(reference.getTime()) || Number.isNaN(startsAt.getTime())) {
    return false;
  }

  return startsAt.getTime() <= reference.getTime();
}

function resolveProfessionalActions(
  appointment: ProfessionalWorkspaceAgendaItem,
  referenceInstant?: string | null,
): Array<{
  status: ProfessionalWorkspaceActionStatus;
  label: string;
  tone: "primary" | "danger";
}> {
  if (!hasAppointmentStarted(appointment, referenceInstant)) {
    return [];
  }

  switch (appointment.status) {
    case "CHECKED_IN":
      return [
        {
          status: "CALLED",
          label: "Chamar paciente",
          tone: "primary",
        },
      ];
    case "CALLED":
      return [
        {
          status: "IN_PROGRESS",
          label: "Iniciar atendimento",
          tone: "primary",
        },
      ];
    case "IN_PROGRESS":
      return [
        {
          status: "AWAITING_CLOSURE",
          label: "Ir para fechamento",
          tone: "primary",
        },
      ];
    case "AWAITING_CLOSURE":
      return [
        {
          status: "AWAITING_PAYMENT",
          label: "Enviar para recepcao",
          tone: "primary",
        },
      ];
    default:
      if (
        ["BOOKED", "CONFIRMED", "RESCHEDULED"].includes(appointment.status)
      ) {
        return [
          {
            status: "NO_SHOW",
            label: "Marcar no-show",
            tone: "danger",
          },
        ];
      }

      return [];
  }
}

function matchesAgendaFilters(
  appointment: ProfessionalWorkspaceAgendaItem,
  filters: {
    search: string;
    status: "ALL" | ProfessionalWorkspaceAppointmentStatus;
    unit: string;
  },
): boolean {
  if (filters.status !== "ALL" && appointment.status !== filters.status) {
    return false;
  }

  if (filters.unit !== "ALL" && (appointment.unitName ?? "Sem unidade") !== filters.unit) {
    return false;
  }

  const search = filters.search.trim().toLowerCase();

  if (!search) {
    return true;
  }

  const searchable = [
    appointment.patientName ?? "",
    appointment.consultationTypeName,
    appointment.unitName ?? "",
    appointment.room ?? "",
    appointment.patientPrimaryContact ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return searchable.includes(search);
}

type EvolutionFieldKey =
  | "objective"
  | "preparation"
  | "intercurrence"
  | "guidance"
  | "nextStep"
  | "freeText";

interface EvolutionDraft {
  objective: string;
  preparation: string;
  intercurrence: string;
  guidance: string;
  nextStep: string;
  freeText: string;
}

const EVOLUTION_FIELDS: Array<{ key: EvolutionFieldKey; label: string }> = [
  { key: "objective", label: "Objetivo estetico" },
  { key: "preparation", label: "Preparacao/pele" },
  { key: "intercurrence", label: "Intercorrencia" },
  { key: "guidance", label: "Orientacao final" },
  { key: "nextStep", label: "Proximo passo" },
  { key: "freeText", label: "Observacao livre" },
];

const EVOLUTION_LABEL_TO_KEY = Object.fromEntries(
  EVOLUTION_FIELDS.map((field) => [field.label, field.key]),
) as Record<string, EvolutionFieldKey>;

function createEmptyEvolutionDraft(): EvolutionDraft {
  return {
    objective: "",
    preparation: "",
    intercurrence: "",
    guidance: "",
    nextStep: "",
    freeText: "",
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseEvolutionDraft(notes: string | null): EvolutionDraft {
  const normalized = notes?.trim();

  if (!normalized) {
    return createEmptyEvolutionDraft();
  }

  const draft = createEmptyEvolutionDraft();
  const sectionPattern = EVOLUTION_FIELDS.map((field) => escapeRegExp(field.label)).join("|");
  const regex = new RegExp(
    `(?:^|\\n\\n)(${sectionPattern}):\\n([\\s\\S]*?)(?=\\n\\n(?:${sectionPattern}):\\n|$)`,
    "g",
  );

  let matchedAnySection = false;

  for (const match of normalized.matchAll(regex)) {
    const key = EVOLUTION_LABEL_TO_KEY[match[1]];

    if (!key) {
      continue;
    }

    draft[key] = match[2].trim();
    matchedAnySection = true;
  }

  if (!matchedAnySection) {
    draft.freeText = normalized;
  }

  return draft;
}

function serializeEvolutionDraft(draft: EvolutionDraft): string {
  return EVOLUTION_FIELDS.map((field) => {
    const value = draft[field.key].trim();

    if (!value) {
      return null;
    }

    return `${field.label}:\n${value}`;
  })
    .filter((section): section is string => Boolean(section))
    .join("\n\n")
    .trim();
}

function buildEvolutionShareText(
  appointment: ProfessionalWorkspaceAgendaItem,
  draft: EvolutionDraft,
  timeZone?: string | null,
): string {
  const sections = [
    `Paciente: ${appointment.patientName ?? "Paciente sem nome"}`,
    `Procedimento: ${appointment.consultationTypeName}`,
    `Horario: ${formatDateTime(appointment.startsAt, { timeZone: timeZone ?? undefined })}`,
    `Unidade/Sala: ${appointment.unitName ?? "Sem unidade"} | ${appointment.room ?? "Sala a definir"}`,
  ];

  const structured = serializeEvolutionDraft(draft);

  if (structured) {
    sections.push(structured);
  }

  return sections.join("\n\n").trim();
}

function getEvolutionPreviewEntries(
  notes: string | null,
): Array<{ label: string; value: string }> {
  const draft = parseEvolutionDraft(notes);

  return EVOLUTION_FIELDS.map((field) => ({
    label: field.label,
    value: draft[field.key].trim(),
  })).filter((entry) => Boolean(entry.value));
}

export default function ProfessionalWorkspacePage() {
  const { user, loading: sessionLoading } = useSession({ expectedProfile: "clinic" });
  const [dashboard, setDashboard] =
    useState<ProfessionalWorkspaceDashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<{
    appointmentId: string;
    status: ProfessionalWorkspaceActionStatus;
  } | null>(null);
  const [selectedPatient, setSelectedPatient] =
    useState<ProfessionalWorkspacePatientSummaryResponse | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [isLoadingPatient, setIsLoadingPatient] = useState(false);
  const [patientError, setPatientError] = useState<string | null>(null);
  const [evolutionDrafts, setEvolutionDrafts] = useState<
    Record<string, EvolutionDraft>
  >({});
  const [activeNoteAppointmentId, setActiveNoteAppointmentId] = useState<string | null>(null);
  const [activeCopyAppointmentId, setActiveCopyAppointmentId] = useState<string | null>(null);
  const [agendaSearch, setAgendaSearch] = useState("");
  const [agendaStatusFilter, setAgendaStatusFilter] = useState<
    "ALL" | ProfessionalWorkspaceAppointmentStatus
  >("ALL");
  const [agendaUnitFilter, setAgendaUnitFilter] = useState("ALL");
  const dashboardTimeZone = dashboard?.timezone;
  const dashboardGeneratedAt = dashboard?.generatedAt;

  const loadDashboard = useCallback(async () => {
    if (!user?.linkedProfessionalId) {
      setDashboard(null);
      setError(
        "Este acesso ainda nao esta vinculado a um perfil profissional ativo nesta clinica.",
      );
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const payload = await getProfessionalWorkspaceDashboard();
      setDashboard(payload);
    } catch (requestError) {
      setDashboard(null);
      setError(
        toErrorMessage(
          requestError,
          "Nao foi possivel carregar a agenda pessoal do profissional.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [user?.linkedProfessionalId]);

  useEffect(() => {
    if (sessionLoading) {
      return;
    }

    void loadDashboard();
  }, [sessionLoading, loadDashboard]);

  useEffect(() => {
    if (!dashboard) {
      setEvolutionDrafts({});
      return;
    }

    setEvolutionDrafts(
      Object.fromEntries(
        dashboard.todayAgenda.map((appointment) => [
          appointment.id,
          parseEvolutionDraft(appointment.notes),
        ]),
      ),
    );
  }, [dashboard]);

  const handleAppointmentAction = useCallback(
    async (
      appointment: ProfessionalWorkspaceAgendaItem,
      status: ProfessionalWorkspaceActionStatus,
    ) => {
      setActiveAction({
        appointmentId: appointment.id,
        status,
      });
      setError(null);
      setFeedback(null);

      try {
        const payload = await updateProfessionalAppointmentStatus(appointment.id, {
          status,
        });
        setDashboard(payload);
        setFeedback(
          status === "NO_SHOW"
            ? `${appointment.patientName ?? "Paciente"} marcado como no-show.`
            : status === "AWAITING_PAYMENT"
              ? `${appointment.patientName ?? "Paciente"} devolvido para recepcao.`
              : `${appointment.patientName ?? "Paciente"} avancou no fluxo do atendimento.`,
        );
      } catch (requestError) {
        setError(
          toErrorMessage(
            requestError,
            "Nao foi possivel atualizar o status do atendimento.",
          ),
        );
      } finally {
        setActiveAction(null);
      }
    },
    [],
  );

  const handleOpenPatient = useCallback(async (patientId: string) => {
    setSelectedPatientId(patientId);
    setSelectedPatient(null);
    setPatientError(null);
    setIsLoadingPatient(true);

    try {
      const payload = await getProfessionalPatientSummary(patientId);
      setSelectedPatient(payload);
    } catch (requestError) {
      setPatientError(
        toErrorMessage(
          requestError,
          "Nao foi possivel carregar o resumo rapido da paciente.",
        ),
      );
    } finally {
      setIsLoadingPatient(false);
    }
  }, []);

  const handleClosePatient = useCallback(() => {
    setSelectedPatientId(null);
    setSelectedPatient(null);
    setPatientError(null);
    setIsLoadingPatient(false);
  }, []);

  const handleSaveNotes = useCallback(
    async (appointment: ProfessionalWorkspaceAgendaItem) => {
      const draft = evolutionDrafts[appointment.id] ?? createEmptyEvolutionDraft();
      const notes = serializeEvolutionDraft(draft);

      setActiveNoteAppointmentId(appointment.id);
      setError(null);
      setFeedback(null);

      try {
        const payload = await updateProfessionalAppointmentNotes(appointment.id, {
          notes: notes.trim() ? notes : undefined,
        });
        setDashboard(payload);
        setFeedback(
          `Anotacoes de ${appointment.patientName ?? "paciente"} atualizadas.`,
        );
      } catch (requestError) {
        setError(
          toErrorMessage(
            requestError,
            "Nao foi possivel salvar as anotacoes do atendimento.",
          ),
        );
      } finally {
        setActiveNoteAppointmentId(null);
      }
    },
    [evolutionDrafts],
  );
  const handleCopySummary = useCallback(
    async (appointment: ProfessionalWorkspaceAgendaItem) => {
      const summary = buildEvolutionShareText(
        appointment,
        evolutionDrafts[appointment.id] ?? createEmptyEvolutionDraft(),
        dashboardTimeZone,
      );

      setActiveCopyAppointmentId(appointment.id);
      setError(null);
      setFeedback(null);

      try {
        await navigator.clipboard.writeText(summary);
        setFeedback(
          `Resumo de ${appointment.patientName ?? "paciente"} copiado.`,
        );
      } catch {
        setError("Nao foi possivel copiar o resumo do atendimento.");
      } finally {
        setTimeout(() => {
          setActiveCopyAppointmentId((current) =>
            current === appointment.id ? null : current,
          );
        }, 1200);
      }
    },
    [dashboardTimeZone, evolutionDrafts],
  );

  const executiveMetrics = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    return [
      {
        label: "Agenda de hoje",
        value: String(dashboard.summary.appointmentsToday),
        helper: "Atendimentos previstos para o dia atual.",
        tone: "accent" as const,
      },
      {
        label: "Restantes hoje",
        value: String(dashboard.summary.remainingToday),
        helper: "Itens ainda vivos na agenda de hoje.",
      },
      {
        label: "Esperando chamada",
        value: String(dashboard.summary.checkedInWaiting),
        helper: "Pacientes ja com check-in aguardando voce.",
        tone:
          dashboard.summary.checkedInWaiting > 0
            ? ("danger" as const)
            : ("default" as const),
      },
      {
        label: "Confirmacao pendente",
        value: String(dashboard.summary.pendingConfirmation),
        helper: "Itens futuros ainda sem confirmacao final.",
      },
      {
        label: "Na recepcao",
        value: String(dashboard.summary.sentToReception),
        helper: "Atendimentos ja devolvidos para pagamento e baixa.",
      },
    ];
  }, [dashboard]);

  const focusAppointment =
    dashboard?.focus.currentAppointment ??
    dashboard?.focus.closingAppointment ??
    dashboard?.focus.calledPatient ??
    dashboard?.focus.waitingPatient ??
    dashboard?.focus.nextAppointment ??
    null;
  const focusLabel =
    dashboard?.focus.currentAppointment
      ? "Atendimento em curso"
      : dashboard?.focus.closingAppointment
        ? "Fechamento clinico"
        : dashboard?.focus.calledPatient
          ? "Paciente chamado"
          : dashboard?.focus.waitingPatient
            ? "Paciente aguardando"
            : dashboard?.focus.nextAppointment
              ? "Proximo atendimento"
              : "Agenda livre";
  const focusSupportText = dashboard?.focus.currentAppointment
    ? `${formatTime(dashboard.focus.currentAppointment.startsAt, {
        timeZone: dashboard.timezone,
      })} | ${dashboard.focus.currentAppointment.consultationTypeName}`
    : dashboard?.focus.closingAppointment
      ? "Finalize as orientacoes e devolva para recepcao."
      : dashboard?.focus.calledPatient
        ? "Paciente ja chamado para sala."
        : dashboard?.focus.waitingPatient
    ? resolveFocusLabel(dashboard.focus.waitingPatient, dashboard.generatedAt)
    : dashboard?.focus.nextAppointment
      ? `${formatTime(dashboard.focus.nextAppointment.startsAt, {
          timeZone: dashboard.timezone,
        })} | ${dashboard.focus.nextAppointment.consultationTypeName}`
      : "Nenhum atendimento pendente na leitura atual.";
  const agendaFilters = useMemo(
    () => ({
      search: agendaSearch,
      status: agendaStatusFilter,
      unit: agendaUnitFilter,
    }),
    [agendaSearch, agendaStatusFilter, agendaUnitFilter],
  );
  const availableAgendaUnits = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    return Array.from(
      new Set(
        [...dashboard.todayAgenda, ...dashboard.upcomingAgenda].map(
          (appointment) => appointment.unitName ?? "Sem unidade",
        ),
      ),
    ).sort((left, right) => left.localeCompare(right));
  }, [dashboard]);
  const filteredTodayAgenda = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    return dashboard.todayAgenda.filter((appointment) =>
      matchesAgendaFilters(appointment, agendaFilters),
    );
  }, [dashboard, agendaFilters]);
  const filteredUpcomingAgenda = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    return dashboard.upcomingAgenda.filter((appointment) =>
      matchesAgendaFilters(appointment, agendaFilters),
    );
  }, [dashboard, agendaFilters]);
  const weeklyOverview = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    const grouped = new Map<
      string,
      {
        dayKey: string;
        dayLabel: string;
        total: number;
        pendingConfirmation: number;
        checkedIn: number;
        completed: number;
        firstStartsAt: string;
        lastEndsAt: string;
      }
    >();

    for (const appointment of [...filteredTodayAgenda, ...filteredUpcomingAgenda]) {
      const dayKey = appointment.startsAt.slice(0, 10);
      const current = grouped.get(dayKey) ?? {
        dayKey,
        dayLabel: formatDateLabel(appointment.startsAt, {
          timeZone: dashboard.timezone,
        }),
        total: 0,
        pendingConfirmation: 0,
        checkedIn: 0,
        completed: 0,
        firstStartsAt: appointment.startsAt,
        lastEndsAt: appointment.endsAt,
      };

      current.total += 1;

      if (appointment.status === "BOOKED" || appointment.status === "RESCHEDULED") {
        current.pendingConfirmation += 1;
      }

      if (appointment.status === "CHECKED_IN") {
        current.checkedIn += 1;
      }

      if (
        appointment.status === "AWAITING_PAYMENT" ||
        appointment.status === "COMPLETED"
      ) {
        current.completed += 1;
      }

      if (appointment.startsAt < current.firstStartsAt) {
        current.firstStartsAt = appointment.startsAt;
      }

      if (appointment.endsAt > current.lastEndsAt) {
        current.lastEndsAt = appointment.endsAt;
      }

      grouped.set(dayKey, current);
    }

    return Array.from(grouped.values()).sort((left, right) =>
      left.dayKey.localeCompare(right.dayKey),
    );
  }, [dashboard, filteredTodayAgenda, filteredUpcomingAgenda]);
  const groupedUpcomingAgenda = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    const groups = new Map<
      string,
      {
        dayKey: string;
        dayLabel: string;
        items: ProfessionalWorkspaceAgendaItem[];
      }
    >();

    for (const appointment of filteredUpcomingAgenda) {
      const dayKey = appointment.startsAt.slice(0, 10);
      const current = groups.get(dayKey) ?? {
        dayKey,
        dayLabel: formatDateLabel(appointment.startsAt, {
          timeZone: dashboard.timezone,
        }),
        items: [],
      };

      current.items.push(appointment);
      groups.set(dayKey, current);
    }

    return Array.from(groups.values());
  }, [dashboard, filteredUpcomingAgenda]);
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clinica | Area do profissional"
        title={
          dashboard?.professional.displayName ??
          user?.fullName ??
          "Workspace do profissional"
        }
        description={
          dashboard
            ? `Leitura pessoal da agenda em ${dashboard.clinicDisplayName ?? "clinica ativa"}, com foco no proximo atendimento e no que ja chegou na recepcao.`
            : "Agenda pessoal, ritmo do dia e sinais do que precisa da sua atencao."
        }
        actions={
          <button
            type="button"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
            onClick={() => {
              void loadDashboard();
            }}
            disabled={isLoading || sessionLoading}
          >
            {isLoading || sessionLoading ? "Atualizando..." : "Atualizar leitura"}
          </button>
        }
      >
        <AdminMetricGrid items={executiveMetrics} isLoading={isLoading && !dashboard} />
        <AdminShortcutPanel
          items={[
            {
              label: "Minha conta",
              description: "Revisar senha, sessao e dados do acesso atual.",
              href: "/clinic/account",
            },
            {
              label: "Atualizar agenda",
              description: "Refazer a leitura da sua agenda e da fila atual.",
              onClick: () => {
                void loadDashboard();
              },
            },
          ]}
        />
      </AdminPageHeader>

      {error ? (
        <Card className="border-rose-200 bg-rose-50" role="alert">
          <p className="text-sm text-rose-700">{error}</p>
        </Card>
      ) : null}

      {feedback ? (
        <Card className="border-emerald-200 bg-emerald-50" role="status">
          <p className="text-sm text-emerald-700">{feedback}</p>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card tone="dark" className="space-y-4 overflow-hidden border-0">
          <div className="absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.22),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.18),_transparent_35%)]" />
          <div className="relative space-y-4">
            <StatusPill
              label={focusLabel}
              tone={dashboard?.focus.waitingPatient ? "danger" : "success"}
            />

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">
                  Painel do dia
                </p>
                <h2 className="mt-3 text-4xl font-semibold tracking-tight">
                  {focusAppointment?.patientName ?? "Sem fila imediata"}
                </h2>
                <p className="mt-3 text-base text-slate-200">
                  {focusAppointment
                    ? `${formatTime(focusAppointment.startsAt, {
                        timeZone: dashboard?.timezone,
                      })} | ${focusAppointment.consultationTypeName}`
                    : "Nenhum atendimento pendente na leitura atual."}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {focusSupportText}
                </p>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">
                  Proxima atualizacao
                </p>
                <p className="mt-3 text-3xl font-semibold">
                  {dashboard
                    ? formatTime(dashboard.generatedAt, { timeZone: dashboard.timezone })
                    : "--"}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Leitura emitida em{" "}
                  {dashboard
                    ? formatDateTime(dashboard.generatedAt, {
                        timeZone: dashboard.timezone,
                      })
                    : "--"}
                  .
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
              Perfil profissional
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Contexto da agenda e da credencial
            </h2>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-ink">
              {dashboard?.professional.fullName ?? user?.fullName ?? "Profissional"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {dashboard?.professional.linkedUser?.email ?? user?.email ?? "--"}
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Credencial interna
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {dashboard?.professional.credential ?? "--"}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                Especialidades
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {dashboard?.professional.specialties.length ? (
                  dashboard.professional.specialties.map((specialty) => (
                    <span
                      key={specialty.id}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
                    >
                      {specialty.name}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-muted">Sem especialidade vinculada.</span>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                Unidades
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {dashboard?.professional.units.length ? (
                  dashboard.professional.units.map((unit) => (
                    <span
                      key={unit.id}
                      className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700"
                    >
                      {unit.name}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-muted">Sem unidade vinculada.</span>
                )}
              </div>
            </div>
          </div>
        </Card>
      </section>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
              Filtros da agenda
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Refine o que precisa de atencao agora
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Busque por paciente, procedimento, contato ou restrinja por status e unidade.
            </p>
          </div>
          <button
            type="button"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
            onClick={() => {
              setAgendaSearch("");
              setAgendaStatusFilter("ALL");
              setAgendaUnitFilter("ALL");
            }}
          >
            Limpar filtros
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr_0.7fr]">
          <input
            value={agendaSearch}
            onChange={(event) => setAgendaSearch(event.target.value)}
            placeholder="Buscar paciente, procedimento, sala ou contato"
            className={adminInputClassName}
          />
          <select
            value={agendaStatusFilter}
            onChange={(event) =>
              setAgendaStatusFilter(
                event.target.value as "ALL" | ProfessionalWorkspaceAppointmentStatus,
              )
            }
            className={adminSelectClassName}
          >
            <option value="ALL">Todos os status</option>
            <option value="BOOKED">Agendado</option>
            <option value="CONFIRMED">Confirmado</option>
            <option value="CHECKED_IN">Check-in feito</option>
            <option value="CALLED">Chamado</option>
            <option value="IN_PROGRESS">Em atendimento</option>
            <option value="AWAITING_CLOSURE">Fechamento</option>
            <option value="AWAITING_PAYMENT">Na recepcao</option>
            <option value="RESCHEDULED">Remarcado</option>
            <option value="COMPLETED">Concluido</option>
            <option value="NO_SHOW">No-show</option>
            <option value="CANCELED">Cancelado</option>
          </select>
          <select
            value={agendaUnitFilter}
            onChange={(event) => setAgendaUnitFilter(event.target.value)}
            className={adminSelectClassName}
          >
            <option value="ALL">Todas as unidades</option>
            {availableAgendaUnits.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2 text-sm text-muted">
          <span className="rounded-full bg-slate-100 px-3 py-1">
            Hoje: {filteredTodayAgenda.length}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1">
            Proximos dias: {filteredUpcomingAgenda.length}
          </span>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
            Ritmo semanal
          </p>
          <h2 className="mt-2 text-xl font-semibold text-ink">
            Como a agenda se distribui nos proximos dias
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Leitura consolidada do recorte atual para antecipar carga, pendencias e janelas.
          </p>
        </div>

        {weeklyOverview.length ? (
          <div className="grid gap-3 xl:grid-cols-4">
            {weeklyOverview.map((day) => (
              <div
                key={day.dayKey}
                className="rounded-[24px] border border-slate-200 bg-white p-4"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {day.dayLabel}
                </p>
                <p className="mt-3 text-3xl font-semibold text-ink">{day.total}</p>
                <p className="mt-1 text-sm text-muted">atendimento(s) no recorte</p>
                <div className="mt-4 space-y-2 text-sm text-muted">
                  <p>
                    Janela:{" "}
                    {formatTime(day.firstStartsAt, {
                      timeZone: dashboardTimeZone,
                    })}{" "}
                    -{" "}
                    {formatTime(day.lastEndsAt, {
                      timeZone: dashboardTimeZone,
                    })}
                  </p>
                  <p>Pendendo confirmar: {day.pendingConfirmation}</p>
                  <p>Check-in feito: {day.checkedIn}</p>
                  <p>Concluidos: {day.completed}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
            <p className="text-base font-semibold text-ink">
              Nenhum dia elegivel no recorte atual
            </p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">
              Ajuste os filtros para voltar a enxergar a distribuicao semanal da agenda.
            </p>
          </div>
        )}
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
                Agenda de hoje
              </p>
              <h2 className="mt-2 text-xl font-semibold text-ink">
                Sequencia dos atendimentos do dia
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Leitura pessoal da sua agenda atual, sem a superficie operacional da recepcao.
              </p>
            </div>
            {dashboard ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {filteredTodayAgenda.length} item(ns)
              </span>
            ) : null}
          </div>

          <div className="space-y-3">
            {filteredTodayAgenda.length ? (
              filteredTodayAgenda.map((appointment) => (
                <div
                  key={appointment.id}
                  className="grid gap-4 rounded-[24px] border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-start gap-2">
                      <StatusPill
                        label={getAppointmentStatusLabel(appointment.status)}
                        tone={getAppointmentStatusTone(appointment.status)}
                      />
                      {appointment.checkedInAt ? (
                        <StatusPill label="Paciente chegou" tone="success" />
                      ) : null}
                      {appointment.hasHistoricalIntercurrence ? (
                        <StatusPill label="Intercorrencia anterior" tone="danger" />
                      ) : null}
                      {appointment.lastPreparationSummary || appointment.lastGuidanceSummary ? (
                        <StatusPill label="Contexto anterior" tone="warning" />
                      ) : null}
                    </div>

                    <p className="mt-3 text-lg font-semibold text-ink">
                      {appointment.patientName ?? "Paciente sem nome"}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {appointment.consultationTypeName}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted">
                      <span>
                        {formatTime(appointment.startsAt, {
                          timeZone: dashboardTimeZone,
                        })}{" "}
                        -{" "}
                        {formatTime(appointment.endsAt, {
                          timeZone: dashboardTimeZone,
                        })}
                      </span>
                      <span>{appointment.unitName ?? "Sem unidade"}</span>
                      <span>{appointment.room ?? "Sala a definir"}</span>
                      {appointment.patientPrimaryContact ? (
                        <span>{appointment.patientPrimaryContact}</span>
                      ) : null}
                      {appointment.patientBirthDate ? (
                        <span>
                          Nasc.{" "}
                          {formatDateLabel(appointment.patientBirthDate, {
                            timeZone: dashboardTimeZone,
                          })}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 space-y-2">
                      {appointment.hasHistoricalIntercurrence ? (
                        <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">
                            Atencao clinica
                          </p>
                          <p className="mt-2 text-sm leading-6 text-rose-800">
                            Ultima intercorrencia registrada em{" "}
                            {appointment.lastIntercurrenceAt
                              ? formatDateTime(appointment.lastIntercurrenceAt, {
                                  timeZone: dashboardTimeZone,
                                })
                              : "data anterior"}.
                          </p>
                          {appointment.lastIntercurrenceSummary ? (
                            <p className="mt-2 text-sm leading-6 text-rose-800">
                              {appointment.lastIntercurrenceSummary}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {appointment.lastPreparationSummary ||
                      appointment.lastGuidanceSummary ? (
                        <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                            Contexto anterior
                          </p>
                          {appointment.lastPreparationSummary ? (
                            <p className="mt-2 text-sm leading-6 text-amber-800">
                              Preparo anterior: {appointment.lastPreparationSummary}
                            </p>
                          ) : null}
                          {appointment.lastGuidanceSummary ? (
                            <p className="mt-2 text-sm leading-6 text-amber-800">
                              Orientacao anterior: {appointment.lastGuidanceSummary}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                        Evolucao guiada de estetica
                      </p>
                      <p className="text-sm text-muted">
                        Registre o essencial do atendimento estetico sem depender de texto solto.
                      </p>
                      <div className="grid gap-3 lg:grid-cols-2">
                        {EVOLUTION_FIELDS.map((field) => (
                          <label
                            key={field.key}
                            className={
                              field.key === "freeText"
                                ? "space-y-2 lg:col-span-2"
                                : "space-y-2"
                            }
                          >
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                              {field.label}
                            </span>
                            <textarea
                              value={
                                evolutionDrafts[appointment.id]?.[field.key] ?? ""
                              }
                              onChange={(event) => {
                                const value = event.target.value;
                                setEvolutionDrafts((current) => ({
                                  ...current,
                                  [appointment.id]: {
                                    ...(current[appointment.id] ??
                                      createEmptyEvolutionDraft()),
                                    [field.key]: value,
                                  },
                                }));
                              }}
                              placeholder={
                                field.key === "freeText"
                                  ? "Anotacao complementar livre, se precisar."
                                  : `Preencha ${field.label.toLowerCase()}.`
                              }
                              className={
                                field.key === "freeText"
                                  ? adminTextareaClassName
                                  : `${adminTextareaClassName} min-h-[92px]`
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <div className="space-y-2 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                            Resumo pronto para copiar
                          </p>
                          <button
                            type="button"
                            className="inline-flex h-9 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => {
                              void handleCopySummary(appointment);
                            }}
                            disabled={activeCopyAppointmentId !== null}
                          >
                            {activeCopyAppointmentId === appointment.id
                              ? "Copiando..."
                              : "Copiar resumo"}
                          </button>
                        </div>
                        <textarea
                          readOnly
                          value={buildEvolutionShareText(
                            appointment,
                            evolutionDrafts[appointment.id] ??
                              createEmptyEvolutionDraft(),
                            dashboardTimeZone,
                          )}
                          className={adminTextareaClassName}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-stretch gap-2 lg:min-w-[220px]">
                    {resolveProfessionalActions(
                      appointment,
                      dashboardGeneratedAt,
                    ).length ? (
                      resolveProfessionalActions(
                        appointment,
                        dashboardGeneratedAt,
                      ).map((action) => {
                        const isSubmitting =
                          activeAction?.appointmentId === appointment.id &&
                          activeAction.status === action.status;

                        return (
                          <button
                            key={action.status}
                            type="button"
                            className={
                              action.tone === "danger"
                                ? "inline-flex h-11 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                : "inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                            }
                            onClick={() => {
                              void handleAppointmentAction(
                                appointment,
                                action.status,
                              );
                            }}
                            disabled={Boolean(activeAction)}
                          >
                            {isSubmitting ? "Salvando..." : action.label}
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-sm text-muted">
                        Sem acao operacional imediata neste item.
                      </div>
                    )}

                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-ink transition hover:bg-slate-100"
                      onClick={() => {
                        void handleOpenPatient(appointment.patientId);
                      }}
                    >
                      Ver paciente
                    </button>

                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => {
                        void handleSaveNotes(appointment);
                      }}
                      disabled={
                        activeNoteAppointmentId !== null ||
                        serializeEvolutionDraft(
                          evolutionDrafts[appointment.id] ??
                            createEmptyEvolutionDraft(),
                        ) === (appointment.notes ?? "").trim()
                      }
                    >
                      {activeNoteAppointmentId === appointment.id
                        ? "Salvando..."
                        : "Salvar anotacoes"}
                    </button>

                    <Link
                      href="/clinic/account"
                      className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
                    >
                      Minha conta
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                <p className="text-base font-semibold text-ink">
                  Nenhum atendimento encontrado para o recorte atual
                </p>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">
                  Ajuste busca, status ou unidade para voltar ao panorama completo da sua agenda de hoje.
                </p>
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
                Proximos dias
              </p>
              <h2 className="mt-2 text-xl font-semibold text-ink">
                Horizonte curto da agenda
              </h2>
            </div>

            <div className="space-y-3">
              {groupedUpcomingAgenda.length ? (
                groupedUpcomingAgenda.map((group) => (
                  <div
                    key={group.dayKey}
                    className="rounded-[24px] border border-slate-200 bg-white p-4"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                      {group.dayLabel}
                    </p>
                    <div className="mt-3 space-y-3">
                      {group.items.map((appointment) => (
                        <div
                          key={appointment.id}
                          className="rounded-[20px] border border-slate-100 bg-slate-50 px-3 py-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-ink">
                                {appointment.patientName ?? "Paciente sem nome"}
                              </p>
                              <p className="mt-1 text-sm text-muted">
                                {appointment.consultationTypeName}
                              </p>
                            </div>
                            <StatusPill
                              label={getAppointmentStatusLabel(appointment.status)}
                              tone={getAppointmentStatusTone(appointment.status)}
                            />
                          </div>
                          <p className="mt-3 text-sm text-muted">
                            {formatTime(appointment.startsAt, {
                              timeZone: dashboardTimeZone,
                            })}{" "}
                            -{" "}
                            {formatTime(appointment.endsAt, {
                              timeZone: dashboardTimeZone,
                            })}
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            {appointment.unitName ?? "Sem unidade"} |{" "}
                            {appointment.room ?? "Sala a definir"}
                          </p>
                          {(appointment.patientPrimaryContact ||
                            appointment.patientBirthDate) ? (
                            <p className="mt-1 text-sm text-muted">
                              {appointment.patientPrimaryContact
                                ? appointment.patientPrimaryContact
                                : "Sem contato principal"}
                              {appointment.patientBirthDate
                                ? ` | Nasc. ${formatDateLabel(
                                    appointment.patientBirthDate,
                                    {
                                      timeZone: dashboardTimeZone,
                                    },
                                  )}`
                                : ""}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">
                  Nenhum atendimento futuro relevante nos proximos dias.
                </p>
              )}
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
                Concluidos recentes
              </p>
              <h2 className="mt-2 text-xl font-semibold text-ink">
                O que ja foi atendido hoje
              </h2>
            </div>

            <div className="space-y-3">
              {dashboard?.recentCompleted.length ? (
                dashboard.recentCompleted.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-4"
                  >
                    <p className="text-sm font-semibold text-ink">
                      {appointment.patientName ?? "Paciente sem nome"}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {appointment.consultationTypeName}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {formatTime(appointment.startsAt, {
                        timeZone: dashboard.timezone,
                      })}{" "}
                      -{" "}
                      {formatTime(appointment.endsAt, {
                        timeZone: dashboard.timezone,
                      })}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">
                  Nenhum atendimento concluido ainda nesta data.
                </p>
              )}
            </div>
          </Card>
        </div>
      </section>

      <Sheet
        open={Boolean(selectedPatientId)}
        onClose={handleClosePatient}
        title={selectedPatient?.patient.fullName ?? "Ficha rapida da paciente"}
        description={
          selectedPatient
            ? "Contato principal, observacoes e historico recente para apoiar o atendimento."
            : "Resumo rapido da paciente vinculada ao atendimento."
        }
      >
        {isLoadingPatient ? (
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-muted">
            Carregando resumo da paciente...
          </div>
        ) : patientError ? (
          <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
            {patientError}
          </div>
        ) : selectedPatient ? (
          <div className="space-y-4">
            <Card className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Dados principais
                </p>
                <h3 className="mt-2 text-xl font-semibold text-ink">
                  {selectedPatient.patient.fullName ?? "Paciente sem nome"}
                </h3>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Nascimento
                  </p>
                  <p className="mt-1 text-sm text-ink">
                    {selectedPatient.patient.birthDate
                      ? formatDateLabel(selectedPatient.patient.birthDate, {
                          timeZone: dashboardTimeZone,
                        })
                      : "--"}
                  </p>
                </div>
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Documento
                  </p>
                  <p className="mt-1 text-sm text-ink">
                    {selectedPatient.patient.documentNumber ?? "--"}
                  </p>
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Contatos
                </p>
                <div className="mt-2 space-y-2">
                  {selectedPatient.patient.contacts.length ? (
                    selectedPatient.patient.contacts.map((contact) => (
                      <p key={`${contact.type}-${contact.value}`} className="text-sm text-ink">
                        {contact.type === "WHATSAPP" ? "WhatsApp" : "Telefone"}: {contact.value}
                        {contact.isPrimary ? " | principal" : ""}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-muted">Sem contato cadastrado.</p>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Com voce
                  </p>
                  <p className="mt-1 text-lg font-semibold text-ink">
                    {selectedPatient.relationship.appointmentsWithProfessional}
                  </p>
                </div>
                <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Ultima passagem
                  </p>
                  <p className="mt-1 text-sm text-ink">
                    {selectedPatient.relationship.lastSeenAt
                      ? formatDateTime(selectedPatient.relationship.lastSeenAt, {
                          timeZone: dashboardTimeZone,
                        })
                      : "--"}
                  </p>
                </div>
                <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Proximo agendamento
                  </p>
                  <p className="mt-1 text-sm text-ink">
                    {selectedPatient.relationship.nextAppointmentAt
                      ? formatDateTime(selectedPatient.relationship.nextAppointmentAt, {
                          timeZone: dashboardTimeZone,
                        })
                      : "--"}
                  </p>
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Observacoes
                </p>
                <p className="mt-2 text-sm leading-6 text-ink">
                  {selectedPatient.patient.notes?.trim() || "Sem observacoes registradas."}
                </p>
              </div>

              {selectedPatient.alerts.hasHistoricalIntercurrence ? (
                <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">
                    Alerta de intercorrencia
                  </p>
                  <p className="mt-2 text-sm leading-6 text-rose-800">
                    Ultimo registro em{" "}
                    {selectedPatient.alerts.lastIntercurrenceAt
                      ? formatDateTime(selectedPatient.alerts.lastIntercurrenceAt, {
                          timeZone: dashboardTimeZone,
                        })
                      : "data anterior"}
                    .
                  </p>
                  {selectedPatient.alerts.lastIntercurrenceSummary ? (
                    <p className="mt-2 text-sm leading-6 text-rose-800">
                      {selectedPatient.alerts.lastIntercurrenceSummary}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {selectedPatient.alerts.lastPreparationSummary ||
              selectedPatient.alerts.lastGuidanceSummary ? (
                <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Preparo e orientacao anteriores
                  </p>
                  {selectedPatient.alerts.lastPreparationSummary ? (
                    <p className="mt-2 text-sm leading-6 text-amber-800">
                      Preparo: {selectedPatient.alerts.lastPreparationSummary}
                    </p>
                  ) : null}
                  {selectedPatient.alerts.lastGuidanceSummary ? (
                    <p className="mt-2 text-sm leading-6 text-amber-800">
                      Orientacao: {selectedPatient.alerts.lastGuidanceSummary}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </Card>

            <Card className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Historico recente
                </p>
                <h3 className="mt-2 text-lg font-semibold text-ink">
                  Ultimos atendimentos na clinica
                </h3>
              </div>

              <div className="space-y-3">
                {selectedPatient.recentAppointments.length ? (
                  selectedPatient.recentAppointments.map((appointment) => (
                    <div
                      key={appointment.id}
                      className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">
                            {appointment.consultationTypeName}
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            {appointment.professionalName}
                          </p>
                        </div>
                        <StatusPill
                          label={getAppointmentStatusLabel(appointment.status)}
                          tone={getAppointmentStatusTone(appointment.status)}
                        />
                      </div>
                      <p className="mt-3 text-sm text-muted">
                        {formatDateTime(appointment.startsAt, {
                          timeZone: dashboardTimeZone,
                        })}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {appointment.unitName ?? "Sem unidade"} |{" "}
                        {appointment.room ?? "Sala a definir"}
                      </p>

                      {getEvolutionPreviewEntries(appointment.notes).length ? (
                        <div className="mt-3 rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                            Evolucao registrada
                          </p>
                          <div className="mt-2 space-y-2">
                            {getEvolutionPreviewEntries(appointment.notes).map((entry) => (
                              <div key={`${appointment.id}-${entry.label}`}>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                                  {entry.label}
                                </p>
                                <p className="mt-1 text-sm leading-6 text-ink">
                                  {entry.value}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-[18px] border border-dashed border-slate-200 px-3 py-3 text-sm text-muted">
                          Sem evolucao registrada nesse atendimento.
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-[20px] border border-dashed border-slate-200 px-4 py-4 text-sm text-muted">
                    Sem historico recente para esta paciente.
                  </div>
                )}
              </div>
            </Card>
          </div>
        ) : (
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-muted">
            Selecione uma paciente da agenda para abrir a ficha rapida.
          </div>
        )}
      </Sheet>
    </div>
  );
}
