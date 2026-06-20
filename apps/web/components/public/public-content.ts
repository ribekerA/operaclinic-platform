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
  { label: "Início",          href: "/" },
  { label: "Como funciona",   href: "/#como-funciona" },
  { label: "Planos",          href: "/planos" },
] as const;

function formatPriceLabel(plan: CommercialPlanSummaryPayload): string {
  if (plan.priceCents <= 0) {
    return "Sob consulta";
  }

  const formattedPrice = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: plan.currency || "BRL",
  }).format(plan.priceCents / 100);

  return `A partir de ${formattedPrice}/mês`;
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
        "Plano comercial do OperaClinic para clínicas estéticas privadas.",
      idealFor: "Clínicas estéticas privadas em operação.",
      implementation:
        "Implantação assistida com foco em recepção, agenda e operação do dia.",
      highlights: [
        "Agenda por profissional",
        "Recepção web",
        "Fluxo comercial alinhado ao WhatsApp da clínica",
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
