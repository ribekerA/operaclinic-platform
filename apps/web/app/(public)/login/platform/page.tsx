import { LoginCard } from "@/components/auth/login-card";
import { PublicAuthShell } from "@/components/public/public-auth-shell";

interface PlatformLoginPageProps {
  searchParams?: Promise<{
    source?: string;
  }>;
}

function resolvePlatformContextMessage(source: string | undefined): string | undefined {
  if (source === "acesso") {
    return "Voce escolheu a area interna da OperaClinic. Continue apenas se este acesso fizer parte da operação da plataforma.";
  }

  return undefined;
}

export default async function PlatformLoginPage({
  searchParams,
}: PlatformLoginPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};

  return (
    <PublicAuthShell
      eyebrow="Acesso interno"
      title="Entre na area interna da OperaClinic."
      description="Este acesso continua reservado para operação de plataforma, governança e administração interna da base de clínicas estéticas."
      bullets={[
        "Visao da carteira de clínicas estéticas, planos e risco operacional.",
        "Sem competir com a jornada principal da clínica estética.",
        "Sessão separada da area da clínica estética no mesmo navegador.",
      ]}
      supportNote="Se voce procura a rotina da recepção ou da agenda, volte para o acesso da clínica estética."
    >
      <LoginCard
        profile="platform"
        compact
        contextMessage={resolvePlatformContextMessage(resolvedSearchParams.source)}
      />
    </PublicAuthShell>
  );
}
