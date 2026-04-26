"use client";

import { CommandCenterPlannedModule } from "@/components/platform/command-center";

export default function PlatformGrowthPage() {
  return (
    <CommandCenterPlannedModule
      eyebrow="Command Center"
      title="Growth"
      description="Modulo para pipeline, qualificacao, demos, fechamento e reativacao comercial sem misturar growth com operacao clinica."
      status="planned"
      phase="fase-2"
      availableSignals={[
        "Existe onboarding comercial e leitura basica de fila financeira.",
        "A plataforma ja sabe quais tenants estao ativos, em trial ou em atraso.",
        "A arquitetura ja aceita separar growth como dominio proprio da torre.",
      ]}
      requiredSignals={[
        "Origem de lead, canal e campanha persistidos de ponta a ponta.",
        "Conversao por etapa comercial com timestamps auditaveis.",
        "Medição de CPL, taxa de demo, taxa de fechamento e reativacao.",
      ]}
      nextAction="Nao ligar score de growth antes de existir funil persistido. A arquitetura ja esta definida; a sustentacao de dados ainda nao."
      shortcuts={[
        {
          label: "Abrir finance",
          description: "Cruzar crescimento comercial com receita contratada.",
          href: "/platform/finance",
        },
        {
          label: "Abrir overview",
          description: "Voltar para a leitura executiva consolidada.",
          href: "/platform",
        },
      ]}
    />
  );
}
