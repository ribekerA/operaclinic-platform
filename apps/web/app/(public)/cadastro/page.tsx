import { CommercialRegistrationWorkspace } from "@/components/public/commercial-registration-workspace";

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
      <CommercialRegistrationWorkspace onboardingToken={onboardingToken} />
    </div>
  );
}
