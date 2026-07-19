import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { PlanUpsellInfo } from "@/lib/client/plan-entitlements-api";

const FEATURE_LABELS: Record<string, string> = {
  scheduleOverride: "Agendamento fora do horário configurado",
  waitlist: "Lista de espera",
  messagingTemplates: "Modelos de mensagem",
  operationalKpis: "KPIs operacionais",
  executiveDashboard: "Painel executivo",
  procedureProtocols: "Protocolos de procedimento",
  multiUnit: "Múltiplas unidades",
};

const LIMIT_LABELS: Record<string, string> = {
  maxProfessionals: "número de profissionais",
  maxUnits: "número de unidades",
  monthlyAiConversations: "conversas mensais atendidas por IA",
};

interface UpsellCardProps {
  info: PlanUpsellInfo;
}

export function UpsellCard({ info }: UpsellCardProps) {
  const label =
    info.kind === "feature"
      ? (FEATURE_LABELS[info.key] ?? info.key)
      : (LIMIT_LABELS[info.key] ?? info.key);

  return (
    <Card className="space-y-3 border-teal-200 bg-teal-50/60" role="alert">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-teal-700" aria-hidden="true" />
        <p className="text-sm font-semibold text-teal-800">
          {info.kind === "feature"
            ? `"${label}" não está incluído no seu plano atual`
            : `Limite do plano atingido: ${label}`}
        </p>
      </div>
      <p className="text-sm text-teal-700">{info.message}</p>
      <Link
        href="/planos"
        className="inline-flex w-fit rounded-lg border border-teal-300 bg-white px-3 py-2 text-sm font-semibold text-teal-800 transition hover:bg-teal-100"
      >
        Ver planos e fazer upgrade
      </Link>
    </Card>
  );
}
