"use client";

import type { ReceptionAppointmentDetail } from "@operaclinic/shared";
import { useEffect, useMemo, useState } from "react";
import {
  adminInputClassName,
  adminTextareaClassName,
} from "@/components/platform/platform-admin";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Analytics } from "@/lib/analytics";

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
      Analytics.appointmentStatusChanged("pre_confirmed", "CONFIRMED");
      onUpdated(updated);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Não foi possível confirmar o agendamento."));
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
      Analytics.firstCheckIn();
      Analytics.appointmentStatusChanged("pre_checkin", "CHECKED_IN");
      onUpdated(updated);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Não foi possível registrar check-in."));
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
      setError(toErrorMessage(requestError, "Não foi possível marcar no-show."));
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
      setError(toErrorMessage(requestError, "Não foi possível cancelar o agendamento."));
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
          "Não foi possível registrar pagamento e baixa do atendimento.",
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
      setError(toErrorMessage(requestError, "Não foi possível buscar novos horários."));
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
      setError(toErrorMessage(requestError, "Não foi possível remarcar o agendamento."));
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
              · {appointment.consultationTypeName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel do agendamento"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
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
          <Card className="mt-4 border-red-200 bg-red-50" role="alert">
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
                Contato principal:{" "}
                {appointment.patient.contacts[0]?.value ?? "Não informado"}
              </p>
              <p>Notas: {appointment.patient.notes ?? "Sem observações."}</p>
            </div>
          </Card>

          <Card className="space-y-3">
            <h3 className="text-lg font-semibold text-ink">Operação</h3>
            <div className="space-y-1 text-sm text-muted">
              <p>
                Início:{" "}
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
                Início do atendimento:{" "}
                {appointment.startedAt
                  ? formatDateTime(appointment.startedAt, {
                      timeZone: timezone ?? undefined,
                    })
                  : "-"}
              </p>
              <p>
                Liberado para recepção:{" "}
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
          <h3 className="text-lg font-semibold text-ink">Ação rápida</h3>
          <textarea
            id="action-reason"
            className={adminTextareaClassName}
            placeholder="Motivo ou observação da ação (opcional)"
            aria-label="Motivo ou observação da ação"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="accent"
              onClick={() => void handleConfirm()}
              disabled={!canConfirm || isSubmitting}
            >
              Confirmar
            </Button>
            <Button
              type="button"
              variant="accent"
              onClick={() => void handleCheckIn()}
              disabled={!canCheckIn || isSubmitting}
            >
              Check-in
            </Button>
            <Button
              type="button"
              variant="warning"
              onClick={() => void handleComplete()}
              disabled={!canComplete || isSubmitting}
            >
              Pagamento e baixa
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void handleCancel()}
              disabled={!canCancel || isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void handleNoShow()}
              disabled={!canNoShow || isSubmitting}
            >
              No-show
            </Button>
          </div>
        </Card>

        <Card className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-ink">Remarcar</h3>
              <p className="text-sm text-muted">
                Busca slots no mesmo profissional e procedimento estético.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleSearchSlots()}
              disabled={!canReschedule || !rescheduleDate || isSearchingSlots}
            >
              {isSearchingSlots ? "Buscando..." : "Buscar horários"}
            </Button>
          </div>

          <div>
            <label htmlFor="reschedule-date" className="sr-only">
              Data para remarcação
            </label>
            <input
              id="reschedule-date"
              type="date"
              className={adminInputClassName}
              value={rescheduleDate}
              onChange={(event) => setRescheduleDate(event.target.value)}
              disabled={!canReschedule}
            />
          </div>

          {rescheduleSlots.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {rescheduleSlots.map((slot) => (
                <button
                  key={slot.startsAt}
                  type="button"
                  onClick={() => void handleReschedule(slot)}
                  className="rounded-xl border border-border px-3 py-3 text-left text-sm transition hover:border-accent hover:bg-accentSoft"
                  disabled={isSubmitting}
                >
                  <p className="font-semibold text-ink">
                    {formatTime(slot.startsAt, {
                      timeZone: timezone ?? undefined,
                    })}{" "}
                    –{" "}
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
              Selecione uma data e clique em "Buscar horários" para ver as opções disponíveis.
            </p>
          )}
        </Card>

        <Card className="mt-4 space-y-3">
          <h3 className="text-lg font-semibold text-ink">Histórico de status</h3>
          <div className="space-y-2">
            {appointment.statusHistory.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-border bg-white px-3 py-3 text-sm">
                <p className="font-semibold text-ink">
                  {entry.fromStatus ? getAppointmentStatusLabel(entry.fromStatus) : "Inicial"}{" "}
                  →{" "}
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
