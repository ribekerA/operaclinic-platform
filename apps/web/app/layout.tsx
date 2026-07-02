import type { Metadata } from "next";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Analytics — quando tiver os IDs, instale @next/third-parties e descomente:
// pnpm add @next/third-parties --filter web
// import { GoogleAnalytics, GoogleTagManager } from "@next/third-parties/google";
// const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;  // G-XXXXXXXXXX
// const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;            // GTM-XXXXXXX

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://operaclinic.com.br"),
  title: {
    default: "OperaClinic | Gestão para Clínicas de Estética",
    template: "%s | OperaClinic",
  },
  description:
    "OperaClinic organiza a operação de clínicas estéticas privadas com recepção web, agenda por profissional e WhatsApp como canal da paciente.",
  openGraph: {
    title: "OperaClinic | Gestão para Clínicas de Estética",
    description: "OperaClinic organiza a operação de clínicas estéticas privadas com recepção web, agenda por profissional e WhatsApp como canal da paciente.",
    url: "/",
    siteName: "OperaClinic",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OperaClinic | Gestão para Clínicas de Estética",
    description: "Organize sua clínica de estética: agendamento, recepção e WhatsApp.",
    images: ["/brand/og-image.png"],
  },
  icons: {
    icon: "/brand/opera-clinica-icon.png",
    shortcut: "/brand/opera-clinica-icon.png",
    apple: "/brand/opera-clinica-icon.png",
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "OperaClinic",
  url: "https://operaclinic.com.br",
  logo: "https://operaclinic.com.br/brand/opera-clinica-icon.png",
  description:
    "OperaClinic organiza a operação de clínicas estéticas privadas com recepção web, agenda por profissional e WhatsApp como canal da paciente.",
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "sales",
    availableLanguage: "Portuguese",
  },
  sameAs: [],
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "OperaClinic",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Plataforma SaaS para gestão operacional de clínicas estéticas privadas: recepção web, agenda por profissional e integração com WhatsApp.",
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "BRL",
    availability: "https://schema.org/InStock",
  },
  inLanguage: "pt-BR",
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="pt-BR"
      className={`${manrope.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
        />
        {children}
      </body>
      {/* Analytics: descomente após instalar @next/third-parties e configurar os IDs */}
      {/* {GA_ID && <GoogleAnalytics gaId={GA_ID} />} */}
      {/* {GTM_ID && <GoogleTagManager gtmId={GTM_ID} />} */}
    </html>
  );
}
