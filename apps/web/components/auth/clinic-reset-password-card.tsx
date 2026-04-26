"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { resetPassword } from "@/lib/client/platform-identity-api";
import { toErrorMessage } from "@/lib/client/http";

interface ClinicResetPasswordCardProps {
  token: string;
}

export function ClinicResetPasswordCard({
  token,
}: ClinicResetPasswordCardProps) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!token) {
      setError("Token de redefinicao ausente.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("A nova senha e a confirmacao precisam ser iguais.");
      return;
    }

    setIsSubmitting(true);

    try {
      await resetPassword({
        token,
        newPassword,
      });
      setSuccess("Senha redefinida. Voce ja pode entrar novamente na clinica estetica.");
      window.setTimeout(() => {
        router.replace("/login/clinic");
      }, 900);
    } catch (err) {
      setError(toErrorMessage(err, "Nao foi possivel redefinir a senha."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-lg space-y-6 bg-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Nova senha
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">
          Concluir redefinicao
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Escolha uma nova senha para voltar ao painel da clinica estetica.
        </p>
      </div>

      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Nova senha
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent"
            required
          />
          <p className="text-xs text-muted">
            Use pelo menos 8 caracteres com letras maiusculas, minusculas e
            numeros.
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
            className="w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent"
            required
          />
        </div>

        {error ? (
          <p className="rounded-xl bg-red-50 px-3 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {success ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
            {success}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : "Salvar nova senha"}
        </Button>
      </form>

      <Link
        href="/login/clinic"
        className="inline-flex text-sm font-semibold text-accent transition hover:opacity-80"
      >
        Voltar para o login da clinica estetica
      </Link>
    </Card>
  );
}
