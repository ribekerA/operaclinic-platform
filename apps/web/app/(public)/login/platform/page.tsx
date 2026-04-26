import { LoginCard } from "@/components/auth/login-card";
import { PublicAuthShell } from "@/components/public/public-auth-shell";

interface PlatformLoginPageProps {
  searchParams?: Promise<{
    source?: string;
  }>;
}

function resolvePlatformContextMessage(source: string | undefined): string | undefined {
  if (source === "acesso") {
    return "Voce escolheu a area interna da OperaClinic. Continue apenas se este acesso fizer parte da operacao da plataforma.";
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
      description="Este acesso continua reservado para operacao de plataforma, governanca e administracao interna da base de clinicas esteticas."
      bullets={[
        "Visao da carteira de clinicas esteticas, planos e risco operacional.",
        "Sem competir com a jornada principal da clinica estetica.",
        "Sessao separada da area da clinica estetica no mesmo navegador.",
      ]}
      supportNote="Se voce procura a rotina da recepcao ou da agenda, volte para o acesso da clinica estetica."
    >
      <LoginCard
        profile="platform"
        compact
        contextMessage={resolvePlatformContextMessage(resolvedSearchParams.source)}
      />
    </PublicAuthShell>
  );
}
