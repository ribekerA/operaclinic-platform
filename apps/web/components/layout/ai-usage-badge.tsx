"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { PlanEntitlementsSummary } from "@operaclinic/shared";
import { ProgressBar } from "@/components/ui/progress-bar";
import { getPlanEntitlementsSummary } from "@/lib/client/plan-entitlements-api";
import { SessionUser } from "@/lib/session/types";

interface AiUsageBadgeProps {
  user: SessionUser;
}

export function AiUsageBadge({ user }: AiUsageBadgeProps) {
  const [summary, setSummary] = useState<PlanEntitlementsSummary | null>(null);

  useEffect(() => {
    if (user.profile !== "clinic") {
      return;
    }

    let cancelled = false;

    getPlanEntitlementsSummary()
      .then((result) => {
        if (!cancelled) {
          setSummary(result);
        }
      })
      .catch(() => {
        // Informational widget only — never blocks the header on failure.
      });

    return () => {
      cancelled = true;
    };
  }, [user.profile, user.activeTenantId]);

  if (user.profile !== "clinic" || !summary) {
    return null;
  }

  const { usedThisMonth, limit } = summary.usage.aiConversations;

  if (limit === null) {
    return (
      <div className="hidden items-center gap-2 rounded-[20px] border border-white/80 bg-white px-3 py-1.5 shadow-sm lg:flex">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          Conversas com IA
        </span>
        <span className="text-sm font-semibold text-ink">Ilimitado</span>
      </div>
    );
  }

  const ratio = limit > 0 ? usedThisMonth / limit : 0;
  const tone = ratio >= 1 ? "danger" : ratio >= 0.8 ? "warning" : "default";

  return (
    <Link
      href="/clinic/messaging"
      className="hidden min-w-[190px] flex-col gap-1 rounded-[20px] border border-white/80 bg-white px-3 py-1.5 shadow-sm transition hover:bg-slate-50 lg:flex"
      title="Conversas atendidas por IA neste mês"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          Conversas com IA
        </span>
        {tone !== "default" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> : null}
      </div>
      <div className="flex items-center gap-2">
        <ProgressBar value={usedThisMonth} max={limit} tone={tone} className="flex-1" />
        <span className="text-xs font-semibold text-ink">
          {usedThisMonth}/{limit}
        </span>
      </div>
    </Link>
  );
}
