"use client";

import type { ReceptionAppointmentDetail } from "@operaclinic/shared";
import { useEffect, useMemo, useState } from "react";
import {
  adminInputClassName,
  adminTextareaClassName,
} from "@/components/platform/platform-admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  cancelReceptionAppointment,
  checkInReceptionAppointment,
  confirmReceptionAppointment,
  markReceptionAppointmentAsNoShow,
  rescheduleReceptionAppointment,
  searchReceptionAvailability,
  updateReceptionAppointmentStatus,
  type ReceptionAvailabilitySlot,
} from "@/lib/client/reception-api";
import {
  formatDateTime,
  formatTime,
  getAppointmentStatusLabel,
  getAppointmentStatusTone,
  toDateInputInTimeZone,
} from "@/lib/formatters";
import { toErrorMessage } from "@/lib/client/http";

interface AppointmentDrawerProps {
  appointment: ReceptionAppointmentDetail | null;
  timezone?: string | null;
  onClose: () => void;
  onUpdated: (appointment: ReceptionAppointmentDetail) => void;
}

export function AppointmentDrawer({
  appointment,
  timezone,
  onClose,
  onUpdated,
}: AppointmentDrawerProps) {
  const [reason, setReason] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<ReceptionAvailabilitySlot[]>([]);
  const [isSearchingSlots, setIsSearchingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appointment) {
      return;
    }

    setReason("");
    setRescheduleDate(
      toDateInputInTimeZone(appointment.startsAt, timezone ?? undefined),
    );
    setRescheduleSlots([]);
    setError(null);
  }, [appointment, timezone]);

  const canConfirm = useMemo(
    () =>
      appointment
        ? appointment.status === "BOOKED" || appointment.status === "RESCHEDULED"
        : false,
    [appointment],
  );

  const canCheckIn = useMemo(
    () =>
      appointment
        ? ["BOOKED", "CONFIRMED", "RESCHEDULED"].includes(appointment.status)
        : false,
    [appointment],
  );

  const canNoShow = useMemo(
    () =>
      appointment
        ? ["BOOKED", "CONFIRMED", "RESCHEDULED"].includes(appointment.status)
        : false,
    [appointment],
  );

  const canReschedule = useMemo(
    () =>
      appointment
        ? ["BOOKED", "CONFIRMED", "RESCHEDULED"].includes(appointment.status)
        : false,
    [appointment],
  );

  const canCancel = useMemo(
    () =>
      appointment
        ? ["BOOKED", "CONFIRMED", "RESCHEDULED"].includes(appointment.status)
        : false,
    [appointment],
  );
  const canComplete = useMemo(
    () => (appointment ? appointment.status === "AWAITING_PAYMENT" : false),
    [appointment],
  );

  if (!appointment) {
    return null;
  }

  const currentAppointment = appointment;

  async function handleConfirm(): Promise<void> {
    setIsSubmitting(true);
    setError(null);

    try {
      const updated = await confirmReceptionAppointment(currentAppointment.id, {
        reason: reason.trim() || undefined,
      });
      onUpdated(updated);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Nao foi possivel confirmar o agendamento."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCheckIn(): Promise<void> {
    setIsSubmitting(true);
    setError(null);

    try {
      const updated = await checkInReceptionAppointment(currentAppointment.id, {
        reason: reason.trim() || undefined,
      });
      onUpdated(updated);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Nao foi possivel registrar check-in."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleNoShow(): Promise<void> {
    setIsSubmitting(true);
    setError(null);

    try {
      const updated = await markReceptionAppointmentAsNoShow(currentAppointment.id, {
        reason: reason.trim() || undefined,
      });
      onUpdated(updated);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Nao foi possivel marcar no-show."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel(): Promise<void> {
    if (!reason.trim()) {
      setError("Informe o motivo do cancelamento.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const updated = await cancelReceptionAppointment(currentAppointment.id, {
        reason: reason.trim(),
      });
      onUpdated(updated);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Nao foi possivel cancelar o agendamento."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleComplete(): Promise<void> {
    setIsSubmitting(true);
    setError(null);

    try {
      const updated = await updateReceptionAppointmentStatus(currentAppointment.id, {
        status: "COMPLETED",
        reason: reason.trim() || undefined,
      });
      onUpdated(updated);
    } catch (requestError) {
      setError(
        toErrorMessage(
          requestError,
          "Nao foi possivel registrar pagamento e baixa do atendimento.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSearchSlots(): Promise<void> {
    setIsSearchingSlots(true);
    setError(null);

    try {
      const slots = await searchReceptionAvailability({
        professionalId: currentAppointment.professionalId,
        consultationTypeId: currentAppointment.consultationTypeId,
        date: rescheduleDate,
        unitId: currentAppointment.unitId ?? undefined,
      });
      setRescheduleSlots(slots);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Nao foi possivel buscar novos slots."));
    } finally {
      setIsSearchingSlots(false);
    }
  }

  async function handleReschedule(slot: ReceptionAvailabilitySlot): Promise<void> {
    setIsSubmitting(true);
    setError(null);

    try {
      const updated = await rescheduleReceptionAppointment(currentAppointment.id, {
        startsAt: slot.startsAt,
        unitId: currentAppointment.unitId ?? undefined,
        room: currentAppointment.room ?? undefined,
        reason: reason.trim() || undefined,
      });
      onUpdated(updated);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Nao foi possivel remarcar o agendamento."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20">
      <div className="w-full max-w-2xl overflow-y-auto border-l border-border bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted">Agendamento</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">
              {appointment.patient.fullName ?? "Paciente sem nome"}
            </h2>
            <p className="text-sm text-muted">
              {formatDateTime(appointment.startsAt, {
                timeZone: timezone ?? undefined,
              })}{" "}
              • {appointment.consultationTypeName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-ink transition hover:bg-accentSoft"
          >
            Fechar
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <StatusPill
            label={getAppointmentStatusLabel(appointment.status)}
            tone={getAppointmentStatusTone(appointment.status)}
          />
          <StatusPill label={appointment.professionalName} />
          {appointment.unitName ? <StatusPill label={appointment.unitName} /> : null}
        </div>

        {error ? (
          <Card className="mt-4 border-red-200 bg-red-50">
            <p className="text-sm text-red-700">{error}</p>
          </Card>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="space-y-3">
            <h3 className="text-lg font-semibold text-ink">Paciente</h3>
            <div className="space-y-1 text-sm text-muted">
              <p>Nome: {appointment.patient.fullName ?? "-"}</p>
              <p>Documento: {appointment.patient.documentNumber ?? "-"}</p>
              <p>
                Contato principal: {" "}
                {appointment.patient.contacts[0]?.value ?? "Nao informado"}
              </p>
              <p>Notas: {appointment.patient.notes ?? "Sem observacoes."}</p>
            </div>
          </Card>

          <Card className="space-y-3">
            <h3 className="text-lg font-semibold text-ink">Operacao</h3>
            <div className="space-y-1 text-sm text-muted">
              <p>
                Inicio:{" "}
                {formatDateTime(appointment.startsAt, {
                  timeZone: timezone ?? undefined,
                })}
              </p>
              <p>
                Fim:{" "}
                {formatDateTime(appointment.endsAt, {
                  timeZone: timezone ?? undefined,
                })}
              </p>
              <p>Sala: {appointment.room ?? "-"}</p>
              <p>
                Confirmado em:{" "}
                {appointment.confirmedAt
                  ? formatDateTime(appointment.confirmedAt, {
                      timeZone: timezone ?? undefined,
                    })
                  : "-"}
              </p>
              <p>
                Check-in em:{" "}
                {appointment.checkedInAt
                  ? formatDateTime(appointment.checkedInAt, {
                      timeZone: timezone ?? undefined,
                    })
                  : "-"}
              </p>
              <p>
                Chamado em:{" "}
                {appointment.calledAt
                  ? formatDateTime(appointment.calledAt, {
                      timeZone: timezone ?? undefined,
                    })
                  : "-"}
              </p>
              <p>
                Inicio do atendimento:{" "}
                {appointment.startedAt
                  ? formatDateTime(appointment.startedAt, {
                      timeZone: timezone ?? undefined,
                    })
                  : "-"}
              </p>
              <p>
                Liberado para recepcao:{" "}
                {appointment.awaitingPaymentAt
                  ? formatDateTime(appointment.awaitingPaymentAt, {
                      timeZone: timezone ?? undefined,
                    })
                  : "-"}
              </p>
              <p>
                Baixa final:{" "}
                {appointment.completedAt
                  ? formatDateTime(appointment.completedAt, {
                      timeZone: timezone ?? undefined,
                    })
                  : "-"}
              </p>
            </div>
          </Card>
        </div>

        <Card className="mt-4 space-y-3">
          <h3 className="text-lg font-semibold text-ink">Acao rapida</h3>
          <textarea
            className={adminTextareaClassName}
            placeholder="Motivo ou observacao da acao"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleConfirm()} disabled={!canConfirm || isSubmitting}>
              Confirmar
            </Button>
            <Button type="button" onClick={() => void handleCheckIn()} disabled={!canCheckIn || isSubmitting}>
              Check-in
            </Button>
            <Button
              type="button"
              onClick={() => void handleComplete()}
              disabled={!canComplete || isSubmitting}
              className="bg-amber-700"
            >
              Pagamento e baixa
            </Button>
            <Button type="button" onClick={() => void handleCancel()} disabled={!canCancel || isSubmitting} className="bg-amber-700">
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleNoShow()} disabled={!canNoShow || isSubmitting} className="bg-rose-600">
              No-show
            </Button>
          </div>
        </Card>

        <Card className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-ink">Remarcar</h3>
              <p className="text-sm text-muted">
                Buscar novos slots no mesmo profissional e procedimento estetico.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => void handleSearchSlots()}
              disabled={!canReschedule || !rescheduleDate || isSearchingSlots}
            >
              {isSearchingSlots ? "Buscando..." : "Buscar slots"}
            </Button>
          </div>

          <input
            type="date"
            className={adminInputClassName}
            value={rescheduleDate}
            onChange={(event) => setRescheduleDate(event.target.value)}
            disabled={!canReschedule}
          />

          {rescheduleSlots.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {rescheduleSlots.map((slot) => (
                <button
                  key={slot.startsAt}
                  type="button"
                  onClick={() => void handleReschedule(slot)}
                  className="rounded-lg border border-border px-3 py-2 text-left text-sm transition hover:bg-accentSoft"
                  disabled={isSubmitting}
                >
                  <p className="font-semibold text-ink">
                    {formatTime(slot.startsAt, {
                      timeZone: timezone ?? undefined,
                    })}{" "}
                    -{" "}
                    {formatTime(slot.endsAt, {
                      timeZone: timezone ?? undefined,
                    })}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateTime(slot.startsAt, {
                      timeZone: timezone ?? undefined,
                    })}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Busque slots para remarcar este atendimento.
            </p>
          )}
        </Card>

        <Card className="mt-4 space-y-3">
          <h3 className="text-lg font-semibold text-ink">Historico de status</h3>
          <div className="space-y-2">
            {appointment.statusHistory.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-border bg-white px-3 py-3 text-sm">
                <p className="font-semibold text-ink">
                  {entry.fromStatus ? getAppointmentStatusLabel(entry.fromStatus) : "Inicial"} {"->"}{" "}
                  {getAppointmentStatusLabel(entry.toStatus)}
                </p>
                <p className="text-xs text-muted">
                  {formatDateTime(entry.createdAt, {
                    timeZone: timezone ?? undefined,
                  })}
                </p>
                <p className="mt-1 text-xs text-muted">{entry.reason ?? "Sem motivo registrado."}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
