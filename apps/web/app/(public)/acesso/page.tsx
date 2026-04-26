import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarRange,
  Monitor,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { PublicSectionHeading } from "@/components/public/public-section-heading";

interface AccessHubPageProps {
  searchParams?: Promise<{
    source?: string;
    target?: string;
  }>;
}

function resolveAccessLeadMessage(
  source: string | undefined,
  target: string | undefined,
): { eyebrow: string; message: string } | null {
  if (source === "cadastro" || source === "checkout") {
    return {
      eyebrow: "Continuidade da jornada",
      message:
        target === "clinic"
          ? "Se sua clinica estetica ja recebeu credenciais depois da etapa comercial, o proximo passo e entrar na clinica estetica."
          : "A etapa comercial foi concluida. Agora escolha a entrada certa para continuar.",
    };
  }

  return null;
}

export default async function AccessHubPage({
  searchParams,
}: AccessHubPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const leadMessage = resolveAccessLeadMessage(
    resolvedSearchParams.source,
    resolvedSearchParams.target,
  );

  return (
    <div className="space-y-12 pb-8">
      <section className="mx-auto max-w-4xl space-y-5 text-center">
        <PublicSectionHeading
          eyebrow="Acesso"
          title="Escolha a entrada certa e siga direto para o contexto correto"
          description="A landing vende a operacao da clinica estetica. O acesso fica aqui, separado e claro. Clinica e plataforma continuam no mesmo ecossistema visual, mas com papeis bem distintos."
          align="center"
        />

        {leadMessage ? (
          <div className="rounded-[24px] border border-teal-200 bg-teal-50 px-5 py-4 text-left shadow-panel">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
              {leadMessage.eyebrow}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {leadMessage.message}
            </p>
          </div>
        ) : null}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="rounded-[34px] border-slate-200 bg-white p-0 shadow-[0_28px_100px_-58px_rgba(15,23,42,0.7)]">
          <div className="space-y-7 p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-accentSoft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                  <BadgeCheck className="h-4 w-4" />
                  Entrada principal recomendada
                </div>
                <h2 className="text-4xl font-semibold leading-tight text-ink">
                  Entrar na clinica estetica
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-muted">
                  Este e o acesso da recepcao, da administracao e da gestao da
                  clinica estetica. Aqui a equipe acompanha agenda, pacientes,
                  confirmacao, check-in e fila.
                </p>
              </div>
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-accentSoft">
                <Building2 className="h-7 w-7 text-accent" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {[
                {
                  icon: CalendarRange,
                  title: "Agenda do dia",
                  description:
                    "Confirmar horario, remarcar, cancelar e manter o dia mais previsivel.",
                },
                {
                  icon: Monitor,
                  title: "Recepcao em movimento",
                  description:
                    "Check-in, fila e acompanhamento do atendimento sem sensacao de improviso.",
                },
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <Icon className="h-5 w-5 text-accent" />
                    <p className="mt-3 text-lg font-semibold text-ink">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {item.description}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/login/clinic?source=acesso"
                className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Entrar na clinica estetica
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/planos"
                className="inline-flex items-center rounded-xl border border-border px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-50"
              >
                Ver planos
              </Link>
            </div>
          </div>
        </Card>

        <Card tone="dark" className="rounded-[34px] border-slate-200 p-0 shadow-[0_28px_100px_-58px_rgba(15,23,42,0.92)]">
          <div className="space-y-6 p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-200">
                  Acesso interno
                </p>
                <h2 className="text-3xl font-semibold leading-tight">
                  Entrar na plataforma
                </h2>
                <p className="text-sm leading-7 text-slate-300">
                  Control plane reservado para governanca, clinicas esteticas,
                  planos e operacao interna da OperaClinic.
                </p>
              </div>
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-white/10">
                <ShieldCheck className="h-7 w-7 text-teal-200" />
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-slate-300">
              Use esta entrada apenas se voce faz parte da administracao interna da
              plataforma. Ela nao substitui o login da clinica estetica.
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/login/platform?source=acesso"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100"
              >
                Entrar na plataforma
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
