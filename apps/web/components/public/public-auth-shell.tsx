import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";

interface PublicAuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  supportNote?: string;
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}

export function PublicAuthShell({
  eyebrow,
  title,
  description,
  bullets,
  supportNote,
  backHref = "/acesso",
  backLabel = "Voltar para o hub de acesso",
  children,
}: PublicAuthShellProps) {
  return (
    <section className="grid gap-10 py-6 xl:grid-cols-[0.95fr_1.05fr] xl:items-center">
      <div className="space-y-6">
        <div className="inline-flex rounded-full border border-white/70 bg-white/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent shadow-panel backdrop-blur">
          {eyebrow}
        </div>

        <div className="space-y-4">
          <BrandMark className="w-20" priority />
          <h1 className="max-w-xl text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            {title}
          </h1>
          <p className="max-w-xl text-sm leading-7 text-muted sm:text-base">
            {description}
          </p>
        </div>

        <div className="grid gap-3">
          {bullets.map((bullet) => (
            <div
              key={bullet}
              className="rounded-[24px] border border-white/70 bg-white/82 px-5 py-4 text-sm leading-6 text-slate-700 shadow-panel backdrop-blur"
            >
              {bullet}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 font-semibold text-slate-600 transition hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
          {supportNote ? <p className="text-sm text-muted">{supportNote}</p> : null}
        </div>
      </div>

      <div className="flex justify-center xl:justify-end">{children}</div>
    </section>
  );
}
