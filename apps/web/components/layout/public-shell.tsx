import Link from "next/link";
import { ArrowRight, LayoutDashboard, MessageCircleMore, Monitor, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { PublicNavbar } from "./public-navbar";

interface PublicShellProps {
  children: React.ReactNode;
}

export function PublicShell({ children }: PublicShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink focus:shadow-panel"
      >
        Ir para o conteúdo principal
      </a>

      {/* Mesh gradient hero wash */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(circle_at_14%_18%,rgba(45,212,191,0.26),transparent_38%),radial-gradient(circle_at_82%_8%,rgba(14,116,144,0.20),transparent_32%),radial-gradient(circle_at_55%_40%,rgba(15,118,110,0.10),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.88),rgba(243,245,249,0))]"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 lg:px-10">
        <PublicNavbar />

        <main id="main-content" className="flex-1 py-10">
          {children}
        </main>

        <footer className="mt-6 rounded-[32px] border border-slate-800 bg-slate-950 px-6 py-10 text-white shadow-[0_26px_90px_-54px_rgba(15,23,42,0.92)] lg:px-10">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            {/* Brand */}
            <div className="space-y-5">
              <BrandLogo className="w-40" />
              <p className="max-w-xs text-sm leading-6 text-slate-300">
                Recepção web, agenda por profissional e WhatsApp no centro da
                operação de clínicas estéticas privadas.
              </p>
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-400">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5">
                  <MessageCircleMore className="h-3.5 w-3.5 text-teal-300" />
                  WhatsApp do paciente
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5">
                  <Monitor className="h-3.5 w-3.5 text-teal-300" />
                  Recepção web
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-teal-300" />
                  Agenda protegida
                </span>
              </div>
              <a
                href="https://wa.me/5511968771362?text=Ola%2C%20gostaria%20de%20saber%20mais%20sobre%20o%20OperaClinic!"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Falar com o comercial via WhatsApp"
              >
                <MessageCircleMore className="h-4 w-4 text-teal-300" />
                Falar com comercial
                <ArrowRight className="h-3.5 w-3.5 text-teal-300" />
              </a>
            </div>

            {/* Produto */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-300">
                Produto
              </p>
              <nav aria-label="Links do produto" className="mt-4 grid gap-3 text-sm text-slate-400">
                <Link href="/" className="transition hover:text-white focus-visible:outline-none focus-visible:text-white">
                  Início
                </Link>
                <Link href="/#como-funciona" className="transition hover:text-white focus-visible:outline-none focus-visible:text-white">
                  Como funciona
                </Link>
                <Link href="/planos" className="transition hover:text-white focus-visible:outline-none focus-visible:text-white">
                  Planos e preços
                </Link>
                <Link href="/cadastro" className="transition hover:text-white focus-visible:outline-none focus-visible:text-white">
                  Criar conta
                </Link>
              </nav>
            </div>

            {/* Acesso */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-300">
                Acesso
              </p>
              <nav aria-label="Links de acesso" className="mt-4 grid gap-3 text-sm text-slate-400">
                <Link href="/acesso" className="transition hover:text-white focus-visible:outline-none focus-visible:text-white">
                  Hub de acesso
                </Link>
                <Link
                  href="/login/clinic"
                  className="flex items-center gap-2 transition hover:text-white focus-visible:outline-none focus-visible:text-white"
                >
                  <Monitor className="h-3.5 w-3.5 text-teal-500" />
                  Clínica
                </Link>
                <Link
                  href="/login/platform"
                  className="flex items-center gap-2 transition hover:text-white focus-visible:outline-none focus-visible:text-white"
                >
                  <LayoutDashboard className="h-3.5 w-3.5 text-teal-500" />
                  Plataforma
                </Link>
              </nav>
            </div>

            {/* Suporte */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-300">
                Suporte
              </p>
              <nav aria-label="Links de suporte" className="mt-4 grid gap-3 text-sm text-slate-400">
                <a
                  href="https://wa.me/5511968771362?text=Preciso%20de%20suporte%20no%20OperaClinic"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 transition hover:text-white"
                >
                  <MessageCircleMore className="h-3.5 w-3.5 text-teal-500" />
                  WhatsApp de suporte
                </a>
                <Link href="/privacidade" className="transition hover:text-white focus-visible:outline-none focus-visible:text-white">
                  Política de privacidade
                </Link>
                <Link href="/termos" className="transition hover:text-white focus-visible:outline-none focus-visible:text-white">
                  Termos de uso
                </Link>
              </nav>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-slate-500">
            <span>© {new Date().getFullYear()} OperaClinic. Todos os direitos reservados.</span>
            <div className="flex gap-4">
              <Link href="/privacidade" className="transition hover:text-slate-300">
                Privacidade
              </Link>
              <Link href="/termos" className="transition hover:text-slate-300">
                Termos
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
