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
import { Alert } from "@/components/ui/alert";
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
  const [linkCopied, setLinkCopied] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError("A nova senha e a confirmação precisam ser iguais.");
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
      setSuccess("Senha alterada. Faça login novamente para continuar.");

      window.setTimeout(() => {
        router.replace("/login/clinic");
        router.refresh();
      }, 900);
    } catch (err) {
      setError(toErrorMessage(err, "Não foi possível trocar a senha."));
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
        label: "Usuário ativo",
        value: user.fullName ?? user.email,
        helper: user.email,
      },
      {
        label: "Clínica ativa",
        value: user.activeClinic?.name ?? user.activeTenantId ?? "--",
        helper: user.activeClinic?.slug ?? "Clínica aberta nesta sessão.",
        tone: "accent" as const,
      },
      {
        label: "Papéis",
        value: String(displayRoles.length),
        helper: "Acessos aplicados a esta sessão.",
      },
      {
        label: "Segurança",
        value: isSubmitting ? "Atualizando" : "Pronta",
        helper: "Troca de senha disponível neste acesso.",
      },
    ];
  }, [displayRoles.length, isSubmitting, user]);

  const shortcutItems = useMemo(
    () => [
      {
        label: "Usuários",
        description: "Abrir acessos e papéis da equipe.",
        href: "/clinic/users",
      },
      {
        label: "Recepção",
        description: "Voltar para a operação do dia.",
        href: "/clinic/reception",
      },
      {
        label: "Dashboard",
        description: "Voltar para a tela principal da clínica.",
        href: "/clinic",
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clínica | Minha conta"
        title="Acesso e segurança"
        description="Revise sua sessão, confira seus acessos e troque a senha com um fluxo simples."
      >
        <AdminMetricGrid items={metrics} isLoading={loading && !user} />
        <AdminShortcutPanel items={shortcutItems} />
      </AdminPageHeader>

      {loading ? (
        <Card>
          <p className="text-sm text-muted">Carregando dados da conta...</p>
        </Card>
      ) : null}

      {error ? <Alert tone="danger" title={error} /> : null}

      {success ? <Alert tone="success" title={success} /> : null}

      {user ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="space-y-5">
            <AdminSectionHeader
              eyebrow="Sessão ativa"
              title="Resumo do acesso"
              description="Leitura rápida da clínica atual e dos papéis aplicados ao usuário logado."
            />

            <div>
              <h2 className="text-xl font-semibold text-ink">{user.fullName}</h2>
              <p className="mt-1 text-sm text-muted">{user.email}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Clínica ativa
                </p>
                <p className="mt-2 text-sm font-semibold text-ink">
                  {user.activeClinic?.name ?? user.activeTenantId ?? "Não identificada"}
                </p>
                {user.activeClinic?.slug ? (
                  <p className="mt-1 text-xs text-muted">{user.activeClinic.slug}</p>
                ) : null}
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Papéis atuais
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

          <div className="space-y-6">
            {user.activeClinic?.slug ? (
              <Card className="space-y-4">
                <AdminSectionHeader
                  eyebrow="Agendamento"
                  title="Link público de agendamento"
                  description="Compartilhe com pacientes para que agendem diretamente, sem precisar ligar."
                />
                <div className="flex items-center gap-2 rounded-[20px] border border-slate-200 bg-slate-50/80 p-3">
                  <p className="flex-1 truncate text-sm font-mono text-ink">
                    {process.env.NEXT_PUBLIC_APP_URL ?? ""}/agendar/{user.activeClinic.slug}
                  </p>
                  <Button
                    type="button"
                    className="shrink-0 border border-slate-200 bg-white text-ink hover:bg-slate-50"
                    onClick={() => {
                      const url = `${window.location.origin}/agendar/${user.activeClinic!.slug}`;
                      void navigator.clipboard.writeText(url).then(() => {
                        setLinkCopied(true);
                        window.setTimeout(() => setLinkCopied(false), 2000);
                      });
                    }}
                  >
                    {linkCopied ? "Copiado!" : "Copiar link"}
                  </Button>
                </div>
              </Card>
            ) : null}

            <Card className="space-y-5">
            <AdminSectionHeader
              eyebrow="Segurança"
              title="Trocar senha"
              description="Depois da troca, a sessão atual será encerrada e um novo login será necessário."
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
                  Use pelo menos 8 caracteres com letras maiúsculas, minúsculas e números.
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
        </div>
      ) : null}
    </div>
  );
}
