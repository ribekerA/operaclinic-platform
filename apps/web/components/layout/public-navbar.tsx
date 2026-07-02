"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  LayoutDashboard,
  Menu,
  MessageCircleMore,
  Monitor,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { publicNavigation } from "@/components/public/public-content";

export function PublicNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const accessRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!accessOpen) return;
    const handler = (e: MouseEvent) => {
      if (accessRef.current && !accessRef.current.contains(e.target as Node)) {
        setAccessOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [accessOpen]);

  return (
    <>
      <header
        className={`sticky top-3 z-20 transition-all duration-300 ${
          scrolled
            ? "rounded-[28px] border border-white/80 bg-white/95 px-5 py-3.5 shadow-panel backdrop-blur-xl"
            : "rounded-[28px] border border-white/50 bg-white/75 px-5 py-4 backdrop-blur-sm"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="OperaClinic — página inicial">
            <BrandLogo className="w-36 shrink-0" priority />
          </Link>

          {/* Desktop nav */}
          <nav
            aria-label="Navegação principal"
            className="hidden items-center gap-1 text-sm font-semibold text-slate-600 xl:flex"
          >
            {publicNavigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-3.5 py-2 transition hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden items-center gap-2 xl:flex">
            <a
              href="https://wa.me/5511968771362?text=Ola%2C%20gostaria%20de%20saber%20mais%20sobre%20o%20OperaClinic!"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-50 px-3.5 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <MessageCircleMore className="h-4 w-4" />
              Falar com Comercial
            </a>

            {/* Entrar dropdown */}
            <div ref={accessRef} className="relative">
              <button
                onClick={() => setAccessOpen((v) => !v)}
                className={buttonVariants({
                  variant: "secondary",
                  size: "sm",
                  className: "gap-1",
                })}
              >
                Entrar
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    accessOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {accessOpen && (
                <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)]">
                  <Link
                    href="/login/clinic"
                    onClick={() => setAccessOpen(false)}
                    className="flex items-start gap-3 rounded-xl px-3.5 py-3 transition hover:bg-slate-50"
                  >
                    <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <div>
                      <p className="text-sm font-semibold text-ink">Clínica</p>
                      <p className="text-xs text-muted">Recepção e agenda</p>
                    </div>
                  </Link>
                  <Link
                    href="/login/platform"
                    onClick={() => setAccessOpen(false)}
                    className="flex items-start gap-3 rounded-xl px-3.5 py-3 transition hover:bg-slate-50"
                  >
                    <LayoutDashboard className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <div>
                      <p className="text-sm font-semibold text-ink">Plataforma</p>
                      <p className="text-xs text-muted">Gestão e insights</p>
                    </div>
                  </Link>
                  <div className="mt-1 border-t border-slate-100 pt-1">
                    <Link
                      href="/acesso"
                      onClick={() => setAccessOpen(false)}
                      className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold text-muted transition hover:bg-slate-50 hover:text-ink"
                    >
                      Ver todos os acessos
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <Link
              href="/planos"
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              Ver planos
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            className="flex items-center justify-center rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-600 transition hover:bg-slate-50 xl:hidden"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="mt-4 border-t border-slate-100 pt-4 xl:hidden">
            <nav className="grid gap-1 text-sm font-semibold text-slate-700">
              {publicNavigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl px-3.5 py-2.5 transition hover:bg-slate-50 hover:text-ink"
                >
                  {item.label}
                </Link>
              ))}
              <p className="mt-2 px-3.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                Acesso
              </p>
              <Link
                href="/login/clinic"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 transition hover:bg-slate-50 hover:text-ink"
              >
                <Monitor className="h-4 w-4 text-accent" />
                Clínica — Recepção e agenda
              </Link>
              <Link
                href="/login/platform"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 transition hover:bg-slate-50 hover:text-ink"
              >
                <LayoutDashboard className="h-4 w-4 text-accent" />
                Plataforma — Gestão e insights
              </Link>
              <Link
                href="/acesso"
                onClick={() => setMobileOpen(false)}
                className="rounded-xl px-3.5 py-2.5 text-muted transition hover:bg-slate-50 hover:text-ink"
              >
                Hub de acesso →
              </Link>
            </nav>
            <div className="mt-4 grid gap-2">
              <a
                href="https://wa.me/5511968771362?text=Ola%2C%20gostaria%20de%20saber%20mais%20sobre%20o%20OperaClinic!"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl bg-teal-50 py-3 text-sm font-semibold text-teal-700 transition hover:bg-teal-100"
              >
                <MessageCircleMore className="h-4 w-4" />
                Falar com Comercial
              </a>
              <Link
                href="/planos"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center gap-2 rounded-xl bg-ink py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Ver planos
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Backdrop to close menus */}
      {(mobileOpen || accessOpen) && (
        <div
          className="fixed inset-0 z-10"
          aria-hidden="true"
          onClick={() => {
            setMobileOpen(false);
            setAccessOpen(false);
          }}
        />
      )}
    </>
  );
}
