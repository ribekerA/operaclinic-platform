import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MessageCircleMore,
  Monitor,
  PhoneMissed,
  RefreshCcw,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { CommercialPlanGrid } from "@/components/public/commercial-plan-grid";
import { PublicSectionHeading } from "@/components/public/public-section-heading";

const painPoints = [
  {
    icon: PhoneMissed,
    title: "Lead perdido no WhatsApp",
    description:
      "A paciente chama, some no meio da conversa e a equipe perde o timing da venda e do agendamento.",
  },
  {
    icon: CalendarRange,
    title: "Agenda baguncada por profissional",
    description:
      "Horarios espalhados, confirmacao solta e remarcacao feita sem visao completa do dia da clinica estetica.",
  },
  {
    icon: BellRing,
    title: "No-show corroendo a receita",
    description:
      "Sem confirmacao e sem preparo da recepcao, a cadeira fica vazia e a operacao perde dinheiro.",
  },
  {
    icon: UsersRound,
    title: "Recepcao sobrecarregada",
    description:
      "Equipe pequena, muito atendimento no WhatsApp e pouca visibilidade para priorizar quem chega e quem precisa remarcar.",
  },
] as const;

const operatingSteps = [
  {
    eyebrow: "1. WhatsApp do paciente",
    title: "A paciente chega pelo canal que a clinica ja usa",
    description:
      "O primeiro contato continua no WhatsApp. O OperaClinic organiza a passagem do interesse para a agenda sem tirar a recepcao do controle.",
  },
  {
    eyebrow: "2. Agenda consistente",
    title: "A agenda respeita profissional, horario e regras da operacao",
    description:
      "A confirmacao do horario segue uma agenda por profissional com regras consistentes para criar, remarcar e cancelar sem bagunca.",
  },
  {
    eyebrow: "3. Recepcao no web",
    title: "A recepcao confirma, faz check-in e acompanha o dia",
    description:
      "No painel web, a equipe acompanha confirmacao, chegada, fila e remarcacao com muito menos improviso.",
  },
] as const;

const operationalBenefits = [
  "Menos lead perdido entre o WhatsApp e a agenda",
  "Menos no-show com confirmacao e recepcao mais organizada",
  "Mais controle por profissional, horario e unidade",
  "Mais clareza para remarcar, cancelar e acompanhar fila",
] as const;

const featureBlocks = [
  {
    icon: CalendarRange,
    title: "Agenda por profissional",
    description:
      "A agenda nasce organizada por profissional para harmonizacao facial, estetica avancada e outras rotinas da clinica estetica privada.",
  },
  {
    icon: MessageCircleMore,
    title: "WhatsApp como canal da paciente",
    description:
      "A paciente continua sem app nesta fase. O canal do paciente e o WhatsApp, sem quebrar a rotina real da clinica estetica.",
  },
  {
    icon: Monitor,
    title: "Recepcao web operacional",
    description:
      "A equipe localiza paciente, cria agendamento, confirma, faz check-in e trata no-show no mesmo painel.",
  },
  {
    icon: RefreshCcw,
    title: "Remarcacao com menos bagunca",
    description:
      "A recepcao consegue remarcar com mais clareza e sem perder o historico operacional do atendimento.",
  },
  {
    icon: ClipboardList,
    title: "Confirmacao e fila",
    description:
      "A clinica passa a enxergar o que precisa ser confirmado, quem chegou e como a fila esta andando.",
  },
  {
    icon: UserRoundCheck,
    title: "Mais controle da operacao",
    description:
      "Menos ruído na rotina da recepcao e mais previsibilidade para equipe, paciente e gestao.",
  },
] as const;

const audienceCards = [
  "Clinicas esteticas privadas com recepcao enxuta e muita demanda no WhatsApp.",
  "Operacoes de harmonizacao facial e estetica avancada que precisam mais controle da agenda.",
  "Clinicas pequenas e medias que ja sentem perda por remarcacao desorganizada e no-show.",
] as const;

export default function PublicHomePage() {
  return (
    <div className="space-y-24 pb-8">
      <section className="grid gap-10 xl:grid-cols-[1.08fr_0.92fr] xl:items-center">
        <div className="space-y-8">
          <div className="inline-flex rounded-full border border-white/70 bg-white/82 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent shadow-panel backdrop-blur">
            OperaClinic para clinicas esteticas privadas
          </div>

          <div className="space-y-5">
            <BrandLogo className="w-52 sm:w-60" priority />
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] text-ink sm:text-6xl">
              Menos lead perdido, menos no-show e mais controle da recepcao da
              sua clinica estetica.
            </h1>
            <p className="max-w-3xl text-base leading-8 text-slate-600">
              OperaClinic organiza a operacao da clinica estetica privada com
              agenda por profissional, confirmacao, check-in e recepcao web,
              enquanto o WhatsApp continua como canal da paciente.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/planos"
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Escolher plano
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/planos"
              className="inline-flex items-center rounded-xl border border-border px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-50"
            >
              Ver planos
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {operationalBenefits.map((benefit) => (
              <div
                key={benefit}
                className="flex items-start gap-3 rounded-[24px] border border-white/70 bg-white/82 px-4 py-4 text-sm leading-6 text-slate-700 shadow-panel backdrop-blur"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <span>{benefit}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[34px] border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_32px_110px_-58px_rgba(15,23,42,0.95)]">
          <div className="grid gap-5">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-teal-200">
                Rotina organizada
              </p>
              <h2 className="mt-3 text-2xl font-semibold leading-tight">
                Operacao comercial e recepcao falando a mesma lingua.
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                O OperaClinic aproxima lead, agenda e recepcao sem transformar a
                clinica em um sistema generico. O foco aqui e estetica privada
                com operacao real no WhatsApp.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <MessageCircleMore className="h-5 w-5 text-teal-300" />
                <p className="mt-3 text-sm font-semibold text-white">
                  WhatsApp do paciente
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  O primeiro contato continua onde a paciente responde mais
                  rapido.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <CalendarRange className="h-5 w-5 text-teal-300" />
                <p className="mt-3 text-sm font-semibold text-white">
                  Agenda por profissional
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Mais previsibilidade para equipe, horario e cadeira ocupada.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <Clock3 className="h-5 w-5 text-teal-300" />
                <p className="mt-3 text-sm font-semibold text-white">
                  Confirmacao e check-in
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  A recepcao acompanha quem confirmou, quem chegou e quem falta.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <ClipboardList className="h-5 w-5 text-teal-300" />
                <p className="mt-3 text-sm font-semibold text-white">
                  Menos remarcacao perdida
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Mais controle operacional para remarcar sem baguncar o dia.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-8">
        <PublicSectionHeading
          eyebrow="Dores da clinica estetica"
          title="O que mais trava a operacao quando a recepcao depende so de mensagem solta"
          description="A dor aqui nao e falta de canal. E falta de organizacao entre WhatsApp, agenda, confirmacao e recepcao."
        />

        <div className="grid gap-4 xl:grid-cols-4">
          {painPoints.map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.title}
                className="rounded-[28px] border border-slate-200 bg-white/92 p-6 shadow-panel"
              >
                <Icon className="h-6 w-6 text-accent" />
                <h3 className="mt-5 text-xl font-semibold leading-tight text-ink">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-8" id="operacao">
        <PublicSectionHeading
          eyebrow="Como funciona"
          title="Uma jornada publica pensada para clinica estetica, sem misturar acesso com landing"
          description="A vitrine vende operacao. O acesso fica separado. E a agenda continua consistente, sem improviso nem quebra da rotina da clinica estetica."
        />

        <div className="grid gap-4 xl:grid-cols-3">
          {operatingSteps.map((step) => (
            <div
              key={step.title}
              className="rounded-[28px] border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-6 shadow-panel"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                {step.eyebrow}
              </p>
              <h3 className="mt-4 text-2xl font-semibold leading-tight text-ink">
                {step.title}
              </h3>
              <p className="mt-4 text-sm leading-7 text-muted">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-8">
        <PublicSectionHeading
          eyebrow="Beneficios operacionais"
          title="O que muda na rotina quando a recepcao passa a operar com mais clareza"
          description="OperaClinic vende menos caos operacional e mais controle de agenda, confirmacao e atendimento para clinicas esteticas privadas."
        />

        <div className="grid gap-4 xl:grid-cols-4">
          {[
            "Mais previsibilidade da agenda do dia",
            "Mais visibilidade para confirmacao e no-show",
            "Mais controle para recepcao, gestor e equipe",
            "Mais consistencia entre lead, WhatsApp e atendimento",
          ].map((item) => (
            <div
              key={item}
              className="rounded-[26px] border border-white/70 bg-white/80 p-5 text-base font-semibold leading-7 text-ink shadow-panel backdrop-blur"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-8">
        <PublicSectionHeading
          eyebrow="Funcionalidades principais"
          title="Os blocos que sustentam a operacao da clinica estetica no dia a dia"
          description="Sem vender IA como headline. O valor principal aqui e organizacao da operacao."
        />

        <div className="grid gap-4 xl:grid-cols-3">
          {featureBlocks.map((block) => {
            const Icon = block.icon;

            return (
              <div
                key={block.title}
                className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-panel"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accentSoft">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="mt-5 text-2xl font-semibold leading-tight text-ink">
                  {block.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted">
                  {block.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-8">
        <PublicSectionHeading
          eyebrow="Para quem e"
          title="Feito para clinicas esteticas privadas que precisam vender e operar melhor"
          description="Nao e um produto generico para qualquer clinica. O foco agora e operacao de clinica estetica com recepcao e WhatsApp muito presentes."
        />

        <div className="grid gap-4 xl:grid-cols-3">
          {audienceCards.map((card) => (
            <div
              key={card}
              className="rounded-[28px] border border-slate-200 bg-white/92 p-6 shadow-panel"
            >
              <p className="text-lg font-semibold leading-8 text-ink">{card}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-8">
        <PublicSectionHeading
          eyebrow="Planos resumidos"
          title="Escolha o ritmo de implantacao mais coerente com a operacao da sua clinica estetica"
          description="Os cards abaixo ja leem o catalogo comercial real do backend. A jornada nasce no plano escolhido e segue para checkout e cadastro com estado persistido."
        />

        <CommercialPlanGrid />
      </section>

      <section className="rounded-[36px] border border-slate-200 bg-slate-950 px-7 py-8 text-white shadow-[0_28px_110px_-60px_rgba(15,23,42,0.95)] lg:px-10 lg:py-10">
        <div className="grid gap-6 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-teal-200">
              CTA final
            </p>
            <h2 className="max-w-3xl text-3xl font-semibold leading-tight">
              Se a sua clinica estetica ja sente peso em lead perdido, no-show e
              recepcao sobrecarregada, a proxima etapa e organizar a operacao.
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-slate-300">
              Entre pelos planos, inicie o cadastro comercial ou va direto para o
              acesso se sua equipe ja opera no OperaClinic.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/planos"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100"
            >
              Escolher plano
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/acesso"
              className="inline-flex items-center rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/5"
            >
              Ja tenho acesso
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
