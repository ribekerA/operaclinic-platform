"use client";

import { CommandCenterPlannedModule } from "@/components/platform/command-center";

export default function PlatformMarketIntelligencePage() {
  return (
    <CommandCenterPlannedModule
      eyebrow="Command Center"
      title="Market Intelligence"
      description="Modulo para sinais internos de ICP, objecoes, plano mais vendido, padrao de churn e benchmark interno por tenant."
      status="planned"
      phase="fase-2"
      availableSignals={[
        "A base comercial e operacional ja permite definir o dominio de inteligencia de mercado.",
        "Existem sinais internos espalhados entre onboarding, faturamento e operacao.",
      ]}
      requiredSignals={[
        "Motivos de perda comercial e churn persistidos com taxonomia clara.",
        "Benchmark interno por tenant e por perfil de clinica.",
        "Consolidacao de objecoes, plano mais vendido e sinais de inbound e demos.",
      ]}
      nextAction="O modulo deve nascer de sinais internos da propria plataforma. Nao vale ligar inteligencia de mercado antes de consolidar a camada comercial basica."
      shortcuts={[
        {
          label: "Abrir growth",
          description: "Cruzar inteligencia com pipeline comercial.",
          href: "/platform/growth",
        },
        {
          label: "Abrir finance",
          description: "Cruzar segmentacao com receita.",
          href: "/platform/finance",
        },
      ]}
    />
  );
}
