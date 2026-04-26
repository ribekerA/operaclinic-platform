"use client";

import Link from "next/link";
import { AdminPageHeader } from "@/components/platform/platform-admin";
import { Card } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";

export default function ClinicNoAccessPage() {
  const { user } = useSession({ expectedProfile: "clinic" });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clinica | Acesso"
        title="Sem painel habilitado"
        description="Seu login esta ativo, mas este perfil ainda nao tem acesso a uma area operacional da clinica."
      />

      <Card className="space-y-3 bg-white">
        <p className="text-sm text-ink">
          Perfis encontrados: {user?.roles.length ? user.roles.join(", ") : "nenhum perfil valido"}.
        </p>
        <p className="text-sm text-muted">
          Solicite ao administrador da clinica um acesso compativel com sua rotina, como recepcao, gestao ou administracao.
        </p>
        <div className="flex gap-2">
          <Link
            href="/login/clinic"
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:bg-accentSoft"
          >
            Trocar conta
          </Link>
        </div>
      </Card>
    </div>
  );
}
