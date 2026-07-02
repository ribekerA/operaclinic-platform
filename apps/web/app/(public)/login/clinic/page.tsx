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
        ? `Cadastro comercial da clínica ${clinic} registrado. Email da Clínica: ${clinicEmail ?? "não informado"}. A senha do admin é ativada somente após a confirmação do pagamento.`
        : "O cadastro comercial salva os dados da clínica. A senha do admin é ativada somente após a confirmação do pagamento.";
    case "checkout":
      return email
        ? `Onboarding inicial concluído para ${email}. Clínica: ${clinic ?? "não informada"}. Email da Clínica: ${clinicEmail ?? "não informado"}. Se ainda não ativou a senha, abra /clinic/password-reset e conclua a ativação antes do login.`
        : "Se o onboarding foi concluído, ative a senha do admin em /clinic/password-reset e depois entre na clínica estética.";
    case "acesso":
      return "Você escolheu entrar na clínica estética. Continue com o email e a senha da equipe.";
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
      eyebrow="Acesso da clínica"
      title="Entre para operar a recepção, a agenda e os pacientes da sua clínica estética."
      description="Este acesso é para a equipe da clínica estética. Recepção, administração e gestão entram aqui para acompanhar o dia, confirmar atendimento, fazer check-in e manter a agenda organizada."
      bullets={[
        "Recepção web para confirmar, remarcar e acompanhar fila.",
        "Agenda por profissional com contexto da clínica estética ativa.",
        "Fluxo alinhado ao uso forte de WhatsApp na clínica estética.",
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
