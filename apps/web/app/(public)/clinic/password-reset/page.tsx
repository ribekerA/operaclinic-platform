"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requestPasswordReset } from "@/lib/client/platform-identity-api";
import { toErrorMessage } from "@/lib/client/http";

function PasswordResetForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    setPreviewUrl(null);

    try {
      const response = await requestPasswordReset({
        email: email.trim(),
      });

      setSuccess(
        "Se houver um usuario ativo com este email, a redefinicao foi preparada.",
      );
      setPreviewUrl(response.resetUrlPreview ?? null);
    } catch (err) {
      setError(toErrorMessage(err, "Nao foi possivel solicitar a redefinicao."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent"
            placeholder="recepcao@clinica-estetica.com"
            required
          />
        </div>

        {error ? (
          <p className="rounded-xl bg-red-50 px-3 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {success ? (
          <div className="space-y-3 rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
            <p>{success}</p>
            {previewUrl ? (
              <div className="rounded-xl border border-emerald-200 bg-white px-3 py-3 text-slate-700">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                  Ambiente local
                </p>
                <p className="mt-2 text-sm">
                  O link de redefinicao aparece aqui apenas fora de producao.
                </p>
                <Link
                  href={previewUrl}
                  className="mt-3 inline-flex text-sm font-semibold text-accent transition hover:opacity-80"
                >
                  Abrir tela de redefinicao
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Preparando..." : "Solicitar redefinicao"}
        </Button>
      </form>

      <Link
        href="/login/clinic"
        className="inline-flex text-sm font-semibold text-accent transition hover:opacity-80"
      >
        Voltar para o login da clinica estetica
      </Link>
    </>
  );
}

export default function ClinicPasswordResetRequestPage() {
  return (
    <Card className="w-full max-w-lg space-y-6 bg-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Recuperar acesso
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">
          Redefinir senha da clinica estetica
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Informe o email usado na clinica estetica para gerar uma nova senha com token
          seguro.
        </p>
      </div>

      <Suspense>
        <PasswordResetForm />
      </Suspense>
    </Card>
  );
}
