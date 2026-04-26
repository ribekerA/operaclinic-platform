"use client";

import { CommandCenterPlannedModule } from "@/components/platform/command-center";

export default function PlatformSeoPage() {
  return (
    <CommandCenterPlannedModule
      eyebrow="Command Center"
      title="SEO"
      description="Modulo de crescimento organico orientado a intencao, paginas que geram lead e lacunas de conteudo por ICP."
      status="planned"
      phase="fase-2"
      availableSignals={[
        "A torre ja reconhece SEO como modulo proprio de crescimento, nao como enfeite.",
        "A plataforma ja tem um lugar definitivo para esse dominio.",
      ]}
      requiredSignals={[
        "Paginas e conteudos rastreados com origem organica persistida.",
        "Conversao organico para lead e para demo com trilha auditavel.",
        "Lacunas por ICP e queda de trafego/conversao com leitura objetiva.",
      ]}
      nextAction="SEO entra depois que growth tiver fonte persistida. Antes disso, o modulo ficaria cosmetico."
      shortcuts={[
        {
          label: "Abrir growth",
          description: "Voltar para o modulo principal de aquisicao.",
          href: "/platform/growth",
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
