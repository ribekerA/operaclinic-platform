import type { ReactNode } from "react";
import { StatusPill } from "@/components/ui/status-pill";
import type { ReceptionAgendaAppointment } from "@operaclinic/shared";
import { getAppointmentStatusLabel, getAppointmentStatusTone } from "@/lib/formatters";

interface AppointmentCardProps {
  appointment: ReceptionAgendaAppointment;
  timeLabel: string;
  isDelayed: boolean;
  delayLabel: string;
  actions?: ReactNode;
}

/** Cartão de agendamento reutilizável (fila de recepção, agenda do restante do dia). Puramente apresentacional. */
export function AppointmentCard({ appointment, timeLabel, isDelayed, delayLabel, actions }: AppointmentCardProps) {
  return (
    <div
      className={`rounded-card border p-4 ${
        isDelayed ? "border-rose-300 bg-rose-50" : "border-emerald-300 bg-white"
      }`}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                isDelayed ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {delayLabel}
            </span>
            <StatusPill
              label={getAppointmentStatusLabel(appointment.status)}
              tone={getAppointmentStatusTone(appointment.status)}
            />
          </div>
          <p className="text-lg font-semibold text-ink">{appointment.patientName ?? "Paciente sem nome"}</p>
          <p className="text-sm text-muted">
            {timeLabel} · {appointment.professionalName}
            {appointment.consultationTypeName ? ` · ${appointment.consultationTypeName}` : ""}
          </p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
