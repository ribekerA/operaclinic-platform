import type { ReactNode } from "react";
import { StatusPill } from "@/components/ui/status-pill";
import type { PatientSummaryResponse } from "@/lib/client/patients-api";

interface PatientCardProps {
  patient: PatientSummaryResponse;
  primaryContact: string;
  activeProtocolCount: number;
  nextProtocolDate: string | null;
  updatedAtLabel: string;
  nextProtocolDateLabel?: string;
  selected?: boolean;
  onSelect: () => void;
  trailing?: ReactNode;
}

/** Cartão de paciente reutilizável (lista de pacientes, resultados de busca, etc.). Puramente apresentacional. */
export function PatientCard({
  patient,
  primaryContact,
  activeProtocolCount,
  nextProtocolDate,
  updatedAtLabel,
  nextProtocolDateLabel,
  selected = false,
  onSelect,
  trailing,
}: PatientCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-card border p-4 text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 ${
        selected ? "border-teal-300 bg-teal-50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-ink">{patient.fullName ?? "Paciente sem nome"}</p>
            <StatusPill label={patient.isActive ? "Ativo" : "Inativo"} tone={patient.isActive ? "success" : "warning"} />
            {activeProtocolCount > 0 ? (
              <StatusPill label={`${activeProtocolCount} em tratamento`} tone="neutral" />
            ) : null}
          </div>
          <p className="text-sm text-muted">{primaryContact}</p>
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <span>{patient.documentNumber ?? "Sem documento"}</span>
            <span>{patient.notes?.trim() ? "Com observações" : "Sem observações"}</span>
            {nextProtocolDate ? <span>Próxima sessão: {nextProtocolDateLabel}</span> : null}
          </div>
        </div>
        <div className="space-y-2 text-sm text-muted lg:text-right">
          <p>Atualizado em {updatedAtLabel}</p>
          {trailing ?? (
            <span className="inline-flex rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-ink">
              Abrir ficha
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
