import { AuthenticatedShell } from "@/components/layout/authenticated-shell";

interface PlatformLayoutProps {
  children: React.ReactNode;
}

export default function PlatformLayout({ children }: PlatformLayoutProps) {
  return (
    <AuthenticatedShell
      profile="platform"
      title="Plataforma"
      subtitle="Control plane"
    >
      {children}
    </AuthenticatedShell>
  );
}
