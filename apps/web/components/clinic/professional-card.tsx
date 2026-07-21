import { StatusPill } from "@/components/ui/status-pill";
import type { ProfessionalResponse } from "@/lib/client/clinic-structure-api";

interface ProfessionalCardProps {
  professional: ProfessionalResponse;
  credentialLabel: string;
  selected?: boolean;
  onSelect: () => void;
}

/** Cartão de profissional reutilizável (lista de profissionais, seleção em formulários). Puramente apresentacional. */
export function ProfessionalCard({ professional, credentialLabel, selected = false, onSelect }: ProfessionalCardProps) {
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
            <p className="text-base font-semibold text-ink">{professional.displayName}</p>
            <StatusPill label={professional.isActive ? "Ativo" : "Inativo"} tone={professional.isActive ? "success" : "warning"} />
            <StatusPill
              label={professional.visibleForSelfBooking ? "Autoagendamento" : "Sem autoagendamento"}
              tone={professional.visibleForSelfBooking ? "success" : "neutral"}
            />
          </div>
          <p className="text-sm text-muted">{professional.fullName}</p>
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <span>{credentialLabel}</span>
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
}
