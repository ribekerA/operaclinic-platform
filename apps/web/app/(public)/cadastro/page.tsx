import { CommercialRegistrationWorkspace } from "@/components/public/commercial-registration-workspace";
import { PublicSectionHeading } from "@/components/public/public-section-heading";

interface CadastroPageProps {
  searchParams?: Promise<{
    token?: string;
  }>;
}

export default async function CadastroPage({ searchParams }: CadastroPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const onboardingToken = resolvedSearchParams.token?.trim() || null;

  return (
    <div className="space-y-12 pb-8">
      <section className="space-y-5">
        <PublicSectionHeading
          eyebrow="Cadastro inicial"
          title="Preencha a base inicial da clinica e do admin no onboarding comercial real"
          description="O cadastro agora grava os dados da clinica estetica diretamente no backend comercial. Nada aqui tenta entrar na clinica estetica antes da hora: o acesso continua separado e seguro."
        />
      </section>

      <CommercialRegistrationWorkspace onboardingToken={onboardingToken} />
    </div>
  );
}
