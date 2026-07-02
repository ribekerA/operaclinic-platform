"use client";

import { useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  MapPin,
  MessageCircleMore,
  RefreshCw,
  Sparkles,
  Star,
  X,
} from "lucide-react";

// ─── Static clinic data ───────────────────────────────────────────────────────

const VITALIS_WA_DEMO_NUMBER = "5511981110099"; // mock number for demo

const SERVICES = [
  { name: "Avaliação Inicial Vitalis", duration: 30, tag: "Primeira consulta" },
  { name: "Limpeza de Pele Profunda", duration: 60, tag: "Facial" },
  { name: "Toxina Botulínica", duration: 30, tag: "Harmonização" },
  { name: "Preenchimento Labial", duration: 45, tag: "Harmonização" },
  { name: "Microagulhamento Facial", duration: 45, tag: "Rejuvenescimento" },
  { name: "Radiofrequência Facial", duration: 60, tag: "Firmeza" },
];

const PROFESSIONALS = [
  {
    name: "Dra. Ana Ferreira",
    role: "Deratologista estética",
    bio: "Especialista em estética facial avançada com mais de 8 anos de experiência em harmonização e rejuvenescimento.",
    initials: "AF",
    color: "from-rose-400 to-rose-600",
  },
  {
    name: "Dr. Carlos Lima",
    role: "Esteticista clínico",
    bio: "Referência em preenchimentos e toxina botulínica, com formação internacional em harmonização facial.",
    initials: "CL",
    color: "from-emerald-400 to-emerald-700",
  },
];

const DEMO_PATIENTS = [
  { name: "Sofia Almeida", phone: "5511981110001" },
  { name: "Bruno Carvalho", phone: "5511981110002" },
  { name: "Mariana Costa", phone: "5511981110003" },
  { name: "Lucas Pereira", phone: "5511981110004" },
  { name: "Beatriz Santos", phone: "5511981110005" },
];

const DEMO_CREDENTIALS = [
  { label: "Admin", email: "admin@vitalis.demo", password: "Vitalis@123" },
  { label: "Recepção", email: "recepcao@vitalis.demo", password: "Vitalis@123" },
  { label: "Dra. Ana", email: "ana@vitalis.demo", password: "Vitalis@123" },
  { label: "Dr. Carlos", email: "carlos@vitalis.demo", password: "Vitalis@123" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-1.5 rounded p-0.5 text-slate-400 transition hover:text-emerald-600"
      aria-label="Copiar"
    >
      {copied ? <span className="text-[10px] font-bold text-emerald-600">✓</span> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// ─── Demo Panel (collapsible, for presenters) ─────────────────────────────────

function DemoPanel() {
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const apiBase = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : "http://localhost:3001";

  async function handleReset() {
    const secret = window.prompt("DEMO_RESET_SECRET:");
    if (!secret) return;

    setResetting(true);
    setResetMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/demo/vitalis/reset`, {
        method: "POST",
        headers: { "x-demo-reset-token": secret },
      });
      const data = await res.json() as { ok?: boolean; cleared?: { appointments: number; threads: number }; created?: { appointments: number }; message?: string };
      if (data.ok) {
        setResetMsg(
          `✓ Reset concluído — removidos: ${data.cleared?.appointments} agendamentos, ${data.cleared?.threads} threads. Criados: ${data.created?.appointments} agendamentos.`,
        );
      } else {
        setResetMsg(`Erro: ${data.message ?? "falha desconhecida"}`);
      }
    } catch (e) {
      setResetMsg(`Erro de rede: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 bg-emerald-600 px-4 py-2.5 text-left text-xs font-semibold text-white transition hover:bg-emerald-700"
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          Painel Demo — Clínica Vitalis
        </span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="max-h-[60vh] overflow-y-auto px-4 py-4 text-xs">
          {/* Patients */}
          <p className="mb-2 font-semibold text-slate-700">Pacientes de teste</p>
          <div className="mb-4 space-y-1">
            {DEMO_PATIENTS.map((p) => (
              <div key={p.phone} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1">
                <span className="text-slate-600">{p.name}</span>
                <span className="flex items-center font-mono text-emerald-700">
                  {p.phone}
                  <CopyButton text={p.phone} />
                </span>
              </div>
            ))}
          </div>

          {/* Credentials */}
          <p className="mb-2 font-semibold text-slate-700">Credenciais do painel</p>
          <div className="mb-4 space-y-1">
            {DEMO_CREDENTIALS.map((c) => (
              <div key={c.email} className="rounded bg-slate-50 px-2 py-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">{c.label}</span>
                  <a
                    href="/login/clinic"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-emerald-600 hover:underline"
                  >
                    Login <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
                <span className="font-mono text-slate-500">{c.email}</span>
                <CopyButton text={c.email} />
                <span className="ml-1 font-mono text-slate-400">{c.password}</span>
                <CopyButton text={c.password} />
              </div>
            ))}
          </div>

          {/* Reset */}
          <p className="mb-2 font-semibold text-slate-700">Reset dos dados</p>
          <button
            onClick={() => void handleReset()}
            disabled={resetting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${resetting ? "animate-spin" : ""}`} />
            {resetting ? "Resetando..." : "Resetar demo agora"}
          </button>
          {resetMsg && (
            <p className={`mt-2 rounded p-2 text-[10px] ${resetMsg.startsWith("✓") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {resetMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VitalisDemoPage() {
  const waLink = `https://wa.me/${VITALIS_WA_DEMO_NUMBER}?text=Ol%C3%A1%2C%20gostaria%20de%20agendar%20uma%20consulta%20na%20Cl%C3%ADnica%20Vitalis%21`;

  return (
    <div className="min-h-screen bg-white text-slate-800">
      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 shadow-sm">
              <Sparkles className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <p className="text-[15px] font-bold leading-none tracking-tight text-slate-900">Clínica Vitalis</p>
              <p className="text-[10px] leading-none text-emerald-600">Estética Avançada</p>
            </div>
          </div>

          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 sm:flex">
            <a href="#servicos" className="transition hover:text-emerald-700">Serviços</a>
            <a href="#equipe" className="transition hover:text-emerald-700">Equipe</a>
            <a href="#localizacao" className="transition hover:text-emerald-700">Localização</a>
          </nav>

          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-emerald-700"
          >
            <MessageCircleMore className="h-4 w-4" />
            Agendar
          </a>
        </div>
      </header>

      <main>
        {/* ── HERO ─────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50 to-white px-6 py-20 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 20% 50%, rgba(52,211,153,0.18), transparent 50%), radial-gradient(circle at 80% 20%, rgba(20,184,166,0.15), transparent 45%)`,
            }}
          />

          <div className="relative mx-auto max-w-2xl space-y-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700 shadow-sm">
              <Star className="h-3 w-3 fill-emerald-500 text-emerald-500" />
              Excelência em Estética Facial
            </span>

            <h1 className="text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
              Beleza e bem-estar com
              <br />
              <span className="text-emerald-600">quem entende de você</span>
            </h1>

            <p className="text-base leading-8 text-slate-500 sm:text-lg">
              Tratamentos faciais de alta performance com profissionais especializados.
              Agende pelo WhatsApp em menos de 2 minutos.
            </p>

            <div className="flex flex-wrap justify-center gap-3">
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-700"
              >
                <MessageCircleMore className="h-4 w-4" />
                Agendar pelo WhatsApp
              </a>
              <a
                href="#servicos"
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
              >
                Ver serviços
              </a>
            </div>

            <p className="text-xs text-slate-400">
              Seg–Sex 8h–17h · Sáb 8h–12h · Unidade Centro, São Paulo
            </p>
          </div>
        </section>

        {/* ── SERVIÇOS ─────────────────────────────────────────────── */}
        <section id="servicos" className="px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Tratamentos
              </p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">
                Nossos serviços
              </h2>
              <p className="mt-3 text-sm text-slate-500">
                Protocolos desenvolvidos para resultados reais, com tecnologia e expertise especializada.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SERVICES.map((svc) => (
                <div
                  key={svc.name}
                  className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span className="mb-4 inline-block rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                    {svc.tag}
                  </span>
                  <h3 className="text-base font-semibold text-slate-900">{svc.name}</h3>
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock className="h-3.5 w-3.5" />
                    {svc.duration} minutos
                  </div>
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 transition group-hover:text-emerald-700"
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    Agendar este tratamento
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── EQUIPE ────────────────────────────────────────────────── */}
        <section id="equipe" className="bg-slate-50 px-6 py-20">
          <div className="mx-auto max-w-4xl">
            <div className="mb-12 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Especialistas
              </p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">Nossa equipe</h2>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {PROFESSIONALS.map((pro) => (
                <div key={pro.name} className="flex gap-5 rounded-2xl bg-white p-6 shadow-sm">
                  <div
                    className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${pro.color} text-xl font-bold text-white shadow`}
                  >
                    {pro.initials}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{pro.name}</p>
                    <p className="text-xs font-medium text-emerald-600">{pro.role}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{pro.bio}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── DEPOIMENTOS ──────────────────────────────────────────── */}
        <section className="px-6 py-20">
          <div className="mx-auto max-w-4xl">
            <div className="mb-12 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Pacientes
              </p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">O que dizem nossas pacientes</h2>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              {[
                { text: "Marquei pelo WhatsApp em 5 minutos. A Dra. Ana foi incrível, me explicou tudo antes de começar.", name: "Sofia A.", service: "Limpeza de Pele" },
                { text: "Primeiro preenchimento labial da minha vida. O Dr. Carlos tem um olhar clínico excepcional.", name: "Beatriz S.", service: "Preenchimento Labial" },
                { text: "Fiz o microagulhamento e ficou muito acima do esperado. A clínica é organizada e o atendimento impecável.", name: "Mariana C.", service: "Microagulhamento" },
              ].map(({ text, name, service }) => (
                <div key={name} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                  <div className="mb-3 flex gap-0.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm leading-7 text-slate-600">"{text}"</p>
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-slate-800">{name}</p>
                    <p className="text-[10px] text-slate-400">{service}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────── */}
        <section className="bg-gradient-to-br from-emerald-600 to-teal-800 px-6 py-16 text-center text-white">
          <div className="mx-auto max-w-xl space-y-5">
            <h2 className="text-3xl font-bold">Pronta para começar?</h2>
            <p className="text-sm leading-7 text-emerald-100">
              Agende sua consulta inicial pelo WhatsApp. Rápido, sem complicação —
              nossa assistente responde na hora.
            </p>
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-4 text-sm font-bold text-emerald-700 shadow-lg transition hover:bg-emerald-50"
            >
              <MessageCircleMore className="h-5 w-5" />
              Agendar pelo WhatsApp agora
            </a>
          </div>
        </section>

        {/* ── LOCALIZAÇÃO ──────────────────────────────────────────── */}
        <section id="localizacao" className="px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
              <div className="space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
                  Onde estamos
                </p>
                <h2 className="text-2xl font-bold text-slate-900">Vitalis - Unidade Centro</h2>
                <div className="flex items-start gap-3 text-sm text-slate-600">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <p>Av. Paulista, 1000 — 5º andar</p>
                    <p>Bela Vista, São Paulo – SP</p>
                    <p className="mt-1 text-xs text-slate-400">CEP: 01310-100</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <Clock className="h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <p>Seg–Sex: 8h às 17h</p>
                    <p>Sábado: 8h às 12h</p>
                  </div>
                </div>
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  <MessageCircleMore className="h-4 w-4" />
                  Falar pelo WhatsApp
                </a>
              </div>

              {/* Fake map placeholder */}
              <div className="relative h-64 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 lg:h-80">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(52,211,153,0.18),transparent_60%)]" />
                <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                  <MapPin className="h-8 w-8 text-emerald-500" />
                  <p className="text-sm font-medium">Av. Paulista, 1000</p>
                  <p className="text-xs">São Paulo, SP</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 bg-slate-900 px-6 py-10 text-slate-400">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Clínica Vitalis</p>
                <p className="text-[10px] text-emerald-400">Estética Avançada</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs">
              <a href="#servicos" className="transition hover:text-white">Serviços</a>
              <a href="#equipe" className="transition hover:text-white">Equipe</a>
              <a href="#localizacao" className="transition hover:text-white">Localização</a>
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="transition hover:text-white">WhatsApp</a>
            </div>

            <a
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-medium text-slate-400 transition hover:border-emerald-500/30 hover:text-emerald-400"
            >
              Powered by OperaClinic
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>

          <div className="mt-8 border-t border-white/5 pt-6 text-center text-[10px] text-slate-500">
            © {new Date().getFullYear()} Clínica Vitalis. Esta é uma clínica fictícia criada para demonstração do OperaClinic.
          </div>
        </div>
      </footer>

      {/* Demo control panel — always visible for presenters */}
      <DemoPanel />
    </div>
  );
}
