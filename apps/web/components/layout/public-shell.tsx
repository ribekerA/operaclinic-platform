import Link from "next/link";
import { ArrowRight, MessageCircleMore, Monitor, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { publicNavigation } from "@/components/public/public-content";

interface PublicShellProps {
  children: React.ReactNode;
}

export function PublicShell({ children }: PublicShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_14%_18%,rgba(45,212,191,0.22),transparent_34%),radial-gradient(circle_at_82%_8%,rgba(14,116,144,0.18),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(243,245,249,0))]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 lg:px-10">
        <header className="sticky top-4 z-20 rounded-[28px] border border-white/70 bg-white/85 px-5 py-4 shadow-panel backdrop-blur">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <Link href="/" className="flex items-center gap-4">
              <BrandLogo className="w-40 shrink-0" priority />
              <div className="hidden xl:block">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                  Clinica estetica privada
                </p>
                <p className="mt-1 text-sm text-muted">
                  Operacao, agenda e recepcao com WhatsApp no centro do fluxo.
                </p>
              </div>
            </Link>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600">
                {publicNavigation.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full px-3 py-2 transition hover:bg-slate-100 hover:text-ink"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/planos"
                  className="inline-flex items-center rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-slate-50"
                >
                  Ver planos
                </Link>
                <Link
                  href="/acesso"
                  className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Entrar
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 py-10">{children}</main>

        <footer className="mt-6 rounded-[32px] border border-slate-200 bg-slate-950 px-6 py-8 text-white shadow-[0_26px_90px_-54px_rgba(15,23,42,0.92)] lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
            <div className="space-y-4">
              <BrandLogo className="w-40" />
              <p className="max-w-xl text-sm leading-7 text-slate-300">
                OperaClinic foi desenhado para clinicas esteticas privadas que
                vivem de recepcao organizada, agenda por profissional e resposta
                rapida no WhatsApp.
              </p>
              <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2">
                  <MessageCircleMore className="h-4 w-4 text-teal-300" />
                  WhatsApp do paciente
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2">
                  <Monitor className="h-4 w-4 text-teal-300" />
                  Recepcao web
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2">
                  <ShieldCheck className="h-4 w-4 text-teal-300" />
                  Agenda protegida
                </span>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-200">
                Jornada publica
              </p>
              <div className="mt-4 grid gap-3 text-sm text-slate-300">
                <Link href="/" className="transition hover:text-white">
                  Landing nichada para operacao da clinica estetica
                </Link>
                <Link href="/planos" className="transition hover:text-white">
                  Planos para recepcao, agenda e WhatsApp
                </Link>
                <Link href="/cadastro" className="transition hover:text-white">
                  Cadastro inicial da operacao
                </Link>
                <Link href="/checkout" className="transition hover:text-white">
                  Fechamento comercial assistido
                </Link>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-200">
                Acesso
              </p>
              <div className="mt-4 grid gap-3 text-sm text-slate-300">
                <Link href="/acesso" className="transition hover:text-white">
                  Hub de acesso da OperaClinic
                </Link>
                <Link href="/login/clinic" className="transition hover:text-white">
                  Entrar na clinica estetica
                </Link>
                <Link href="/login/platform" className="transition hover:text-white">
                  Entrar na plataforma
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
