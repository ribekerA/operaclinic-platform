"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, RefreshCcw } from "lucide-react";
import { PublicPlanCard } from "@/components/public/public-plan-card";
import {
  PublicPlanDefinition,
  mapCommercialPlanToPublicPlan,
} from "@/components/public/public-content";
import { Card } from "@/components/ui/card";
import { toErrorMessage } from "@/lib/client/http";
import {
  listPublicCommercialPlans,
  startCommercialOnboarding,
} from "@/lib/client/commercial-api";

interface CommercialPlanGridProps {
  mode?: "summary" | "detailed";
}

function PlanCardSkeleton() {
  return (
    <Card className="rounded-[30px] border-slate-200 bg-white p-7">
      <div className="space-y-5 animate-pulse">
        <div className="h-4 w-28 rounded-full bg-slate-200" />
        <div className="h-8 w-2/3 rounded-full bg-slate-200" />
        <div className="space-y-2">
          <div className="h-4 rounded-full bg-slate-200" />
          <div className="h-4 w-5/6 rounded-full bg-slate-200" />
        </div>
        <div className="grid gap-3">
          <div className="h-14 rounded-2xl bg-slate-100" />
          <div className="h-14 rounded-2xl bg-slate-100" />
          <div className="h-14 rounded-2xl bg-slate-100" />
        </div>
      </div>
    </Card>
  );
}

export function CommercialPlanGrid({
  mode = "summary",
}: CommercialPlanGridProps) {
  const router = useRouter();
  const [plans, setPlans] = useState<PublicPlanDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPlans(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const response = await listPublicCommercialPlans();
      setPlans(response.map(mapCommercialPlanToPublicPlan));
    } catch (loadError) {
      setError(
        toErrorMessage(
          loadError,
          "Nao foi possivel carregar os planos agora.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPlans();
  }, []);

  async function handleSelectPlan(plan: PublicPlanDefinition): Promise<void> {
    setIsStarting(true);
    setSelectedPlanId(plan.id);
    setError(null);

    try {
      const response = await startCommercialOnboarding({
        planId: plan.id,
      });

      router.push(`/checkout?token=${encodeURIComponent(response.onboardingToken)}`);
      router.refresh();
    } catch (startError) {
      setError(
        toErrorMessage(
          startError,
          "Nao foi possivel iniciar o onboarding comercial agora.",
        ),
      );
    } finally {
      setIsStarting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 xl:grid-cols-3">
        <PlanCardSkeleton />
        <PlanCardSkeleton />
        <PlanCardSkeleton />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <Card className="rounded-[30px] border-slate-200 bg-white p-8">
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
            Planos indisponiveis
          </p>
          <h3 className="text-3xl font-semibold leading-tight text-ink">
            Nenhum plano publico esta disponivel agora.
          </h3>
          <p className="max-w-2xl text-sm leading-7 text-muted">
            O catalogo comercial da clinica estetica ainda nao foi liberado neste
            ambiente. Tente novamente em instantes ou volte para o hub de acesso.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadPlans()}
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              <RefreshCcw className="h-4 w-4" />
              Tentar novamente
            </button>
            <Link
              href="/acesso"
              className="inline-flex items-center rounded-xl border border-border px-4 py-3 text-sm font-semibold text-ink transition hover:bg-slate-50"
            >
              Ir para acesso
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm leading-6 text-red-700">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-2">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void loadPlans()}
                className="inline-flex items-center gap-2 font-semibold text-red-700 transition hover:opacity-80"
              >
                <RefreshCcw className="h-4 w-4" />
                Recarregar planos
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isStarting ? (
        <div className="rounded-[24px] border border-teal-200 bg-teal-50 px-5 py-4 text-sm leading-6 text-slate-700">
          <div className="flex items-center gap-2">
            <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
            <span>Preparando a jornada comercial da sua clinica estetica...</span>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {plans.map((plan) => (
          <PublicPlanCard
            key={plan.id}
            plan={plan}
            mode={mode}
            onSelectPlan={(selectedPlan) => {
              void handleSelectPlan(selectedPlan);
            }}
            isSubmitting={isStarting}
            isSelected={selectedPlanId === plan.id}
          />
        ))}
      </div>
    </div>
  );
}
