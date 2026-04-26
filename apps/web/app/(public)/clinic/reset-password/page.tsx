import { ClinicResetPasswordCard } from "@/components/auth/clinic-reset-password-card";

interface ClinicResetPasswordPageProps {
  searchParams?: Promise<{
    token?: string;
  }>;
}

export default async function ClinicResetPasswordPage({
  searchParams,
}: ClinicResetPasswordPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};

  return <ClinicResetPasswordCard token={resolvedSearchParams.token ?? ""} />;
}
