import { MetadataRoute } from "next";

/**
 * Tenta buscar os slugs públicos das clínicas via API para incluir as páginas
 * de self-booking no sitemap. Se a chamada falhar (build offline, API down),
 * retorna um array vazio para não bloquear o build.
 */
async function fetchPublicClinicSlugs(): Promise<string[]> {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001/api/v1";
    const res = await fetch(`${apiUrl}/public/clinics/slugs`, {
      next: { revalidate: 3600 }, // revalida a cada 1h
    });
    if (!res.ok) return [];
    const data = await res.json();
    // Espera { slugs: string[] } ou string[]
    if (Array.isArray(data)) return data as string[];
    if (Array.isArray(data?.slugs)) return data.slugs as string[];
    return [];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://operaclinic.com.br";
  const lastMod = new Date("2025-08-01");

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: lastMod,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/planos`,
      lastModified: lastMod,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/termos`,
      lastModified: lastMod,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacidade`,
      lastModified: lastMod,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const slugs = await fetchPublicClinicSlugs();
  const bookingRoutes: MetadataRoute.Sitemap = slugs.map((slug) => ({
    url: `${baseUrl}/agendar/${slug}`,
    lastModified: lastMod,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...bookingRoutes];
}
