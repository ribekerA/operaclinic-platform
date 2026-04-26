import { ArrowRight, BadgeCheck, CalendarRange, MessageCircleMore } from "lucide-react";
import Link from "next/link";
import { CommercialPlanGrid } from "@/components/public/commercial-plan-grid";
import { PublicSectionHeading } from "@/components/public/public-section-heading";

export default function PublicPlansPage() {
  return (
    <div className="space-y-16 pb-8">
      <section className="grid gap-8 xl:grid-cols-[1.02fr_0.98fr] xl:items-center">
        <div className="space-y-5">
          <div className="inline-flex rounded-full border border-white/70 bg-white/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent shadow-panel backdrop-blur">
            Planos da operacao
          </div>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1] text-ink sm:text-6xl">
            Escolha o plano publico que acompanha a rotina da sua clinica estetica.
          </h1>
          <p className="max-w-3xl text-base leading-8 text-muted">
            Aqui o plano ja conversa com o backend comercial real. Ao escolher a
            opcao certa, o OperaClinic inicia um onboarding proprio para a sua
            clinica estetica e segue para checkout e cadastro sem depender de placeholder.
          </p>
        </div>

        <div className="grid gap-3 rounded-[30px] border border-slate-200 bg-white p-6 shadow-panel">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <MessageCircleMore className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <p className="text-sm leading-6 text-slate-700">
              O canal da paciente continua sendo o WhatsApp, sem app proprio nesta fase.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <CalendarRange className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <p className="text-sm leading-6 text-slate-700">
              A agenda continua protegida por regras consistentes para criar,
              remarcar e cancelar.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <p className="text-sm leading-6 text-slate-700">
              A recepcao acompanha confirmacao, check-in e fila sem depender de
              planilha ou conversa solta.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-8">
        <PublicSectionHeading
          eyebrow="Planos resumidos"
          title="O catalogo comercial agora nasce do backend real"
          description="Ao escolher um plano, o sistema cria um onboarding comercial proprio para a sua clinica estetica e leva a jornada para checkout e cadastro com estado persistido."
        />

        <CommercialPlanGrid mode="detailed" />
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-gradient-to-r from-white to-slate-50 px-7 py-8 shadow-panel lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
              Proximo passo
            </p>
            <h2 className="text-3xl font-semibold leading-tight text-ink">
              Ja iniciou um onboarding comercial? Retome do ponto certo.
            </h2>
            <p className="text-sm leading-7 text-muted">
              Checkout e cadastro agora leem o estado real do onboarding. Se voce
              ja tinha uma jornada aberta, pode continuar sem misturar isso com o
              login da clinica estetica.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/checkout"
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Ir para checkout
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/cadastro"
              className="inline-flex items-center rounded-xl border border-border px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-50"
            >
              Ir para cadastro
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
