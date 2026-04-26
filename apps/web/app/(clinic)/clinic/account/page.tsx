"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionHeader,
  AdminShortcutPanel,
  adminInputClassName,
} from "@/components/platform/platform-admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";
import { changeOwnPassword, RoleCode } from "@/lib/client/platform-identity-api";
import { toErrorMessage } from "@/lib/client/http";
import { getRoleLabel } from "@/lib/formatters";

export default function ClinicAccountPage() {
  const router = useRouter();
  const { user, loading } = useSession({ expectedProfile: "clinic" });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError("A nova senha e a confirmacao precisam ser iguais.");
      return;
    }

    setIsSubmitting(true);

    try {
      await changeOwnPassword(
        {
          currentPassword,
          newPassword,
        },
        "clinic",
      );

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Senha alterada. Faca login novamente para continuar.");

      window.setTimeout(() => {
        router.replace("/login/clinic");
        router.refresh();
      }, 900);
    } catch (err) {
      setError(toErrorMessage(err, "Nao foi possivel trocar a senha."));
    } finally {
      setIsSubmitting(false);
    }
  }

  const displayRoles = (user?.roles ?? []).filter((role): role is RoleCode =>
    [
      "TENANT_ADMIN",
      "CLINIC_MANAGER",
      "RECEPTION",
      "PROFESSIONAL",
      "SUPER_ADMIN",
      "PLATFORM_ADMIN",
    ].includes(role),
  );

  const metrics = useMemo(() => {
    if (!user) {
      return [];
    }

    return [
      {
        label: "Usuario ativo",
        value: user.fullName ?? user.email,
        helper: user.email,
      },
      {
        label: "Clinica ativa",
        value: user.activeClinic?.name ?? user.activeTenantId ?? "--",
        helper: user.activeClinic?.slug ?? "Clinica aberta nesta sessao.",
        tone: "accent" as const,
      },
      {
        label: "Papeis",
        value: String(displayRoles.length),
        helper: "Acessos aplicados a esta sessao.",
      },
      {
        label: "Seguranca",
        value: isSubmitting ? "Atualizando" : "Pronta",
        helper: "Troca de senha disponivel neste acesso.",
      },
    ];
  }, [displayRoles.length, isSubmitting, user]);

  const shortcutItems = useMemo(
    () => [
      {
        label: "Usuarios",
        description: "Abrir acessos e papeis da equipe.",
        href: "/clinic/users",
      },
      {
        label: "Recepcao",
        description: "Voltar para a operacao do dia.",
        href: "/clinic/reception",
      },
      {
        label: "Dashboard",
        description: "Voltar para a tela principal da clinica.",
        href: "/clinic",
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clinica | Minha conta"
        title="Acesso e seguranca"
        description="Revise sua sessao, confira seus acessos e troque a senha com um fluxo simples."
      >
        <AdminMetricGrid items={metrics} isLoading={loading && !user} />
        <AdminShortcutPanel items={shortcutItems} />
      </AdminPageHeader>

      {loading ? (
        <Card>
          <p className="text-sm text-muted">Carregando dados da conta...</p>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-red-200 bg-red-50" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      ) : null}

      {success ? (
        <Card className="border-emerald-200 bg-emerald-50" role="status" aria-live="polite">
          <p className="text-sm text-emerald-700">{success}</p>
        </Card>
      ) : null}

      {user ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="space-y-5">
            <AdminSectionHeader
              eyebrow="Sessao ativa"
              title="Resumo do acesso"
              description="Leitura rapida da clinica atual e dos papeis aplicados ao usuario logado."
            />

            <div>
              <h2 className="text-xl font-semibold text-ink">{user.fullName}</h2>
              <p className="mt-1 text-sm text-muted">{user.email}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Clinica ativa
                </p>
                <p className="mt-2 text-sm font-semibold text-ink">
                  {user.activeClinic?.name ?? user.activeTenantId ?? "Nao identificada"}
                </p>
                {user.activeClinic?.slug ? (
                  <p className="mt-1 text-xs text-muted">{user.activeClinic.slug}</p>
                ) : null}
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Papeis atuais
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {displayRoles.map((role) => (
                    <span
                      key={role}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-ink"
                    >
                      {getRoleLabel(role)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="space-y-5">
            <AdminSectionHeader
              eyebrow="Seguranca"
              title="Trocar senha"
              description="Depois da troca, a sessao atual sera encerrada e um novo login sera necessario."
            />

            <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Senha atual
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className={adminInputClassName}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Nova senha
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className={adminInputClassName}
                  autoComplete="new-password"
                  required
                />
                <p className="text-xs text-muted">
                  Use pelo menos 8 caracteres com letras maiusculas, minusculas e numeros.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Confirmar nova senha
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className={adminInputClassName}
                  autoComplete="new-password"
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Atualizando..." : "Trocar senha"}
              </Button>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
