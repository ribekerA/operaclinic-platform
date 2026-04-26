import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OperaClinic",
  description:
    "OperaClinic organiza a operacao de clinicas esteticas privadas com recepcao web, agenda por profissional e WhatsApp como canal da paciente.",
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
