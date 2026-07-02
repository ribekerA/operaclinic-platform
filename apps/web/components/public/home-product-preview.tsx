"use client";

import { CheckCircle2, Clock3, MessageCircleMore, XCircle } from "lucide-react";

const appointments = [
  { time: "09:00", name: "Mariana Costa", type: "Harmonização facial", status: "confirmed" },
  { time: "10:15", name: "Julia Ferreira", type: "Bioestimulador", status: "checkin" },
  { time: "11:30", name: "Ana Paula Lima", type: "Toxina botulínica", status: "pending" },
  { time: "14:00", name: "Camila Souza", type: "Preenchimento labial", status: "noshow" },
  { time: "15:30", name: "Beatriz Rocha", type: "Harmonização facial", status: "confirmed" },
];

const statusConfig = {
  confirmed: { label: "Confirmada", color: "text-teal-700 bg-teal-50 border-teal-200" },
  checkin: { label: "Check-in", color: "text-blue-700 bg-blue-50 border-blue-200" },
  pending: { label: "Aguardando", color: "text-amber-700 bg-amber-50 border-amber-200" },
  noshow: { label: "No-show", color: "text-red-600 bg-red-50 border-red-200" },
} as const;

export function HomeProductPreview() {
  return (
    <div className="relative shrink-0">
      {/* Glow shadow underneath */}
      <div
        aria-hidden
        className="absolute -bottom-8 left-1/2 h-14 w-4/5 -translate-x-1/2 rounded-full bg-teal-500/20 blur-2xl"
      />

      <div className="animate-oc-float w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_40px_100px_-30px_rgba(15,23,42,0.22)] xl:max-w-[400px]">
        {/* Browser chrome */}
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-100/80 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400/60" />
          <div className="mx-2 flex-1 rounded-md border border-slate-200 bg-white/90 px-2 py-0.5 text-[9px] text-slate-400">
            app.operaclinic.com.br/recepcao
          </div>
        </div>

        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              Recepção · Hoje
            </p>
            <p className="mt-0.5 text-sm font-semibold text-ink">5 atendimentos</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="animate-oc-live-ring flex h-2 w-2 rounded-full bg-teal-400" />
            <span className="text-xs font-medium text-teal-700">Ao vivo</span>
          </div>
        </div>

        {/* Appointments */}
        <div className="divide-y divide-slate-100">
          {appointments.map((appt) => {
            const cfg = statusConfig[appt.status as keyof typeof statusConfig];
            return (
              <div key={appt.name} className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-10 shrink-0 text-center">
                  <p className="text-xs font-bold text-ink">{appt.time}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{appt.name}</p>
                  <p className="truncate text-xs text-muted">{appt.type}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.color}`}
                >
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* WhatsApp strip */}
        <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <MessageCircleMore className="h-4 w-4 shrink-0 text-teal-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-ink">Mariana Costa</p>
              <p className="truncate text-[11px] text-muted">
                Confirmei! Estarei às 9h pontualmente ✅
              </p>
            </div>
            <span className="rounded-full bg-teal-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              1
            </span>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 border-t border-slate-100 bg-white">
          {[
            { icon: CheckCircle2, value: "3", label: "Confirmadas", color: "text-teal-600" },
            { icon: Clock3, value: "1", label: "Aguardando", color: "text-amber-500" },
            { icon: XCircle, value: "1", label: "No-show", color: "text-red-500" },
          ].map(({ icon: Icon, value, label, color }) => (
            <div key={label} className="flex flex-col items-center gap-1 py-3.5">
              <Icon className={`h-4 w-4 ${color}`} />
              <p className="text-lg font-bold text-ink">{value}</p>
              <p className="text-[10px] text-muted">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
