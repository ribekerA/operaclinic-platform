"use client";

import {
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionHeader,
  AdminShortcutPanel,
} from "@/components/platform/platform-admin";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { usePlatformDashboard } from "@/hooks/use-platform-dashboard";

interface SeoCheckItem {
  label: string;
  description: string;
  status: "done" | "partial" | "pending";
}

const SEO_CHECKLIST: SeoCheckItem[] = [
  {
    label: "Sitemap XML",
    description: "Arquivo /sitemap.xml acessivel e atualizado com todas as paginas publicas.",
    status: "partial",
  },
  {
    label: "Robots.txt",
    description: "Arquivo /robots.txt configurado para permitir indexacao correta e bloquear areas privadas.",
    status: "partial",
  },
  {
    label: "Meta tags canonicas",
    description: "Tag canonical em todas as paginas publicas para evitar conteudo duplicado.",
    status: "partial",
  },
  {
    label: "Open Graph e Twitter Card",
    description: "Tags OG e Twitter Card para compartilhamento correto em redes sociais.",
    status: "partial",
  },
  {
    label: "Schema.org estruturado",
    description: "Dados estruturados (JSON-LD) para paginas de produto, organizacao e FAQ.",
    status: "pending",
  },
  {
    label: "Core Web Vitals",
    description: "LCP abaixo de 2.5s, FID abaixo de 100ms e CLS abaixo de 0.1 em paginas de inbound.",
    status: "pending",
  },
  {
    label: "Paginas de inbound por ICP",
    description: "Landing pages otimizadas por tipo de clinica: estetica, odonto, fisioterapia.",
    status: "pending",
  },
  {
    label: "Blog com conteudo de intencao",
    description: "Artigos direcionados a keywords de fundo de funil para o ICP principal.",
    status: "pending",
  },
  {
    label: "Rastreamento de origem organica",
    description: "UTMs e persistencia de canal de aquisicao desde o primeiro clique ate o cadastro.",
    status: "pending",
  },
  {
    label: "Hreflang para multi-idioma",
    description: "Tags hreflang se houver expansao para mercados fora do Brasil.",
    status: "pending",
  },
];

const STATUS_CONFIG = {
  done: {
    label: "Feito",
    tone: "success" as const,
    bar: "bg-teal-400",
    border: "border-teal-200",
    bg: "bg-teal-50",
  },
  partial: {
    label: "Parcial",
    tone: "warning" as const,
    bar: "bg-amber-400",
    border: "border-amber-200",
    bg: "bg-amber-50",
  },
  pending: {
    label: "Pendente",
    tone: "neutral" as const,
    bar: "bg-slate-300",
    border: "border-slate-200",
    bg: "bg-slate-50",
  },
};

const SEO_TOOLS = [
  {
    name: "Google Search Console",
    description: "Indexacao, impressoes organicas, CTR e erros de rastreamento.",
    url: "https://search.google.com/search-console",
    category: "Indexacao",
  },
  {
    name: "Google Analytics 4",
    description: "Sessoes organicas, conversoes e comportamento de usuario.",
    url: "https://analytics.google.com",
    category: "Analytics",
  },
  {
    name: "PageSpeed Insights",
    description: "Core Web Vitals por URL com sugestoes de otimizacao.",
    url: "https://pagespeed.web.dev",
    category: "Performance",
  },
  {
    name: "Ahrefs / Semrush",
    description: "Pesquisa de keywords, backlinks e monitoramento de rankings.",
    url: "https://ahrefs.com",
    category: "Keywords",
  },
  {
    name: "Schema Markup Validator",
    description: "Validar dados estruturados JSON-LD das paginas publicas.",
    url: "https://validator.schema.org",
    category: "Dados estruturados",
  },
];

export default function PlatformSeoPage() {
  const { dashboard, isLoading } = usePlatformDashboard();

  const doneCount = SEO_CHECKLIST.filter((i) => i.status === "done").length;
  const partialCount = SEO_CHECKLIST.filter((i) => i.status === "partial").length;
  const pendingCount = SEO_CHECKLIST.filter((i) => i.status === "pending").length;
  const completionPct = Math.round(
    ((doneCount + partialCount * 0.5) / SEO_CHECKLIST.length) * 100,
  );

  const metrics = [
    {
      label: "Itens concluidos",
      value: String(doneCount),
      helper: "Implementados e funcionando.",
      tone: doneCount > 0 ? ("accent" as const) : ("default" as const),
    },
    {
      label: "Itens parciais",
      value: String(partialCount),
      helper: "Implementados mas nao otimizados.",
      tone: "warning" as const,
    },
    {
      label: "Itens pendentes",
      value: String(pendingCount),
      helper: "Ainda nao iniciados.",
    },
    {
      label: "Cobertura SEO",
      value: `${completionPct}%`,
      helper: "Estimativa com itens parciais valendo 50%.",
      tone: completionPct >= 70 ? ("accent" as const) : completionPct >= 40 ? ("warning" as const) : ("danger" as const),
    },
  ];

  const activeTenants = dashboard?.tenants.active ?? 0;
  const totalTenants = dashboard?.tenants.total ?? 0;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Command Center"
        title="SEO & Inbound"
        description="Status do SEO tecnico da plataforma, checklist de itens criticos e acesso direto as ferramentas externas. Inbound organico conectado ao funil de crescimento."
      >
        <AdminMetricGrid items={metrics} />
      </AdminPageHeader>

      <AdminShortcutPanel
        items={[
          {
            label: "Abrir growth",
            description: "Cruzar inbound organico com conversao de trial.",
            href: "/platform/growth",
          },
          {
            label: "Abrir market intelligence",
            description: "Ver benchmarks de ICP que informam estrategia de conteudo.",
            href: "/platform/market-intelligence",
          },
          {
            label: "Abrir overview",
            description: "Voltar para a leitura executiva consolidada.",
            href: "/platform",
          },
        ]}
      />

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <AdminSectionHeader
            eyebrow="Checklist de SEO tecnico"
            title="Itens verificados e pendentes"
            description="Leitura manual do estado atual. Atualize conforme implementacoes sao concluidas."
            actions={
              <div className="flex gap-2">
                <StatusPill
                  label={`${completionPct}% coberto`}
                  tone={
                    completionPct >= 70
                      ? "success"
                      : completionPct >= 40
                        ? "warning"
                        : "danger"
                  }
                />
              </div>
            }
          />

          <div className="mt-4 space-y-3">
            {SEO_CHECKLIST.map((item) => {
              const cfg = STATUS_CONFIG[item.status];
              return (
                <div
                  key={item.label}
                  className={`rounded-[20px] border ${cfg.border} ${cfg.bg} p-4`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-ink">{item.label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted">
                        {item.description}
                      </p>
                    </div>
                    <StatusPill label={cfg.label} tone={cfg.tone} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <AdminSectionHeader
              eyebrow="Contexto de plataforma"
              title="Por que SEO importa agora"
              description="Com a base ativa crescendo, inbound organico reduz CAC e gera leads qualificados sem dependencia de midia paga."
            />

            <div className="mt-4 space-y-3">
              <div className="rounded-[20px] border border-teal-200 bg-teal-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Base ativa
                </p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {isLoading ? "..." : `${activeTenants}/${totalTenants}`}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Clinicas ativas que podem servir como casos de sucesso para conteudo.
                </p>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Origem organica
                </p>
                <p className="mt-2 text-lg font-semibold text-ink">Nao rastreada</p>
                <p className="mt-1 text-xs text-muted">
                  Canal de aquisicao dos tenants atuais nao esta persistido. Proxima acao: adicionar campo de origem no onboarding comercial.
                </p>
              </div>

              <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Prioridade atual
                </p>
                <p className="mt-2 text-sm font-semibold text-ink">
                  SEO tecnico basico antes de producao de conteudo
                </p>
                <p className="mt-1 text-xs text-muted">
                  Sem sitemap, canonical e Core Web Vitals resolvidos, producao de conteudo nao converte em ranking.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <AdminSectionHeader
              eyebrow="Ferramentas externas"
              title="Acesso rapido"
              description="Links diretos para as ferramentas de SEO mais usadas."
            />

            <div className="mt-4 space-y-3">
              {SEO_TOOLS.map((tool) => (
                <a
                  key={tool.name}
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start justify-between gap-3 rounded-[20px] border border-slate-200 bg-slate-50 p-4 transition hover:border-teal-200 hover:bg-white"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink group-hover:text-teal-700">
                        {tool.name}
                      </p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                        {tool.category}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {tool.description}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-teal-600 group-hover:underline">
                    Abrir
                  </span>
                </a>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <Card>
        <AdminSectionHeader
          eyebrow="Roadmap de SEO"
          title="O que entra em cada fase"
          description="Sequencia recomendada para construir inbound organico sem desperdicar esforco antes de ter fundacoes."
        />

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            {
              phase: "Fase 1 — Tecnico",
              tone: "warning" as const,
              items: [
                "Corrigir sitemap.xml com URLs canonicas",
                "Configurar robots.txt corretamente",
                "Adicionar canonical em todas as paginas publicas",
                "Resolver erros de Core Web Vitals criticos",
                "Implementar OG e Twitter Card nas landing pages",
              ],
            },
            {
              phase: "Fase 2 — Conteudo",
              tone: "neutral" as const,
              items: [
                "Pesquisa de keywords por ICP (estetica, odonto, fisio)",
                "Paginas de inbound por especialidade de clinica",
                "Blog com artigos de intencao de fundo de funil",
                "Dados estruturados JSON-LD em paginas de produto",
                "FAQ com perguntas frequentes do ICP",
              ],
            },
            {
              phase: "Fase 3 — Medicao",
              tone: "neutral" as const,
              items: [
                "Campo de origem no onboarding comercial",
                "UTMs padronizados em todos os canais",
                "Dashboard de conversao organico para trial",
                "Monitoramento de ranking por keyword critica",
                "Alertas de queda de trafego ou impressoes",
              ],
            },
          ].map((phase) => (
            <div
              key={phase.phase}
              className="rounded-[24px] border border-slate-200 bg-slate-50 p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                <p className="text-sm font-bold text-ink">{phase.phase}</p>
                <StatusPill
                  label={phase.tone === "warning" ? "Atual" : "Proximo"}
                  tone={phase.tone}
                />
              </div>
              <ul className="space-y-2">
                {phase.items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                    <p className="text-xs leading-5 text-muted">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
