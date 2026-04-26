import { LoginCard } from "@/components/auth/login-card";
import { PublicAuthShell } from "@/components/public/public-auth-shell";

interface ClinicLoginPageProps {
  searchParams?: Promise<{
    source?: string;
    email?: string;
    clinic?: string;
    clinicEmail?: string;
  }>;
}

function resolveClinicContextMessage(
  source: string | undefined,
  email: string | undefined,
  clinic: string | undefined,
  clinicEmail: string | undefined,
): string | undefined {
  switch (source) {
    case "cadastro":
      return clinic
        ? `Cadastro comercial da clinica ${clinic} registrado. Email da clinica: ${clinicEmail ?? "nao informado"}. A senha do admin e ativada so depois do pagamento confirmado.`
        : "O cadastro comercial salva os dados da clinica. A senha do admin e ativada so depois do pagamento confirmado.";
    case "checkout":
      return email
        ? `Onboarding inicial concluido para ${email}. Clinica: ${clinic ?? "nao informada"}. Email da clinica: ${clinicEmail ?? "nao informado"}. Se ainda nao ativou a senha, abra /clinic/password-reset e conclua a ativacao antes do login.`
        : "Se o onboarding foi concluido, ative a senha do admin em /clinic/password-reset e depois entre na clinica estetica.";
    case "acesso":
      return "Voce escolheu entrar na clinica estetica. Continue com o email e a senha da equipe.";
    default:
      return undefined;
  }
}

export default async function ClinicLoginPage({
  searchParams,
}: ClinicLoginPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialEmail = resolvedSearchParams.email?.trim() || undefined;
  const clinic = resolvedSearchParams.clinic?.trim() || undefined;
  const clinicEmail = resolvedSearchParams.clinicEmail?.trim() || undefined;

  return (
    <PublicAuthShell
      eyebrow="Acesso da clinica"
      title="Entre para operar a recepcao, a agenda e os pacientes da sua clinica estetica."
      description="Este acesso e para a equipe da clinica estetica. Recepcao, administracao e gestao entram aqui para acompanhar o dia, confirmar atendimento, fazer check-in e manter a agenda organizada."
      bullets={[
        "Recepcao web para confirmar, remarcar e acompanhar fila.",
        "Agenda por profissional com contexto da clinica estetica ativa.",
        "Fluxo alinhado ao uso forte de WhatsApp na clinica estetica.",
      ]}
      supportNote="A paciente continua fora do login. O canal dela segue sendo o WhatsApp."
    >
      <LoginCard
        profile="clinic"
        contextMessage={resolveClinicContextMessage(
          resolvedSearchParams.source,
          initialEmail,
          clinic,
          clinicEmail,
        )}
        initialEmail={initialEmail}
      />
    </PublicAuthShell>
  );
}
