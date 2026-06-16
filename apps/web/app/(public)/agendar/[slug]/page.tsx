import { Metadata } from "next";
import { notFound } from "next/navigation";
import { SelfBookingWorkspace } from "@/components/public/self-booking-workspace";
import { requestBackendPublic } from "@/lib/server/backend-session";
import type { PublicClinicInfo } from "@/lib/client/public-booking-api";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://operaclinic.com.br";
  const canonicalUrl = `${baseUrl}/agendar/${slug}`;

  try {
    const result = await requestBackendPublic({ path: `/public/clinics/${slug}` });
    const clinic = result.data as PublicClinicInfo | null;
    if (!clinic) {
      return {
        title: "Agendamento Online",
        alternates: { canonical: canonicalUrl },
      };
    }

    const title = `Agendar em ${clinic.displayName}`;
    const description = `Agende sua consulta em ${clinic.displayName} de forma rápida, sem precisar ligar. Escolha o profissional, o procedimento e o horário disponível.`;

    return {
      title,
      description,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        title,
        description,
        url: canonicalUrl,
        siteName: "OperaClinic",
        images: [
          {
            url: "/brand/og-image.png",
            width: 1200,
            height: 630,
            alt: `Agendamento online — ${clinic.displayName}`,
          },
        ],
        locale: "pt_BR",
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: ["/brand/og-image.png"],
      },
    };
  } catch {
    return {
      title: "Agendamento Online",
      alternates: { canonical: canonicalUrl },
    };
  }
}

export default async function PublicBookingPage({ params }: PageProps) {
  const { slug } = await params;

  const result = await requestBackendPublic({ path: `/public/clinics/${slug}` });

  if (result.status === 404 || !result.data) {
    notFound();
  }

  const clinic = result.data as PublicClinicInfo;

  return (
    <SelfBookingWorkspace slug={slug} clinic={clinic} />
  );
}
