"use client";

import { CommandCenterPlannedModule } from "@/components/platform/command-center";

export default function PlatformCeoModePage() {
  return (
    <CommandCenterPlannedModule
      eyebrow="Command Center"
      title="CEO Mode"
      description="Camada sintetica de decisao para entender em menos de 3 minutos o que esta saudavel, o que esta vazando e qual e a proxima acao."
      status="planned"
      phase="fase-2"
      availableSignals={[
        "Overview, finance, operations e reliability ja existem como dominios definidos.",
        "A torre ja tem uma arquitetura que permite sintetizar decisao executiva sem abrir dez telas.",
      ]}
      requiredSignals={[
        "Scores confiaveis de growth, agents e product control.",
        "Proxima acao recomendada derivada de alertas e backlog vivos.",
        "Comparacao consistente com periodo anterior em todos os dominios principais.",
      ]}
      nextAction="CEO Mode entra quando a torre tiver dados reais suficientes para recomendar a proxima acao sem decoracao executiva."
      shortcuts={[
        {
          label: "Abrir overview",
          description: "Voltar para a leitura executiva consolidada.",
          href: "/platform",
        },
        {
          label: "Abrir finance",
          description: "Cruzar a sintese executiva com receita e risco.",
          href: "/platform/finance",
        },
      ]}
    />
  );
}
