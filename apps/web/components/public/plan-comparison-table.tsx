import { Check, Minus } from "lucide-react";

interface ComparisonRow {
  category: string;
  feature: string;
  start: boolean | string;
  flow: boolean | string;
  scale: boolean | string;
}

const ROWS: ComparisonRow[] = [
  // Limites
  {
    category: "Capacidade",
    feature: "Profissionais",
    start: "até 3",
    flow: "até 8",
    scale: "ilimitado",
  },
  {
    category: "Capacidade",
    feature: "Unidades",
    start: "1",
    flow: "2",
    scale: "ilimitado",
  },
  // Core
  {
    category: "Operação base",
    feature: "Agenda por profissional",
    start: true,
    flow: true,
    scale: true,
  },
  {
    category: "Operação base",
    feature: "Recepção web (confirmar, remarcar, check-in)",
    start: true,
    flow: true,
    scale: true,
  },
  {
    category: "Operação base",
    feature: "Base de pacientes",
    start: true,
    flow: true,
    scale: true,
  },
  {
    category: "Operação base",
    feature: "Bloqueio de horário",
    start: true,
    flow: true,
    scale: true,
  },
  {
    category: "Operação base",
    feature: "Lista de espera",
    start: false,
    flow: true,
    scale: true,
  },
  // WhatsApp
  {
    category: "Canal WhatsApp",
    feature: "Inbox e threads de conversa",
    start: false,
    flow: true,
    scale: true,
  },
  {
    category: "Canal WhatsApp",
    feature: "Templates de mensagem",
    start: false,
    flow: true,
    scale: true,
  },
  {
    category: "Canal WhatsApp",
    feature: "Confirmação automática 24h antes",
    start: false,
    flow: true,
    scale: true,
  },
  {
    category: "Canal WhatsApp",
    feature: "Agente de captação de leads (IA)",
    start: false,
    flow: false,
    scale: true,
  },
  {
    category: "Canal WhatsApp",
    feature: "Agente de agendamento (IA)",
    start: false,
    flow: false,
    scale: true,
  },
  // Analytics
  {
    category: "Analytics",
    feature: "KPIs operacionais (no-show, ocupação)",
    start: false,
    flow: true,
    scale: true,
  },
  {
    category: "Analytics",
    feature: "Dashboard executivo completo",
    start: false,
    flow: false,
    scale: true,
  },
  // Avançado
  {
    category: "Operação avançada",
    feature: "Protocolos de procedimento",
    start: false,
    flow: false,
    scale: true,
  },
  {
    category: "Operação avançada",
    feature: "Múltiplas unidades",
    start: false,
    flow: false,
    scale: true,
  },
];

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return (
      <span className="text-sm font-semibold text-ink">{value}</span>
    );
  }
  if (value) {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accentSoft">
        <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center">
      <Minus className="h-3.5 w-3.5 text-slate-300" />
    </span>
  );
}

export function PlanComparisonTable() {
  const categories = [...new Set(ROWS.map((r) => r.category))];

  return (
    <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-panel">
      {/* Header */}
      <div className="grid grid-cols-[1fr_88px_88px_88px] items-end border-b border-slate-100 px-6 py-5 sm:grid-cols-[1fr_120px_120px_120px]">
        <div />
        {(
          [
            { name: "Start", sub: "R$ 199/mês" },
            { name: "Flow", sub: "R$ 349/mês", featured: true },
            { name: "Scale", sub: "R$ 549/mês" },
          ] as const
        ).map((plan) => (
          <div key={plan.name} className="flex flex-col items-center gap-1">
            {"featured" in plan && plan.featured ? (
              <span className="rounded-full bg-accentSoft px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                Popular
              </span>
            ) : (
              <span className="h-[22px]" />
            )}
            <p
              className={`text-sm font-bold ${
                "featured" in plan && plan.featured ? "text-accent" : "text-ink"
              }`}
            >
              {plan.name}
            </p>
            <p className="text-[11px] text-muted">{plan.sub}</p>
          </div>
        ))}
      </div>

      {/* Rows grouped by category */}
      {categories.map((category, catIdx) => {
        const rows = ROWS.filter((r) => r.category === category);
        return (
          <div key={category}>
            {/* Category label */}
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                {category}
              </p>
            </div>
            {rows.map((row, rowIdx) => (
              <div
                key={row.feature}
                className={`grid grid-cols-[1fr_88px_88px_88px] items-center px-6 py-3.5 sm:grid-cols-[1fr_120px_120px_120px] ${
                  rowIdx < rows.length - 1 ? "border-b border-slate-100" : ""
                } ${
                  catIdx < categories.length - 1 && rowIdx === rows.length - 1
                    ? "border-b border-slate-200"
                    : ""
                }`}
              >
                <p className="pr-4 text-sm leading-5 text-slate-700">
                  {row.feature}
                </p>
                <div className="flex justify-center">
                  <Cell value={row.start} />
                </div>
                <div className="flex justify-center">
                  <Cell value={row.flow} />
                </div>
                <div className="flex justify-center">
                  <Cell value={row.scale} />
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
