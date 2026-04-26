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
import { toErrorMessage } from "@/lib/client/http";
import {
  ConsultationTypeResponse,
  ProcedureProtocolResponse,
  createConsultationType,
  createProcedureProtocol,
  listConsultationTypes,
  listProcedureProtocols,
  updateConsultationType,
  updateProcedureProtocol,
} from "@/lib/client/clinic-structure-api";
import { formatDateTime } from "@/lib/formatters";

interface ConsultationTypeFormState {
  name: string;
  durationMinutes: string;
  bufferBeforeMinutes: string;
  bufferAfterMinutes: string;
  isFirstVisit: boolean;
  isReturnVisit: boolean;
  isOnline: boolean;
  isActive: boolean;
  aestheticArea: AestheticArea;
  invasivenessLevel: InvasivenessLevel;
  recoveryDays: string;
  recommendedFrequencyDays: string;
  preparationNotes: string;
  contraindications: string;
  aftercareGuidance: string;
}

interface ProcedureProtocolFormState {
  name: string;
  description: string;
  totalSessions: string;
  intervalBetweenSessionsDays: string;
  isActive: boolean;
}

type AestheticArea = "FACIAL" | "CORPORAL" | "CAPILAR" | "LASER" | "HARMONIZACAO_OROFACIAL" | "PEELING" | "OUTRO" | null;
type InvasivenessLevel =
  | "NON_INVASIVE"
  | "MINIMALLY_INVASIVE"
  | "MODERATELY_INVASIVE"
  | "HIGHLY_INVASIVE"
  | "SURGICAL"
  | null;

const AESTHETIC_AREA_LABELS: Record<string, string> = {
  FACIAL: "Facial",
  CORPORAL: "Corporal",
  CAPILAR: "Capilar",
  LASER: "Laser",
  HARMONIZACAO_OROFACIAL: "Harmonização Orofacial",
  PEELING: "Peeling",
  OUTRO: "Outro",
};

const INVASIVENESS_LEVEL_LABELS: Record<Exclude<InvasivenessLevel, null>, string> = {
  NON_INVASIVE: "Nao invasivo",
  MINIMALLY_INVASIVE: "Minimamente invasivo",
  MODERATELY_INVASIVE: "Moderadamente invasivo",
  HIGHLY_INVASIVE: "Altamente invasivo",
  SURGICAL: "Cirurgico",
};

const defaultForm: ConsultationTypeFormState = {
  name: "",
  durationMinutes: "30",
  bufferBeforeMinutes: "0",
  bufferAfterMinutes: "0",
  isFirstVisit: false,
  isReturnVisit: false,
  isOnline: false,
  isActive: true,
  aestheticArea: null,
  invasivenessLevel: null,
  recoveryDays: "",
  recommendedFrequencyDays: "",
  preparationNotes: "",
  contraindications: "",
  aftercareGuidance: "",
};

const MAX_BUFFER_MINUTES = 240;

const AESTHETIC_PROCEDURE_PRESETS: Array<{
  name: string;
  durationMinutes: string;
  isFirstVisit?: boolean;
  isReturnVisit?: boolean;
}> = [
  { name: "Avaliacao estetica", durationMinutes: "30", isFirstVisit: true },
  { name: "Retorno estetico", durationMinutes: "20", isReturnVisit: true },
  { name: "Toxina botulinica", durationMinutes: "30" },
  { name: "Bioestimulador de colageno", durationMinutes: "45" },
  { name: "Preenchimento facial", durationMinutes: "45" },
  { name: "Peeling quimico", durationMinutes: "40" },
];

const DEFAULT_PROTOCOL_INTERVAL_DAYS = 30;

function buildEditForm(
  consultationType: ConsultationTypeResponse,
): ConsultationTypeFormState {
  return {
    name: consultationType.name,
    durationMinutes: String(consultationType.durationMinutes),
    bufferBeforeMinutes: String(consultationType.bufferBeforeMinutes),
    bufferAfterMinutes: String(consultationType.bufferAfterMinutes),
    isFirstVisit: consultationType.isFirstVisit,
    isReturnVisit: consultationType.isReturnVisit,
    isOnline: consultationType.isOnline,
    isActive: consultationType.isActive,
    aestheticArea: (consultationType.aestheticArea as AestheticArea) ?? null,
    invasivenessLevel:
      (consultationType.invasivenessLevel as InvasivenessLevel) ?? null,
    recoveryDays:
      consultationType.recoveryDays !== null && consultationType.recoveryDays !== undefined
        ? String(consultationType.recoveryDays)
        : "",
    recommendedFrequencyDays:
      consultationType.recommendedFrequencyDays !== null &&
      consultationType.recommendedFrequencyDays !== undefined
        ? String(consultationType.recommendedFrequencyDays)
        : "",
    preparationNotes: consultationType.preparationNotes ?? "",
    contraindications: consultationType.contraindications ?? "",
    aftercareGuidance: consultationType.aftercareGuidance ?? "",
  };
}

function parseNonNegativeInt(
  value: string,
  field: string,
  maxValue?: number,
): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${field} precisa ser inteiro >= 0.`);
  }

  if (maxValue !== undefined && parsed > maxValue) {
    throw new Error(`${field} precisa ser <= ${maxValue}.`);
  }

  return parsed;
}

function parseOptionalPositiveInt(
  value: string,
  field: string,
): number | null {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${field} precisa ser inteiro >= 0.`);
  }

  return parsed;
}

function getProcedureOperationalHighlights(
  consultationType: ConsultationTypeResponse,
): string[] {
  const highlights: string[] = [];

  if (consultationType.preparationNotes) {
    highlights.push("Preparo definido");
  }

  if (consultationType.contraindications) {
    highlights.push("Contraindicacoes registradas");
  }

  if (consultationType.aftercareGuidance) {
    highlights.push("Pos-procedimento definido");
  }

  return highlights;
}

function buildSuggestedProtocolForm(
  consultationType: ConsultationTypeResponse,
): ProcedureProtocolFormState {
  const totalSessions =
    consultationType.isFirstVisit || consultationType.isReturnVisit
      ? "1"
      : consultationType.invasivenessLevel === "HIGHLY_INVASIVE" ||
          consultationType.invasivenessLevel === "SURGICAL"
        ? "1"
        : consultationType.aestheticArea === "LASER"
          ? "6"
          : consultationType.aestheticArea === "PEELING"
            ? "4"
            : consultationType.aestheticArea === "CAPILAR"
              ? "6"
              : "3";

  const intervalBetweenSessionsDays =
    consultationType.recommendedFrequencyDays && consultationType.recommendedFrequencyDays > 0
      ? String(consultationType.recommendedFrequencyDays)
      : consultationType.recoveryDays && consultationType.recoveryDays > 0
        ? String(Math.max(consultationType.recoveryDays, 7))
        : String(DEFAULT_PROTOCOL_INTERVAL_DAYS);

  const descriptionParts = [
    consultationType.preparationNotes
      ? `Preparo base: ${consultationType.preparationNotes}`
      : null,
    consultationType.contraindications
      ? `Contraindicacoes resumidas: ${consultationType.contraindications}`
      : null,
    consultationType.aftercareGuidance
      ? `Pos-procedimento padrao: ${consultationType.aftercareGuidance}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return {
    name:
      consultationType.isFirstVisit || consultationType.isReturnVisit
        ? `${consultationType.name} - fluxo guiado`
        : `${consultationType.name} - protocolo base`,
    description: descriptionParts.join("\n\n"),
    totalSessions,
    intervalBetweenSessionsDays,
    isActive: true,
  };
}

function buildProtocolEditForm(
  protocol: ProcedureProtocolResponse,
): ProcedureProtocolFormState {
  return {
    name: protocol.name,
    description: protocol.description ?? "",
    totalSessions: String(protocol.totalSessions),
    intervalBetweenSessionsDays: String(protocol.intervalBetweenSessionsDays),
    isActive: protocol.isActive,
  };
}

export default function ClinicConsultationTypesPage() {
  const { user } = useSession({ expectedProfile: "clinic" });
  const canManage = useMemo(() => {
    if (!user) {
      return false;
    }

    return (
      user.roles.includes("TENANT_ADMIN") || user.roles.includes("CLINIC_MANAGER")
    );
  }, [user]);

  const [consultationTypes, setConsultationTypes] = useState<ConsultationTypeResponse[]>(
    [],
  );
  const [procedureProtocols, setProcedureProtocols] = useState<
    ProcedureProtocolResponse[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [aestheticAreaFilter, setAestheticAreaFilter] = useState<AestheticArea>(null);

  const [createForm, setCreateForm] = useState<ConsultationTypeFormState>(defaultForm);
  const [isCreating, setIsCreating] = useState(false);

  const [selectedConsultationTypeId, setSelectedConsultationTypeId] = useState<
    string | null
  >(null);
  const [editForm, setEditForm] = useState<ConsultationTypeFormState | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [createProtocolForm, setCreateProtocolForm] =
    useState<ProcedureProtocolFormState | null>(null);
  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(null);
  const [editProtocolForm, setEditProtocolForm] =
    useState<ProcedureProtocolFormState | null>(null);
  const [isCreatingProtocol, setIsCreatingProtocol] = useState(false);
  const [isUpdatingProtocol, setIsUpdatingProtocol] = useState(false);

  // Filter procedures by aesthetic area
  const filteredConsultationTypes = useMemo(
    () =>
      aestheticAreaFilter
        ? consultationTypes.filter((item) => item.aestheticArea === aestheticAreaFilter)
        : consultationTypes,
    [consultationTypes, aestheticAreaFilter],
  );

  const selectedConsultationType = useMemo(
    () =>
      consultationTypes.find((item) => item.id === selectedConsultationTypeId) ?? null,
    [consultationTypes, selectedConsultationTypeId],
  );

  const selectedProcedureProtocols = useMemo(
    () =>
      selectedConsultationTypeId
        ? procedureProtocols.filter(
            (item) => item.consultationTypeId === selectedConsultationTypeId,
          )
        : [],
    [procedureProtocols, selectedConsultationTypeId],
  );

  const selectedProtocol = useMemo(
    () =>
      selectedProcedureProtocols.find((item) => item.id === selectedProtocolId) ?? null,
    [selectedProcedureProtocols, selectedProtocolId],
  );

  const availableAestheticAreas = useMemo(
    () =>
      Array.from(
        new Set(
          consultationTypes
            .map((item) => item.aestheticArea)
            .filter((area): area is AestheticArea => area !== null),
        ),
      ).sort(),
    [consultationTypes],
  );

  const loadConsultationTypes = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextConsultationTypes, nextProcedureProtocols] = await Promise.all([
        listConsultationTypes(),
        listProcedureProtocols(),
      ]);
      setConsultationTypes(nextConsultationTypes);
      setProcedureProtocols(nextProcedureProtocols);
      setSelectedConsultationTypeId((current) => {
        if (current && nextConsultationTypes.some((item) => item.id === current)) {
          return current;
        }

        return nextConsultationTypes[0]?.id ?? null;
      });
    } catch (requestError) {
      setError(
        toErrorMessage(requestError, "Nao foi possivel carregar procedimentos esteticos."),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConsultationTypes();
  }, [loadConsultationTypes]);

  useEffect(() => {
    if (!selectedConsultationType) {
      setEditForm(null);
      setCreateProtocolForm(null);
      setSelectedProtocolId(null);
      setEditProtocolForm(null);
      return;
    }

    setEditForm(buildEditForm(selectedConsultationType));
    setCreateProtocolForm(buildSuggestedProtocolForm(selectedConsultationType));
  }, [selectedConsultationType]);

  useEffect(() => {
    if (selectedProcedureProtocols.length === 0) {
      setSelectedProtocolId(null);
      setEditProtocolForm(null);
      return;
    }

    setSelectedProtocolId((current) => {
      if (current && selectedProcedureProtocols.some((item) => item.id === current)) {
        return current;
      }

      return selectedProcedureProtocols[0]?.id ?? null;
    });
  }, [selectedProcedureProtocols]);

  useEffect(() => {
    if (!selectedProtocol) {
      setEditProtocolForm(null);
      return;
    }

    setEditProtocolForm(buildProtocolEditForm(selectedProtocol));
  }, [selectedProtocol]);

  const consultationTypeMetrics = useMemo(() => {
    const activeCount = filteredConsultationTypes.filter((item) => item.isActive).length;
    const onlineCount = filteredConsultationTypes.filter((item) => item.isOnline).length;
    const withRecoveryCount = filteredConsultationTypes.filter(
      (item) => item.recoveryDays && item.recoveryDays > 0,
    ).length;
    const protocolCount = filteredConsultationTypes.reduce((count, item) => {
      return (
        count +
        procedureProtocols.filter((protocol) => protocol.consultationTypeId === item.id).length
      );
    }, 0);

    return [
      {
        label: "Tipos",
        value: String(filteredConsultationTypes.length),
        helper: `Procedimentos ${aestheticAreaFilter ? `de ${AESTHETIC_AREA_LABELS[aestheticAreaFilter]?.toLowerCase()}` : "esteticos"} cadastrados.`,
      },
      {
        label: "Ativos",
        value: String(activeCount),
        helper: "Disponiveis para uso agora.",
        tone: "accent" as const,
      },
      {
        label: "Protocolos",
        value: String(protocolCount),
        helper: "Fluxos de sessoes ligados aos procedimentos do recorte.",
      },
      {
        label: "Com recuperacao",
        value: String(withRecoveryCount),
        helper: "Procedimentos que requerem tempo de recuperacao.",
      },
      {
        label: "Online",
        value: String(onlineCount),
        helper: "Formatos que atendem remoto.",
      },
    ];
  }, [filteredConsultationTypes, aestheticAreaFilter, procedureProtocols]);

  const shortcutItems = useMemo(
    () => [
      {
        label: "Novo tipo",
        description: "Ir direto para o cadastro.",
        href: "#novo-tipo",
      },
      {
        label: "Recepcao",
        description: "Voltar para agenda e execucao da recepcao.",
        href: "/clinic/reception",
      },
      {
        label: "Profissionais",
        description: "Cruzar equipe e agenda.",
        href: "/clinic/professionals",
      },
    ],
    [],
  );

  async function handleCreateConsultationType(
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
      const durationMinutes = parseNonNegativeInt(createForm.durationMinutes, "Duracao");
      const bufferBeforeMinutes = parseNonNegativeInt(
        createForm.bufferBeforeMinutes,
        "Buffer antes",
        MAX_BUFFER_MINUTES,
      );
      const bufferAfterMinutes = parseNonNegativeInt(
        createForm.bufferAfterMinutes,
        "Buffer depois",
        MAX_BUFFER_MINUTES,
      );

      if (durationMinutes <= 0) {
        throw new Error("Duracao precisa ser maior que zero.");
      }

      await createConsultationType({
        name: createForm.name.trim(),
        durationMinutes,
        bufferBeforeMinutes,
        bufferAfterMinutes,
        isFirstVisit: createForm.isFirstVisit,
        isReturnVisit: createForm.isReturnVisit,
        isOnline: createForm.isOnline,
        isActive: createForm.isActive,
        aestheticArea: createForm.aestheticArea,
        invasivenessLevel: createForm.invasivenessLevel,
        recoveryDays: parseOptionalPositiveInt(createForm.recoveryDays, "Recuperacao"),
        recommendedFrequencyDays: parseOptionalPositiveInt(
          createForm.recommendedFrequencyDays,
          "Frequencia recomendada",
        ),
        preparationNotes: createForm.preparationNotes.trim() || null,
        contraindications: createForm.contraindications.trim() || null,
        aftercareGuidance: createForm.aftercareGuidance.trim() || null,
      });

      setCreateForm(defaultForm);
      setSuccess("Procedimento estetico criado com sucesso.");
      await loadConsultationTypes();
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao criar procedimento estetico."));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdateConsultationType(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!canManage || !selectedConsultationType || !editForm) {
      return;
    }

    setIsUpdating(true);
    setError(null);
    setSuccess(null);

    try {
      const durationMinutes = parseNonNegativeInt(editForm.durationMinutes, "Duracao");
      const bufferBeforeMinutes = parseNonNegativeInt(
        editForm.bufferBeforeMinutes,
        "Buffer antes",
        MAX_BUFFER_MINUTES,
      );
      const bufferAfterMinutes = parseNonNegativeInt(
        editForm.bufferAfterMinutes,
        "Buffer depois",
        MAX_BUFFER_MINUTES,
      );

      if (durationMinutes <= 0) {
        throw new Error("Duracao precisa ser maior que zero.");
      }

      const updatedItem = await updateConsultationType(selectedConsultationType.id, {
        name: editForm.name.trim(),
        durationMinutes,
        bufferBeforeMinutes,
        bufferAfterMinutes,
        isFirstVisit: editForm.isFirstVisit,
        isReturnVisit: editForm.isReturnVisit,
        isOnline: editForm.isOnline,
        isActive: editForm.isActive,
        aestheticArea: editForm.aestheticArea,
        invasivenessLevel: editForm.invasivenessLevel,
        recoveryDays: parseOptionalPositiveInt(editForm.recoveryDays, "Recuperacao"),
        recommendedFrequencyDays: parseOptionalPositiveInt(
          editForm.recommendedFrequencyDays,
          "Frequencia recomendada",
        ),
        preparationNotes: editForm.preparationNotes.trim() || null,
        contraindications: editForm.contraindications.trim() || null,
        aftercareGuidance: editForm.aftercareGuidance.trim() || null,
      });

      setConsultationTypes((currentItems) =>
        currentItems.map((item) => (item.id === updatedItem.id ? updatedItem : item)),
      );
      setSuccess("Procedimento estetico atualizado.");
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao atualizar procedimento estetico."));
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleCreateProcedureProtocol(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!canManage || !selectedConsultationType || !createProtocolForm) {
      return;
    }

    setIsCreatingProtocol(true);
    setError(null);
    setSuccess(null);

    try {
      const totalSessions = parseNonNegativeInt(
        createProtocolForm.totalSessions,
        "Total de sessoes",
      );
      const intervalBetweenSessionsDays = parseNonNegativeInt(
        createProtocolForm.intervalBetweenSessionsDays,
        "Intervalo entre sessoes",
      );

      if (totalSessions <= 0 || intervalBetweenSessionsDays <= 0) {
        throw new Error("Sessoes e intervalo precisam ser maiores que zero.");
      }

      const createdProtocol = await createProcedureProtocol({
        consultationTypeId: selectedConsultationType.id,
        name: createProtocolForm.name.trim(),
        description: createProtocolForm.description.trim() || undefined,
        totalSessions,
        intervalBetweenSessionsDays,
        isActive: createProtocolForm.isActive,
      });

      setProcedureProtocols((current) =>
        [...current, createdProtocol].sort((left, right) => {
          if (left.consultationTypeId !== right.consultationTypeId) {
            return left.consultationTypeId.localeCompare(right.consultationTypeId);
          }

          return left.name.localeCompare(right.name);
        }),
      );
      setSelectedProtocolId(createdProtocol.id);
      setCreateProtocolForm(buildSuggestedProtocolForm(selectedConsultationType));
      setSuccess("Protocolo estetico criado.");
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao criar protocolo estetico."));
    } finally {
      setIsCreatingProtocol(false);
    }
  }

  async function handleUpdateProcedureProtocol(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!canManage || !selectedProtocol || !editProtocolForm) {
      return;
    }

    setIsUpdatingProtocol(true);
    setError(null);
    setSuccess(null);

    try {
      const totalSessions = parseNonNegativeInt(
        editProtocolForm.totalSessions,
        "Total de sessoes",
      );
      const intervalBetweenSessionsDays = parseNonNegativeInt(
        editProtocolForm.intervalBetweenSessionsDays,
        "Intervalo entre sessoes",
      );

      if (totalSessions <= 0 || intervalBetweenSessionsDays <= 0) {
        throw new Error("Sessoes e intervalo precisam ser maiores que zero.");
      }

      const updatedProtocol = await updateProcedureProtocol(selectedProtocol.id, {
        consultationTypeId: selectedProtocol.consultationTypeId,
        name: editProtocolForm.name.trim(),
        description: editProtocolForm.description.trim() || undefined,
        totalSessions,
        intervalBetweenSessionsDays,
        isActive: editProtocolForm.isActive,
      });

      setProcedureProtocols((current) =>
        current.map((item) => (item.id === updatedProtocol.id ? updatedProtocol : item)),
      );
      setSuccess("Protocolo estetico atualizado.");
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao atualizar protocolo estetico."));
    } finally {
      setIsUpdatingProtocol(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clinica | Procedimentos e avaliacoes"
        title="Procedimentos e avaliacoes"
        description="Avaliacoes, sessoes e procedimentos esteticos organizados com duracao, buffers e leitura operacional."
        actions={
          <Button
            type="button"
            className="border border-slate-200 bg-white text-ink hover:bg-slate-50"
            onClick={() => {
              void loadConsultationTypes();
            }}
            disabled={isLoading}
          >
            {isLoading ? "Atualizando..." : "Atualizar procedimentos"}
          </Button>
        }
      >
        <AdminMetricGrid items={consultationTypeMetrics} isLoading={isLoading && consultationTypes.length === 0} />
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
            eyebrow="Agenda"
            title="Catalogo de procedimentos"
            description="Veja rapidamente duracao, buffers e o papel de cada avaliacao ou procedimento estetico."
            actions={<AdminCountBadge value={filteredConsultationTypes.length} loading={isLoading} />}
          />

          {availableAestheticAreas.length > 0 && (
            <div className="space-y-2 border-b border-slate-200 pb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Filtrar por Area Estetica
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAestheticAreaFilter(null)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                    aestheticAreaFilter === null
                      ? "bg-teal-100 text-teal-700"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Todos ({consultationTypes.length})
                </button>
                {availableAestheticAreas.map((area, index) => {
                  const count = consultationTypes.filter((item) => item.aestheticArea === area)
                    .length;
                  return (
                    <button
                      key={`aesthetic-area-${String(area)}-${index}`}
                      type="button"
                      onClick={() => setAestheticAreaFilter(area)}
                      className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                        aestheticAreaFilter === area
                          ? "bg-teal-100 text-teal-700"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {AESTHETIC_AREA_LABELS[area as string]} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {isLoading && consultationTypes.length === 0 ? (
              Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="animate-pulse rounded-[24px] border border-slate-200 bg-white p-4">
                  <div className="h-4 w-40 rounded-full bg-slate-200" />
                  <div className="mt-3 h-3 w-28 rounded-full bg-slate-100" />
                  <div className="mt-4 h-3 w-52 rounded-full bg-slate-100" />
                </div>
              ))
            ) : filteredConsultationTypes.length > 0 ? (
              filteredConsultationTypes.map((item) => {
                const isSelected = selectedConsultationTypeId === item.id;
                const operationalHighlights = getProcedureOperationalHighlights(item);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedConsultationTypeId(item.id)}
                    className={`w-full rounded-[24px] border p-4 text-left transition ${
                      isSelected
                        ? "border-teal-300 bg-teal-50 shadow-sm"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-ink">{item.name}</p>
                          {item.aestheticArea && (
                            <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
                              {AESTHETIC_AREA_LABELS[item.aestheticArea]}
                            </span>
                          )}
                          <StatusPill
                            label={item.isActive ? "Ativo" : "Inativo"}
                            tone={item.isActive ? "success" : "warning"}
                          />
                          <StatusPill
                            label={item.isOnline ? "Online" : "Presencial"}
                            tone={item.isOnline ? "neutral" : "success"}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted">
                          <span>{item.durationMinutes} min</span>
                          <span>Antes {item.bufferBeforeMinutes} min</span>
                          <span>Depois {item.bufferAfterMinutes} min</span>
                          {item.invasivenessLevel && (
                            <span className="font-medium text-slate-700">
                              {INVASIVENESS_LEVEL_LABELS[
                                item.invasivenessLevel as Exclude<InvasivenessLevel, null>
                              ] ?? item.invasivenessLevel}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted">
                          <span>
                            {item.isFirstVisit
                              ? "Primeira avaliacao"
                              : item.isReturnVisit
                                ? "Sessao de retorno"
                                : "Procedimento regular"}
                          </span>
                          {item.recoveryDays && item.recoveryDays > 0 && (
                            <span className="font-medium text-orange-600">Recuperacao: {item.recoveryDays}d</span>
                          )}
                          {item.recommendedFrequencyDays && (
                            <span className="text-slate-500">Frequencia: {item.recommendedFrequencyDays}d</span>
                          )}
                        </div>
                        {operationalHighlights.length > 0 ? (
                          <div className="flex flex-wrap gap-2 text-xs">
                            {operationalHighlights.map((highlight) => (
                              <span
                                key={`${item.id}-${highlight}`}
                                className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600"
                              >
                                {highlight}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="space-y-2 text-sm text-muted lg:text-right">
                        <p>Atualizado em {formatDateTime(item.updatedAt)}</p>
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
                title={aestheticAreaFilter ? `Nenhum procedimento em ${AESTHETIC_AREA_LABELS[aestheticAreaFilter]}` : "Nenhum procedimento cadastrado"}
                description={aestheticAreaFilter ? "Tente outro filtro ou crie um novo procedimento." : "Crie os procedimentos esteticos para organizar duracao, buffers e regras da agenda."}
                action={
                  canManage ? (
                    <Button
                      type="button"
                      className="bg-slate-950 text-white hover:bg-slate-800"
                      onClick={() => {
                        document.getElementById("novo-tipo")?.scrollIntoView({ behavior: "smooth" });
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

        <Card id="novo-tipo" className="space-y-4 scroll-mt-24">
          <AdminSectionHeader
            eyebrow="Cadastro"
            title="Novo procedimento ou avaliacao"
            description="Cadastre avaliacao, sessao de retorno ou procedimento estetico com duracao e buffers coerentes."
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
              {AESTHETIC_PROCEDURE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-teal-300 hover:bg-teal-50"
                  onClick={() =>
                    setCreateForm((current) => ({
                      ...current,
                      name: preset.name,
                      durationMinutes: preset.durationMinutes,
                      isFirstVisit: preset.isFirstVisit ?? false,
                      isReturnVisit: preset.isReturnVisit ?? false,
                    }))
                  }
                  disabled={!canManage}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <form className="space-y-4" onSubmit={(event) => void handleCreateConsultationType(event)}>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Nome do procedimento
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

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Duracao
                </label>
                <input
                  type="number"
                  min={1}
                  value={createForm.durationMinutes}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      durationMinutes: event.target.value,
                    }))
                  }
                  className={adminInputClassName}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Buffer antes
                </label>
                <input
                  type="number"
                  min={0}
                  max={MAX_BUFFER_MINUTES}
                  value={createForm.bufferBeforeMinutes}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      bufferBeforeMinutes: event.target.value,
                    }))
                  }
                  className={adminInputClassName}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Buffer depois
                </label>
                <input
                  type="number"
                  min={0}
                  max={MAX_BUFFER_MINUTES}
                  value={createForm.bufferAfterMinutes}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      bufferAfterMinutes: event.target.value,
                    }))
                  }
                  className={adminInputClassName}
                  disabled={!canManage}
                />
              </div>
            </div>

            <p className="text-xs text-muted">
              Buffers de agenda aceitam ate {MAX_BUFFER_MINUTES} minutos por lado.
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Area estetica
                </label>
                <select
                  value={createForm.aestheticArea ?? ""}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      aestheticArea: (event.target.value || null) as AestheticArea,
                    }))
                  }
                  className={adminSelectClassName}
                  disabled={!canManage}
                >
                  <option value="">Nao definir</option>
                  {Object.entries(AESTHETIC_AREA_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Invasividade
                </label>
                <select
                  value={createForm.invasivenessLevel ?? ""}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      invasivenessLevel: (event.target.value || null) as InvasivenessLevel,
                    }))
                  }
                  className={adminSelectClassName}
                  disabled={!canManage}
                >
                  <option value="">Nao definir</option>
                  {Object.entries(INVASIVENESS_LEVEL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Recuperacao em dias
                </label>
                <input
                  type="number"
                  min={0}
                  value={createForm.recoveryDays}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      recoveryDays: event.target.value,
                    }))
                  }
                  className={adminInputClassName}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Frequencia recomendada
                </label>
                <input
                  type="number"
                  min={0}
                  value={createForm.recommendedFrequencyDays}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      recommendedFrequencyDays: event.target.value,
                    }))
                  }
                  className={adminInputClassName}
                  disabled={!canManage}
                />
              </div>
            </div>

            <div className="grid gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Preparo obrigatorio
                </label>
                <textarea
                  value={createForm.preparationNotes}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      preparationNotes: event.target.value,
                    }))
                  }
                  className={`${adminInputClassName} min-h-[104px] resize-y`}
                  placeholder="Ex.: suspender acidos 5 dias antes, evitar exposicao solar intensa e vir sem maquiagem."
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Contraindicacoes resumidas
                </label>
                <textarea
                  value={createForm.contraindications}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      contraindications: event.target.value,
                    }))
                  }
                  className={`${adminInputClassName} min-h-[104px] resize-y`}
                  placeholder="Ex.: gestacao, infeccao ativa na area, uso recente de isotretinoina."
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Orientacao pos-procedimento
                </label>
                <textarea
                  value={createForm.aftercareGuidance}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      aftercareGuidance: event.target.value,
                    }))
                  }
                  className={`${adminInputClassName} min-h-[104px] resize-y`}
                  placeholder="Ex.: reforcar fotoprotecao, evitar academia por 24h e retornar em 30 dias."
                  disabled={!canManage}
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={createForm.isFirstVisit}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      isFirstVisit: event.target.checked,
                    }))
                  }
                  disabled={!canManage}
                />
                Primeira avaliacao
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={createForm.isReturnVisit}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      isReturnVisit: event.target.checked,
                    }))
                  }
                  disabled={!canManage}
                />
                Sessao de retorno
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={createForm.isOnline}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      isOnline: event.target.checked,
                    }))
                  }
                  disabled={!canManage}
                />
                Online
              </label>
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
                Ativo
              </label>
            </div>

            <Button type="submit" className="w-full" disabled={!canManage || isCreating}>
              {isCreating ? "Criando..." : "Criar procedimento"}
            </Button>
          </form>
        </Card>
      </section>

      <Sheet
        open={selectedConsultationTypeId !== null}
        onClose={() => setSelectedConsultationTypeId(null)}
        title="Ficha do procedimento"
        description={selectedConsultationType?.name}
      >
        {editForm && selectedConsultationType ? (
          <div className="space-y-6">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  label={selectedConsultationType.isActive ? "Ativo" : "Inativo"}
                  tone={selectedConsultationType.isActive ? "success" : "warning"}
                />
                <StatusPill
                  label={selectedConsultationType.isOnline ? "Online" : "Presencial"}
                  tone={selectedConsultationType.isOnline ? "neutral" : "success"}
                />
              </div>
              {(selectedConsultationType.preparationNotes ||
                selectedConsultationType.contraindications ||
                selectedConsultationType.aftercareGuidance) && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {selectedConsultationType.preparationNotes ? (
                    <span className="rounded-full bg-slate-200 px-2 py-1 font-medium text-slate-700">
                      Preparo definido
                    </span>
                  ) : null}
                  {selectedConsultationType.contraindications ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-700">
                      Contraindicacoes registradas
                    </span>
                  ) : null}
                  {selectedConsultationType.aftercareGuidance ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-700">
                      Pos-procedimento definido
                    </span>
                  ) : null}
                </div>
              )}
              <p className="mt-3 text-sm text-muted">
                Atualizado em {formatDateTime(selectedConsultationType.updatedAt)}
              </p>
            </div>

            <form className="space-y-4" onSubmit={(event) => void handleUpdateConsultationType(event)}>
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

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Duracao
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editForm.durationMinutes}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current ? { ...current, durationMinutes: event.target.value } : current,
                      )
                    }
                    className={adminInputClassName}
                    disabled={!canManage}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Buffer antes
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={MAX_BUFFER_MINUTES}
                    value={editForm.bufferBeforeMinutes}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? { ...current, bufferBeforeMinutes: event.target.value }
                          : current,
                      )
                    }
                    className={adminInputClassName}
                    disabled={!canManage}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Buffer depois
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={MAX_BUFFER_MINUTES}
                    value={editForm.bufferAfterMinutes}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? { ...current, bufferAfterMinutes: event.target.value }
                          : current,
                      )
                    }
                    className={adminInputClassName}
                    disabled={!canManage}
                  />
                </div>
              </div>

              <p className="text-xs text-muted">Limite: ate {MAX_BUFFER_MINUTES} min por buffer.</p>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Area estetica
                  </label>
                  <select
                    value={editForm.aestheticArea ?? ""}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              aestheticArea: (event.target.value || null) as AestheticArea,
                            }
                          : current,
                      )
                    }
                    className={adminSelectClassName}
                    disabled={!canManage}
                  >
                    <option value="">Nao definir</option>
                    {Object.entries(AESTHETIC_AREA_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Invasividade
                  </label>
                  <select
                    value={editForm.invasivenessLevel ?? ""}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              invasivenessLevel: (event.target.value || null) as InvasivenessLevel,
                            }
                          : current,
                      )
                    }
                    className={adminSelectClassName}
                    disabled={!canManage}
                  >
                    <option value="">Nao definir</option>
                    {Object.entries(INVASIVENESS_LEVEL_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Recuperacao em dias
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editForm.recoveryDays}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current ? { ...current, recoveryDays: event.target.value } : current,
                      )
                    }
                    className={adminInputClassName}
                    disabled={!canManage}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Frequencia recomendada
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editForm.recommendedFrequencyDays}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? { ...current, recommendedFrequencyDays: event.target.value }
                          : current,
                      )
                    }
                    className={adminInputClassName}
                    disabled={!canManage}
                  />
                </div>
              </div>

              <div className="grid gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Preparo obrigatorio
                  </label>
                  <textarea
                    value={editForm.preparationNotes}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? { ...current, preparationNotes: event.target.value }
                          : current,
                      )
                    }
                    className={`${adminInputClassName} min-h-[104px] resize-y`}
                    placeholder="Ex.: suspender acidos 5 dias antes, evitar exposicao solar intensa e vir sem maquiagem."
                    disabled={!canManage}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Contraindicacoes resumidas
                  </label>
                  <textarea
                    value={editForm.contraindications}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? { ...current, contraindications: event.target.value }
                          : current,
                      )
                    }
                    className={`${adminInputClassName} min-h-[104px] resize-y`}
                    placeholder="Ex.: gestacao, infeccao ativa na area, uso recente de isotretinoina."
                    disabled={!canManage}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Orientacao pos-procedimento
                  </label>
                  <textarea
                    value={editForm.aftercareGuidance}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? { ...current, aftercareGuidance: event.target.value }
                          : current,
                      )
                    }
                    className={`${adminInputClassName} min-h-[104px] resize-y`}
                    placeholder="Ex.: reforcar fotoprotecao, evitar academia por 24h e retornar em 30 dias."
                    disabled={!canManage}
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={editForm.isFirstVisit}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current ? { ...current, isFirstVisit: event.target.checked } : current,
                      )
                    }
                    disabled={!canManage}
                  />
                  Primeira avaliacao
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={editForm.isReturnVisit}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current ? { ...current, isReturnVisit: event.target.checked } : current,
                      )
                    }
                    disabled={!canManage}
                  />
                  Sessao de retorno
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={editForm.isOnline}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current ? { ...current, isOnline: event.target.checked } : current,
                      )
                    }
                    disabled={!canManage}
                  />
                  Online
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
                  Ativo
                </label>
              </div>

              <Button type="submit" className="w-full" disabled={!canManage || isUpdating}>
                {isUpdating ? "Salvando..." : "Salvar alteracoes"}
              </Button>
            </form>

            <div className="space-y-4 border-t border-slate-200 pt-6">
              <AdminSectionHeader
                eyebrow="Protocolos"
                title="Fluxos de sessoes deste procedimento"
                description="Defina quantas sessoes compoem o protocolo, qual intervalo seguir e quais orientacoes do procedimento ja servem de base."
                actions={
                  <AdminCountBadge
                    value={selectedProcedureProtocols.length}
                    loading={false}
                  />
                }
              />

              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Base clinica do procedimento
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {selectedConsultationType.recommendedFrequencyDays ? (
                    <span className="rounded-full bg-blue-100 px-2 py-1 font-medium text-blue-700">
                      Frequencia sugerida: {selectedConsultationType.recommendedFrequencyDays} dia(s)
                    </span>
                  ) : null}
                  {selectedConsultationType.recoveryDays ? (
                    <span className="rounded-full bg-orange-100 px-2 py-1 font-medium text-orange-700">
                      Recuperacao: {selectedConsultationType.recoveryDays} dia(s)
                    </span>
                  ) : null}
                  {selectedConsultationType.invasivenessLevel ? (
                    <span className="rounded-full bg-slate-200 px-2 py-1 font-medium text-slate-700">
                      {INVASIVENESS_LEVEL_LABELS[
                        selectedConsultationType.invasivenessLevel as Exclude<
                          InvasivenessLevel,
                          null
                        >
                      ] ?? selectedConsultationType.invasivenessLevel}
                    </span>
                  ) : null}
                </div>
                {(selectedConsultationType.preparationNotes ||
                  selectedConsultationType.contraindications ||
                  selectedConsultationType.aftercareGuidance) && (
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {selectedConsultationType.preparationNotes ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Preparo
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                          {selectedConsultationType.preparationNotes}
                        </p>
                      </div>
                    ) : null}
                    {selectedConsultationType.contraindications ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
                          Contraindicacoes
                        </p>
                        <p className="mt-2 text-sm text-amber-800">
                          {selectedConsultationType.contraindications}
                        </p>
                      </div>
                    ) : null}
                    {selectedConsultationType.aftercareGuidance ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                          Pos-procedimento
                        </p>
                        <p className="mt-2 text-sm text-emerald-800">
                          {selectedConsultationType.aftercareGuidance}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {selectedProcedureProtocols.length > 0 ? (
                  selectedProcedureProtocols.map((protocol) => {
                    const isSelectedProtocol = selectedProtocolId === protocol.id;

                    return (
                      <button
                        key={protocol.id}
                        type="button"
                        onClick={() => setSelectedProtocolId(protocol.id)}
                        className={`w-full rounded-[24px] border p-4 text-left transition ${
                          isSelectedProtocol
                            ? "border-teal-300 bg-teal-50 shadow-sm"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold text-ink">{protocol.name}</p>
                              <StatusPill
                                label={protocol.isActive ? "Ativo" : "Inativo"}
                                tone={protocol.isActive ? "success" : "warning"}
                              />
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-muted">
                              <span>{protocol.totalSessions} sessoes</span>
                              <span>Intervalo de {protocol.intervalBetweenSessionsDays} dia(s)</span>
                            </div>
                            {protocol.description ? (
                              <p className="text-sm text-slate-600">{protocol.description}</p>
                            ) : (
                              <p className="text-sm text-muted">
                                Sem descricao operacional ainda.
                              </p>
                            )}
                          </div>
                          <span className="inline-flex rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-ink">
                            Editar protocolo
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <AdminEmptyState
                    title="Nenhum protocolo ligado"
                    description="Use a sugestao abaixo para criar um fluxo de sessoes coerente com a recuperacao e o pos-procedimento."
                  />
                )}
              </div>

              {createProtocolForm ? (
                <form
                  className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-4"
                  onSubmit={(event) => void handleCreateProcedureProtocol(event)}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Novo protocolo
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        Monte o fluxo base de sessoes sem sair da ficha do procedimento.
                      </p>
                    </div>
                    <Button
                      type="button"
                      className="border border-slate-200 bg-white text-ink hover:bg-slate-50"
                      onClick={() =>
                        setCreateProtocolForm(
                          buildSuggestedProtocolForm(selectedConsultationType),
                        )
                      }
                      disabled={!canManage}
                    >
                      Reaplicar sugestao
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      Nome do protocolo
                    </label>
                    <input
                      type="text"
                      value={createProtocolForm.name}
                      onChange={(event) =>
                        setCreateProtocolForm((current) =>
                          current ? { ...current, name: event.target.value } : current,
                        )
                      }
                      className={adminInputClassName}
                      disabled={!canManage}
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Total de sessoes
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={createProtocolForm.totalSessions}
                        onChange={(event) =>
                          setCreateProtocolForm((current) =>
                            current
                              ? { ...current, totalSessions: event.target.value }
                              : current,
                          )
                        }
                        className={adminInputClassName}
                        disabled={!canManage}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Intervalo entre sessoes
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={createProtocolForm.intervalBetweenSessionsDays}
                        onChange={(event) =>
                          setCreateProtocolForm((current) =>
                            current
                              ? {
                                  ...current,
                                  intervalBetweenSessionsDays: event.target.value,
                                }
                              : current,
                          )
                        }
                        className={adminInputClassName}
                        disabled={!canManage}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      Descricao operacional
                    </label>
                    <textarea
                      value={createProtocolForm.description}
                      onChange={(event) =>
                        setCreateProtocolForm((current) =>
                          current
                            ? { ...current, description: event.target.value }
                            : current,
                        )
                      }
                      className={`${adminInputClassName} min-h-[132px] resize-y`}
                      placeholder="Descreva sequencia, checkpoints e orientacoes recorrentes."
                      disabled={!canManage}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={createProtocolForm.isActive}
                      onChange={(event) =>
                        setCreateProtocolForm((current) =>
                          current
                            ? { ...current, isActive: event.target.checked }
                            : current,
                        )
                      }
                      disabled={!canManage}
                    />
                    Protocolo ativo
                  </label>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!canManage || isCreatingProtocol}
                  >
                    {isCreatingProtocol ? "Criando protocolo..." : "Criar protocolo"}
                  </Button>
                </form>
              ) : null}

              {editProtocolForm && selectedProtocol ? (
                <form
                  className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4"
                  onSubmit={(event) => void handleUpdateProcedureProtocol(event)}
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      Protocolo selecionado
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Ajuste o fluxo existente sem sair do contexto do procedimento.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      Nome do protocolo
                    </label>
                    <input
                      type="text"
                      value={editProtocolForm.name}
                      onChange={(event) =>
                        setEditProtocolForm((current) =>
                          current ? { ...current, name: event.target.value } : current,
                        )
                      }
                      className={adminInputClassName}
                      disabled={!canManage}
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Total de sessoes
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={editProtocolForm.totalSessions}
                        onChange={(event) =>
                          setEditProtocolForm((current) =>
                            current
                              ? { ...current, totalSessions: event.target.value }
                              : current,
                          )
                        }
                        className={adminInputClassName}
                        disabled={!canManage}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Intervalo entre sessoes
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={editProtocolForm.intervalBetweenSessionsDays}
                        onChange={(event) =>
                          setEditProtocolForm((current) =>
                            current
                              ? {
                                  ...current,
                                  intervalBetweenSessionsDays: event.target.value,
                                }
                              : current,
                          )
                        }
                        className={adminInputClassName}
                        disabled={!canManage}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      Descricao operacional
                    </label>
                    <textarea
                      value={editProtocolForm.description}
                      onChange={(event) =>
                        setEditProtocolForm((current) =>
                          current
                            ? { ...current, description: event.target.value }
                            : current,
                        )
                      }
                      className={`${adminInputClassName} min-h-[132px] resize-y`}
                      disabled={!canManage}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={editProtocolForm.isActive}
                      onChange={(event) =>
                        setEditProtocolForm((current) =>
                          current
                            ? { ...current, isActive: event.target.checked }
                            : current,
                        )
                      }
                      disabled={!canManage}
                    />
                    Protocolo ativo
                  </label>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!canManage || isUpdatingProtocol}
                  >
                    {isUpdatingProtocol ? "Salvando protocolo..." : "Salvar protocolo"}
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
        ) : (
          <AdminEmptyState
            title="Selecione um procedimento"
            description="Abra uma ficha da lista para editar duracao, buffers e flags operacionais."
          />
        )}
      </Sheet>
    </div>
  );
}
