import type {
  CommercialPlanSummaryPayload,
  CommercialPublicPlanMetadataPayload,
} from "@operaclinic/shared";

export interface PublicPlanDefinition {
  id: string;
  code: string;
  slug: string;
  name: string;
  priceLabel: string;
  summary: string;
  idealFor: string;
  implementation: string;
  highlights: string[];
  featured?: boolean;
}

export const publicNavigation = [
  {
    label: "Inicio",
    href: "/",
  },
  {
    label: "Planos",
    href: "/planos",
  },
  {
    label: "Cadastro",
    href: "/cadastro",
  },
  {
    label: "Acesso",
    href: "/acesso",
  },
] as const;

function formatPriceLabel(plan: CommercialPlanSummaryPayload): string {
  if (plan.priceCents <= 0) {
    return "Sob consulta";
  }

  const formattedPrice = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: plan.currency || "BRL",
  }).format(plan.priceCents / 100);

  return `A partir de ${formattedPrice}/mes`;
}

function fallbackSlug(plan: CommercialPlanSummaryPayload): string {
  return plan.code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolvePublicMetadata(
  plan: CommercialPlanSummaryPayload,
): CommercialPublicPlanMetadataPayload {
  return (
    plan.publicMetadata ?? {
      slug: fallbackSlug(plan),
      summary:
        plan.description ??
        "Plano comercial do OperaClinic para clinicas esteticas privadas.",
      idealFor: "Clinicas esteticas privadas em operacao.",
      implementation:
        "Implantacao assistida com foco em recepcao, agenda e operacao do dia.",
      highlights: [
        "Agenda por profissional",
        "Recepcao web",
        "Fluxo comercial alinhado ao WhatsApp da clinica",
      ],
    }
  );
}

export function mapCommercialPlanToPublicPlan(
  plan: CommercialPlanSummaryPayload,
): PublicPlanDefinition {
  const presentation = resolvePublicMetadata(plan);

  return {
    id: plan.id,
    code: plan.code,
    slug: presentation.slug,
    name: plan.name,
    priceLabel: formatPriceLabel(plan),
    summary: presentation.summary,
    idealFor: presentation.idealFor,
    implementation: presentation.implementation,
    highlights: presentation.highlights,
    featured: presentation.featured,
  };
}
