import { AuthenticatedShell } from "@/components/layout/authenticated-shell";

interface ClinicLayoutProps {
  children: React.ReactNode;
}

export default function ClinicLayout({ children }: ClinicLayoutProps) {
  return (
    <AuthenticatedShell
      profile="clinic"
      title="Clinica"
      subtitle="Operacao diaria"
    >
      {children}
    </AuthenticatedShell>
  );
}
