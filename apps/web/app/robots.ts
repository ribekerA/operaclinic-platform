import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/platform/", "/clinic/", "/checkout/", "/cadastro/"],
    },
    sitemap: `${process.env.NEXT_PUBLIC_APP_URL || "https://operaclinic.com.br"}/sitemap.xml`,
  };
}
