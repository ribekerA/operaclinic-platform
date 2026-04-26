import type { Metadata } from "next";
import "./globals.css";

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

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
