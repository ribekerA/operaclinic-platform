import { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  LayoutDashboard,
  MessageCircleMore,
  Monitor,
  Shield,
  Users,
  Zap,
} from "lucide-react";
import { CommercialPlanGrid } from "@/components/public/commercial-plan-grid";
import { HomeProductPreview } from "@/components/public/home-product-preview";
import { AnimatedStat } from "@/components/public/animated-stat";

export const metadata: Metadata = {
  title: "OperaClinic | Menos no-show e mais controle para clínicas estéticas",
  description:
    "Sistema de agenda, recepção e WhatsApp para clínicas de estética. Reduza no-show, organize confirmações e opere com mais controle. Ative em 48h.",
  alternates: {
    canonical: "https://operaclinic.com.br",
  },
  openGraph: {
    title: "OperaClinic | Menos no-show e mais controle para clínicas estéticas",
    description:
      "Sistema de agenda, recepção e WhatsApp para clínicas de estética. Reduza no-show, organize confirmações e opere com mais controle. Ative em 48h.",
    url: "https://operaclinic.com.br",
    siteName: "OperaClinic",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: "OperaClinic — Gestão para clínicas de estética",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OperaClinic | Menos no-show e mais controle para clínicas estéticas",
    description:
      "Agenda, recepção e WhatsApp para clínicas de estética. Reduza no-show e opere com mais controle. Ative em 48h.",
    images: ["/brand/og-image.png"],
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "O OperaClinic funciona com WhatsApp?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sim. O OperaClinic é integrado ao WhatsApp que sua clínica já usa. A paciente não precisa instalar nenhum app — o contato continua pelo WhatsApp e a operação fica organizada no painel.",
      },
    },
    {
      "@type": "Question",
      name: "Em quanto tempo minha clínica fica ativa no OperaClinic?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A ativação da operação completa leva 48 horas após a confirmação do pagamento. Não há migração complexa nem treinamento extenso.",
      },
    },
    {
      "@type": "Question",
      name: "O OperaClinic reduz no-show?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sim. A confirmação automática é enviada 24h antes do agendamento. Quem não confirma entra automaticamente na fila de atenção da recepção. Clínicas que usam o Flow reportam até 40% de redução de no-show.",
      },
    },
    {
      "@type": "Question",
      name: "Existe contrato de fidelidade?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Não. Não há contrato de fidelidade. Você pode cancelar a qualquer momento pelo painel ou via WhatsApp.",
      },
    },
    {
      "@type": "Question",
      name: "Quais são os planos disponíveis?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "O OperaClinic oferece três planos: Start (agenda e recepção web), Flow (WhatsApp integrado e confirmação automática) e Scale (agentes de IA e dashboard executivo). Veja os detalhes e preços em operaclinic.com.br/planos.",
      },
    },
  ],
};

export default function PublicHomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {/* Sticky mobile CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:hidden">
        <Link
          href="/planos"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-semibold text-white transition active:opacity-90"
        >
          Ver planos e começar
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="space-y-24 pb-20 sm:pb-8">

        {/* ── HERO ─────────────────────────────────────────────────── */}
        <section className="relative flex min-h-[76vh] flex-col items-start justify-center gap-12 xl:flex-row xl:items-center">
          <div className="max-w-2xl space-y-6">
            <span
              className="animate-oc-fade-up inline-flex rounded-full border border-white/70 bg-white/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent shadow-panel backdrop-blur"
              style={{ animationDelay: "0ms" }}
            >
              Para clínicas estéticas privadas
            </span>

            <h1
              className="animate-oc-fade-up text-5xl font-semibold leading-[1.02] text-ink sm:text-6xl xl:text-7xl"
              style={{ animationDelay: "80ms" }}
            >
              Menos{" "}
              <span className="text-gradient-teal">no-show.</span>
              <br />
              Mais&nbsp;controle.
            </h1>

            <p
              className="animate-oc-fade-up text-lg leading-8 text-slate-600 sm:text-xl"
              style={{ animationDelay: "160ms" }}
            >
              Agenda por profissional, confirmação automática e recepção web —
              com o WhatsApp que sua clínica já usa.
            </p>

            <div
              className="animate-oc-fade-up flex flex-wrap items-center gap-3"
              style={{ animationDelay: "240ms" }}
            >
              <Link
                href="/planos"
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-white shadow-[0_4px_24px_rgba(15,118,110,0.30)] transition hover:bg-teal-700 hover:shadow-[0_6px_30px_rgba(15,118,110,0.40)]"
              >
                Começar agora
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/acesso"
                className="inline-flex items-center rounded-xl border border-border bg-white/80 px-6 py-3.5 text-sm font-semibold text-ink backdrop-blur transition hover:bg-white"
              >
                Já tenho acesso
              </Link>
            </div>

            <p
              className="animate-oc-fade-up text-xs text-muted"
              style={{ animationDelay: "320ms" }}
            >
              Ativa em 48h · Sem contrato de fidelidade · Suporte via WhatsApp
            </p>

            {/* Testimonial card */}
            <div
              className="animate-oc-fade-up rounded-[20px] border border-slate-200 bg-white/80 px-5 py-4 shadow-panel backdrop-blur xl:max-w-sm"
              style={{ animationDelay: "400ms" }}
            >
              <div className="mb-2.5 flex gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <svg key={i} className="h-3.5 w-3.5 fill-amber-400" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-sm leading-6 text-slate-700">
                "Paramos de perder atendimento por no-show e remarcação solta.
                A recepção agora tem controle de verdade."
              </p>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-teal-700 text-sm font-bold text-white shadow-sm">
                  R
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink">Rafaela Mendes</p>
                  <p className="text-xs text-muted">Studio RM Harmonização · São Paulo</p>
                </div>
              </div>
            </div>
          </div>

          <HomeProductPreview />
        </section>

        {/* ── NÚMEROS ──────────────────────────────────────────────── */}
        <section
          aria-label="Resultados operacionais"
          className="rounded-[30px] border border-slate-200 bg-white px-6 py-10 shadow-panel sm:px-10"
        >
          <div className="mb-8 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
              Resultados reais
            </p>
            <p className="mt-1 text-sm text-muted">
              O que clínicas estéticas ganham ao operar com o OperaClinic.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
            <AnimatedStat value="48h" label="para ativar a operação completa" delay={0} />
            <AnimatedStat value="-40%" label="de no-show com confirmação automática" delay={120} />
            <AnimatedStat value="100%" label="sem app para a paciente — só WhatsApp" delay={240} />
          </div>
        </section>

        {/* ── COMO FUNCIONA ────────────────────────────────────────── */}
        <section className="space-y-10" id="como-funciona">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
              Como funciona
            </p>
            <h2 className="max-w-2xl text-3xl font-semibold leading-tight text-ink sm:text-4xl">
              Do primeiro contato ao check-in em 3 etapas.
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                num: "01",
                icon: MessageCircleMore,
                title: "Paciente chega pelo WhatsApp",
                desc: "O canal não muda. O OperaClinic organiza o interesse da paciente direto para a agenda — sem tirar a recepção do controle.",
                accent: false,
              },
              {
                num: "02",
                icon: CalendarCheck,
                title: "Agenda confirma o horário",
                desc: "A confirmação automática sai 24h antes. Quem não confirma entra na fila de atenção da recepção — sem depender de ligação.",
                accent: true,
              },
              {
                num: "03",
                icon: Monitor,
                title: "Recepção opera o dia no web",
                desc: "Check-in, fila, no-show e remarcação no painel. A equipe enxerga tudo — e a cadeira fica menos vazia.",
                accent: false,
              },
            ].map(({ num, icon: Icon, title, desc, accent }) => (
              <div
                key={num}
                className={`group rounded-[28px] p-7 shadow-panel transition-transform duration-300 hover:-translate-y-1 ${
                  accent
                    ? "border border-accent/25 bg-gradient-to-b from-accentSoft/70 to-white"
                    : "border border-slate-200 bg-gradient-to-b from-white to-slate-50/80"
                }`}
              >
                <div className="flex items-start justify-between">
                  <p
                    className={`text-4xl font-bold ${
                      accent ? "text-accent/30" : "text-slate-200"
                    }`}
                  >
                    {num}
                  </p>
                  <div
                    className={`rounded-2xl p-2.5 ${
                      accent ? "bg-accent/10" : "bg-slate-100"
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 ${
                        accent ? "text-accent" : "text-slate-500"
                      }`}
                    />
                  </div>
                </div>
                <h3 className="mt-5 text-xl font-semibold leading-tight text-ink">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── DIFERENCIAL ──────────────────────────────────────────── */}
        <section className="grid gap-8 xl:grid-cols-2 xl:items-center">
          <div className="space-y-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
              Por que o OperaClinic
            </p>
            <h2 className="text-3xl font-semibold leading-tight text-ink sm:text-4xl">
              Feito para o ritmo de clínica estética — não para hospital.
            </h2>
            <p className="text-base leading-8 text-muted">
              A maioria dos sistemas de agenda é genérico demais. O OperaClinic
              foi desenhado para a rotina real de harmonização facial e estética
              avançada: WhatsApp como canal, recepção web no centro e agenda
              protegida por profissional.
            </p>
            <ul className="grid gap-3.5">
              {[
                {
                  icon: MessageCircleMore,
                  text: "Sem app para a paciente — ela usa o WhatsApp de sempre",
                },
                {
                  icon: Users,
                  text: "Agenda com regras por profissional, não por sala genérica",
                },
                {
                  icon: Zap,
                  text: "Recepção web sem precisar de treinamento extenso",
                },
                {
                  icon: Shield,
                  text: "Confirmação automática que realmente reduz no-show",
                },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3 text-sm leading-6 text-slate-700">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accentSoft">
                    <Icon className="h-3 w-3 text-accent" />
                  </div>
                  {text}
                </li>
              ))}
            </ul>
            <Link
              href="/planos"
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Ver planos e preços
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-3">
            {[
              {
                before: "Agenda no WhatsApp pessoal da recepção",
                after: "Recepção web com agenda centralizada e histórico completo",
              },
              {
                before: "No-show sem aviso, cadeira vazia sem lista de espera",
                after: "Confirmação automática 24h antes + fila de espera ativa",
              },
              {
                before: "Lead que chama, some e nunca agenda",
                after: "Interesse capturado e encaminhado direto para a agenda",
              },
            ].map(({ before, after }) => (
              <div
                key={before}
                className="grid grid-cols-2 overflow-hidden rounded-[22px] border border-slate-200 bg-white text-sm shadow-panel"
              >
                <div className="border-r border-slate-200 bg-red-50/60 px-4 py-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">
                    Antes
                  </p>
                  <p className="mt-2 leading-6 text-slate-400 line-through decoration-red-300/60">
                    {before}
                  </p>
                </div>
                <div className="bg-teal-50/40 px-4 py-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-accent">
                    Com OperaClinic
                  </p>
                  <p className="mt-2 leading-6 font-medium text-slate-800">{after}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── PLANOS ───────────────────────────────────────────────── */}
        <section className="space-y-8" id="planos">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
              Planos
            </p>
            <h2 className="max-w-xl text-3xl font-semibold leading-tight text-ink sm:text-4xl">
              Escolha o plano certo para o tamanho da sua operação.
            </h2>
          </div>
          <CommercialPlanGrid />
        </section>

        {/* ── CTA FINAL ────────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-[36px] bg-slate-950 px-7 py-12 text-white lg:px-12 lg:py-16">
          {/* Central teal glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="h-[320px] w-[520px] rounded-full bg-teal-500/15 blur-[80px]" />
          </div>
          {/* Subtle dot grid */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)`,
              backgroundSize: "32px 32px",
            }}
          />

          <div className="relative mx-auto max-w-2xl space-y-6 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-teal-300">
              Pronto para organizar a operação?
            </p>
            <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">
              Sua clínica estética pode operar assim em 48h.
            </h2>
            <p className="text-sm leading-7 text-slate-300">
              Sem migração complexa. Sem treinamento extenso. Você escolhe o
              plano, cadastra a clínica e já pode operar.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/planos"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-ink shadow-[0_4px_20px_rgba(255,255,255,0.15)] transition hover:bg-slate-100"
              >
                Escolher meu plano
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="https://wa.me/5511968771362?text=Ola%2C%20gostaria%20de%20saber%20mais%20sobre%20o%20OperaClinic!"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10"
                aria-label="Falar com o comercial do OperaClinic via WhatsApp"
              >
                <MessageCircleMore className="h-4 w-4 text-teal-300" />
                Falar com comercial
              </a>
            </div>

            {/* Access quick links */}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-white/10 pt-6 text-xs text-slate-400">
              <Link
                href="/login/clinic"
                className="flex items-center gap-1.5 transition hover:text-white"
              >
                <Monitor className="h-3.5 w-3.5 text-teal-400" />
                Acessar como clínica
              </Link>
              <Link
                href="/login/platform"
                className="flex items-center gap-1.5 transition hover:text-white"
              >
                <LayoutDashboard className="h-3.5 w-3.5 text-teal-400" />
                Acessar plataforma
              </Link>
              <Link href="/acesso" className="transition hover:text-white">
                Todos os acessos →
              </Link>
            </div>
          </div>
        </section>

      </div>
    </>
  );
}
