import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://operaclinic.com.br";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/planos", "/agendar/", "/termos", "/privacidade"],
        disallow: [
          "/api/",
          "/platform/",
          "/clinic/",
          "/checkout/",
          "/cadastro/",
          "/login/",
          "/acesso/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
