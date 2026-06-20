import { Metadata } from "next";
import { ArrowRight, Bot, BarChart3, MessageCircleMore } from "lucide-react";
import Link from "next/link";
import { CommercialPlanGrid } from "@/components/public/commercial-plan-grid";
import { OnboardingProgress } from "@/components/public/onboarding-progress";
import { PlanComparisonTable } from "@/components/public/plan-comparison-table";
import { PublicSectionHeading } from "@/components/public/public-section-heading";

export const metadata: Metadata = {
  title: "Planos e Preços",
  description:
    "Conheça os planos do OperaClinic: Start, Flow e Scale. Escolha a opção ideal para a operação da sua clínica de estética e ative em 48h.",
  alternates: {
    canonical: "https://operaclinic.com.br/planos",
  },
  openGraph: {
    title: "Planos e Preços | OperaClinic",
    description:
      "Planos Start, Flow e Scale para clínicas de estética. Agenda, recepção web, WhatsApp integrado e IA. Sem contrato de fidelidade. Ative em 48h.",
    url: "https://operaclinic.com.br/planos",
    siteName: "OperaClinic",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: "Planos OperaClinic — Start, Flow e Scale para clínicas estéticas",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Planos e Preços | OperaClinic",
    description:
      "Start, Flow e Scale para clínicas de estética. Sem contrato de fidelidade. Ative em 48h.",
    images: ["/brand/og-image.png"],
  },
};

export default function PublicPlansPage() {
  return (
    <div className="space-y-16 pb-8">
      <div>
        <OnboardingProgress currentStep={1} />
      </div>

      {/* Hero */}
      <section className="grid gap-8 xl:grid-cols-[1.02fr_0.98fr] xl:items-center">
        <div className="space-y-5">
          <div className="inline-flex rounded-full border border-white/70 bg-white/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent shadow-panel backdrop-blur">
            Planos da operação
          </div>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1] text-ink sm:text-6xl">
            Escolha o plano que acompanha a rotina da sua clínica estética.
          </h1>
          <p className="max-w-3xl text-base leading-8 text-muted">
            Cada plano adiciona uma camada de controle real sobre a operação —
            da agenda básica ao agendamento automatizado por IA.
          </p>
        </div>

        <div className="grid gap-3 rounded-[30px] border border-slate-200 bg-white p-6 shadow-panel">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <MessageCircleMore className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-semibold text-ink">Start — Organize a operação</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                Agenda por profissional, recepção web e base de pacientes. O suficiente para parar de depender de planilha.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-semibold text-ink">Flow — Domine o WhatsApp</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                Canal integrado, confirmação automática, lista de espera e KPIs. Para reduzir no-show de verdade.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <Bot className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-semibold text-ink">Scale — Opere com IA</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                Agentes de captação e agendamento, dashboard executivo e protocolos por procedimento.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Plan cards */}
      <section className="space-y-8">
        <PublicSectionHeading
          eyebrow="Planos disponíveis"
          title="Escolha o plano e inicie seu cadastro"
          description="Ao escolher um plano, criamos um onboarding exclusivo para a sua clínica estética. O acesso ao painel é liberado após a confirmação do pagamento."
        />

        <CommercialPlanGrid mode="detailed" />
      </section>

      {/* Comparison table */}
      <section className="space-y-8">
        <PublicSectionHeading
          eyebrow="O que cada plano inclui"
          title="Compare os planos lado a lado."
          description="Cada linha mostra exatamente o que está disponível em cada plano — sem letras miúdas."
        />

        <PlanComparisonTable />
      </section>

      {/* Resume CTA */}
      <section className="rounded-[32px] border border-slate-200 bg-gradient-to-r from-white to-slate-50 px-7 py-8 shadow-panel lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
              Já iniciou um cadastro?
            </p>
            <h2 className="text-3xl font-semibold leading-tight text-ink">
              Retome de onde parou.
            </h2>
            <p className="text-sm leading-7 text-muted">
              Se você já tem um onboarding em andamento, pode continuar pelo
              checkout ou pelo cadastro sem precisar começar do zero.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/checkout"
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Continuar checkout
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/cadastro"
              className="inline-flex items-center rounded-xl border border-border px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-50"
            >
              Continuar cadastro
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
