"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle,
  CircleAlert,
  Clock,
  LoaderCircle,
  User,
} from "lucide-react";
import {
  BookAppointmentInput,
  PublicClinicInfo,
  PublicSlot,
  bookPublicAppointment,
  getPublicAvailability,
  toErrorMessage,
} from "@/lib/client/public-booking-api";

interface SelfBookingWorkspaceProps {
  slug: string;
  clinic: PublicClinicInfo;
}

type Step = "service" | "professional" | "datetime" | "info" | "review" | "success";

interface BookingState {
  consultationTypeId: string;
  professionalId: string;
  selectedDate: string;
  selectedSlot: PublicSlot | null;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  notes: string;
}

const STEPS: Step[] = ["service", "professional", "datetime", "info", "review", "success"];

function buildDateOptions(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 1; i <= 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}

function formatTime(iso: string, timezone: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}

function formatDateTime(iso: string, timezone: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}

const AREA_LABELS: Record<string, string> = {
  FACIAL: "Facial",
  CORPORAL: "Corporal",
  CAPILAR: "Capilar",
  INTIMA: "Íntima",
  MAOS_PES: "Mãos e Pés",
  OLHOS: "Olhos",
  LABIOS: "Lábios",
};

export function SelfBookingWorkspace({ slug, clinic }: SelfBookingWorkspaceProps) {
  const [step, setStep] = useState<Step>("service");
  const [booking, setBooking] = useState<BookingState>({
    consultationTypeId: "",
    professionalId: "",
    selectedDate: "",
    selectedSlot: null,
    patientName: "",
    patientPhone: "",
    patientEmail: "",
    notes: "",
  });
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    appointmentId: string;
    startsAt: string;
    confirmationCode: string;
  } | null>(null);

  const selectedConsultationType = clinic.consultationTypes.find(
    (ct) => ct.id === booking.consultationTypeId,
  );
  const selectedProfessional = clinic.professionals.find(
    (p) => p.id === booking.professionalId,
  );

  const loadSlots = useCallback(async () => {
    if (!booking.professionalId || !booking.consultationTypeId || !booking.selectedDate) return;
    setLoadingSlots(true);
    setSlots([]);
    try {
      const result = await getPublicAvailability(slug, {
        professionalId: booking.professionalId,
        consultationTypeId: booking.consultationTypeId,
        date: booking.selectedDate,
      });
      setSlots(result);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [slug, booking.professionalId, booking.consultationTypeId, booking.selectedDate]);

  useEffect(() => {
    if (step === "datetime" && booking.selectedDate) {
      loadSlots();
    }
  }, [step, booking.selectedDate, loadSlots]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!booking.selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      const input: BookAppointmentInput = {
        professionalId: booking.professionalId,
        consultationTypeId: booking.consultationTypeId,
        startsAt: booking.selectedSlot.startsAt,
        unitId: booking.selectedSlot.unitId ?? undefined,
        patientName: booking.patientName.trim(),
        patientPhone: booking.patientPhone.trim(),
        patientEmail: booking.patientEmail.trim() || undefined,
        notes: booking.notes.trim() || undefined,
      };
      const result = await bookPublicAppointment(slug, input);
      setConfirmation(result);
      setStep("success");
    } catch (err) {
      setError(toErrorMessage(err, "Não foi possível confirmar o agendamento."));
    } finally {
      setSubmitting(false);
    }
  }

  function goTo(s: Step) {
    setError(null);
    setStep(s);
  }

  const stepIndex = STEPS.indexOf(step);
  const progressSteps = ["Serviço", "Profissional", "Data e hora", "Seus dados"];
  const progressIndex = Math.min(stepIndex, 3);

  if (step === "success" && confirmation) {
    return (
      <div className="mx-auto max-w-lg space-y-8 px-4 py-12 text-center">
        <div className="flex justify-center">
          <CheckCircle className="h-16 w-16 text-teal-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-ink">Agendamento confirmado!</h1>
          <p className="text-muted">
            Você receberá uma confirmação em breve.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-panel space-y-4">
          <div className="flex items-start gap-3">
            <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Data e horário</p>
              <p className="text-sm font-semibold text-ink capitalize">
                {formatDateTime(confirmation.startsAt, clinic.timezone)}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <User className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Profissional</p>
              <p className="text-sm font-semibold text-ink">{selectedProfessional?.displayName}</p>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Código de confirmação</p>
            <p className="mt-1 font-mono text-2xl font-bold text-accent tracking-widest">
              {confirmation.confirmationCode}
            </p>
            <p className="mt-1 text-xs text-muted">Guarde este código para consultar seu agendamento.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">{clinic.displayName}</p>
        <h1 className="text-2xl font-semibold text-ink">Agendar consulta</h1>
      </div>

      {/* Progress */}
      {step !== "review" && step !== "success" && (
        <div className="flex items-center gap-0">
          {progressSteps.map((label, i) => (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={[
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors",
                    i < progressIndex
                      ? "bg-teal-500 text-white"
                      : i === progressIndex
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-400",
                  ].join(" ")}
                >
                  {i < progressIndex ? "✓" : i + 1}
                </div>
                <span className="hidden text-[10px] font-medium text-muted sm:block">{label}</span>
              </div>
              {i < progressSteps.length - 1 && (
                <div
                  className={[
                    "h-0.5 flex-1 mx-2 rounded transition-colors",
                    i < progressIndex ? "bg-teal-400" : "bg-slate-200",
                  ].join(" ")}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <CircleAlert className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* STEP: SERVICE */}
      {step === "service" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-ink">Qual serviço você quer agendar?</h2>
          {clinic.consultationTypes.length === 0 && (
            <p className="text-sm text-muted">Nenhum serviço disponível no momento.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {clinic.consultationTypes.map((ct) => (
              <button
                key={ct.id}
                type="button"
                onClick={() => {
                  setBooking((b) => ({ ...b, consultationTypeId: ct.id, professionalId: "", selectedDate: "", selectedSlot: null }));
                  goTo("professional");
                }}
                className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-accent hover:shadow-panel focus:outline-none focus:ring-2 focus:ring-teal-200"
              >
                <span className="text-sm font-semibold text-ink">{ct.name}</span>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Clock className="h-3 w-3" />
                    {ct.durationMinutes} min
                  </span>
                  {ct.aestheticArea && (
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700">
                      {AREA_LABELS[ct.aestheticArea] ?? ct.aestheticArea}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP: PROFESSIONAL */}
      {step === "professional" && (
        <div className="space-y-4">
          <button type="button" onClick={() => goTo("service")} className="flex items-center gap-1 text-sm text-muted hover:text-ink transition">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <h2 className="text-lg font-semibold text-ink">Com qual profissional?</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {clinic.professionals.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setBooking((b) => ({ ...b, professionalId: p.id, selectedDate: "", selectedSlot: null }));
                  goTo("datetime");
                }}
                className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-accent hover:shadow-panel focus:outline-none focus:ring-2 focus:ring-teal-200"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
                    {p.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold text-ink">{p.displayName}</span>
                </div>
                {p.specialties.length > 0 && (
                  <p className="mt-1 text-xs text-muted pl-11">
                    {p.specialties.map((s) => s.name).join(", ")}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP: DATE + TIME */}
      {step === "datetime" && (
        <div className="space-y-6">
          <button type="button" onClick={() => goTo("professional")} className="flex items-center gap-1 text-sm text-muted hover:text-ink transition">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <h2 className="text-lg font-semibold text-ink">Escolha a data</h2>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {buildDateOptions().slice(0, 21).map((date) => (
              <button
                key={date}
                type="button"
                onClick={() => setBooking((b) => ({ ...b, selectedDate: date, selectedSlot: null }))}
                className={[
                  "flex flex-col items-center rounded-xl border py-2 px-1 text-center text-xs transition",
                  booking.selectedDate === date
                    ? "border-accent bg-teal-50 font-bold text-accent"
                    : "border-slate-200 bg-white text-ink hover:border-accent",
                ].join(" ")}
              >
                <span className="font-medium capitalize">{formatDate(date).split(", ")[0]}</span>
                <span className="text-[11px] text-muted">{formatDate(date).split(", ")[1]}</span>
              </button>
            ))}
          </div>

          {booking.selectedDate && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-ink">
                Horários disponíveis — {formatDate(booking.selectedDate)}
              </h3>
              {loadingSlots ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Verificando disponibilidade…
                </div>
              ) : slots.length === 0 ? (
                <p className="text-sm text-muted">Nenhum horário disponível nesta data. Escolha outro dia.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {slots.map((slot) => (
                    <button
                      key={slot.startsAt}
                      type="button"
                      onClick={() => setBooking((b) => ({ ...b, selectedSlot: slot }))}
                      className={[
                        "rounded-xl border py-2 px-1 text-center text-xs font-medium transition",
                        booking.selectedSlot?.startsAt === slot.startsAt
                          ? "border-accent bg-teal-50 text-accent"
                          : "border-slate-200 bg-white text-ink hover:border-accent",
                      ].join(" ")}
                    >
                      {formatTime(slot.startsAt, clinic.timezone)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {booking.selectedSlot && (
            <button
              type="button"
              onClick={() => goTo("info")}
              className="flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 transition"
            >
              Continuar <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* STEP: PATIENT INFO */}
      {step === "info" && (
        <form onSubmit={(e) => { e.preventDefault(); goTo("review"); }} className="space-y-5">
          <button type="button" onClick={() => goTo("datetime")} className="flex items-center gap-1 text-sm text-muted hover:text-ink transition">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <h2 className="text-lg font-semibold text-ink">Seus dados</h2>
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="name">
                Nome completo *
              </label>
              <input
                id="name"
                type="text"
                required
                minLength={2}
                value={booking.patientName}
                onChange={(e) => setBooking((b) => ({ ...b, patientName: e.target.value }))}
                placeholder="Seu nome completo"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="phone">
                WhatsApp / Telefone *
              </label>
              <input
                id="phone"
                type="tel"
                required
                minLength={8}
                value={booking.patientPhone}
                onChange={(e) => setBooking((b) => ({ ...b, patientPhone: e.target.value }))}
                placeholder="(11) 99999-9999"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="email">
                E-mail (opcional)
              </label>
              <input
                id="email"
                type="email"
                value={booking.patientEmail}
                onChange={(e) => setBooking((b) => ({ ...b, patientEmail: e.target.value }))}
                placeholder="seu@email.com"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="notes">
                Observações (opcional)
              </label>
              <textarea
                id="notes"
                rows={3}
                value={booking.notes}
                onChange={(e) => setBooking((b) => ({ ...b, notes: e.target.value }))}
                placeholder="Informe alergias, contraindicações ou outras observações relevantes"
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
            </div>
          </div>
          <button
            type="submit"
            className="flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 transition"
          >
            Revisar agendamento <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      )}

      {/* STEP: REVIEW */}
      {step === "review" && booking.selectedSlot && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <button type="button" onClick={() => goTo("info")} className="flex items-center gap-1 text-sm text-muted hover:text-ink transition">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <h2 className="text-lg font-semibold text-ink">Confirme seu agendamento</h2>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
            <div className="flex items-start gap-3 p-5">
              <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Data e horário</p>
                <p className="text-sm font-semibold text-ink capitalize">
                  {formatDateTime(booking.selectedSlot.startsAt, clinic.timezone)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-5">
              <User className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Profissional</p>
                <p className="text-sm font-semibold text-ink">{selectedProfessional?.displayName}</p>
              </div>
            </div>
            <div className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Serviço</p>
              <p className="text-sm font-semibold text-ink">{selectedConsultationType?.name}</p>
              <span className="text-xs text-muted">{selectedConsultationType?.durationMinutes} min</span>
            </div>
            <div className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Paciente</p>
              <p className="text-sm font-semibold text-ink">{booking.patientName}</p>
              <p className="text-xs text-muted">{booking.patientPhone}</p>
              {booking.patientEmail && <p className="text-xs text-muted">{booking.patientEmail}</p>}
              {booking.notes && <p className="mt-2 text-xs text-muted italic">{booking.notes}</p>}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <CircleAlert className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {submitting ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" /> Confirmando…
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" /> Confirmar agendamento
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
