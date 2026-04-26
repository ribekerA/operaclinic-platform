"use client";

import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PublicPlanDefinition } from "./public-content";

interface PublicPlanCardProps {
  plan: PublicPlanDefinition;
  mode?: "summary" | "detailed";
  onSelectPlan?: (plan: PublicPlanDefinition) => void;
  isSubmitting?: boolean;
  isSelected?: boolean;
}

export function PublicPlanCard({
  plan,
  mode = "summary",
  onSelectPlan,
  isSubmitting = false,
  isSelected = false,
}: PublicPlanCardProps) {
  const isBusy = isSubmitting && isSelected;

  return (
    <Card
      className={`rounded-[30px] border-slate-200 bg-white p-0 ${
        plan.featured
          ? "ring-1 ring-accent/30 shadow-[0_28px_90px_-52px_rgba(15,118,110,0.55)]"
          : ""
      }`}
    >
      <div className="space-y-6 p-7">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
                {plan.featured ? "Mais procurado" : "Plano"}
              </p>
              <h3 className="mt-3 text-2xl font-semibold leading-tight text-ink">
                {plan.name}
              </h3>
            </div>
            <div className="rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              {plan.priceLabel}
            </div>
          </div>

          <p className="text-sm leading-7 text-muted">{plan.summary}</p>
        </div>

        <div className="grid gap-3">
          {plan.highlights.map((highlight) => (
            <div
              key={highlight}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p className="text-sm leading-6 text-slate-700">{highlight}</p>
            </div>
          ))}
        </div>

        {mode === "detailed" ? (
          <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                Ideal para
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{plan.idealFor}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                Implantacao
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {plan.implementation}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onSelectPlan?.(plan)}
            className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!onSelectPlan || isSubmitting}
          >
            {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {isBusy ? "Preparando jornada" : "Escolher plano"}
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="inline-flex items-center rounded-xl border border-border px-4 py-3 text-sm text-muted">
            A jornada segue para checkout e cadastro da clinica estetica.
          </div>
        </div>
      </div>
    </Card>
  );
}
