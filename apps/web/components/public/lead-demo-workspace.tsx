"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { createLeadDemo, toErrorMessage } from "@/lib/client/demo-api";

export function LeadDemoWorkspace() {
  const router = useRouter();
  const [clinicName, setClinicName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = clinicName.trim();
    if (trimmed.length < 2) {
      setError("Digite o nome da sua clínica.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createLeadDemo(trimmed);
      router.push(`/agendar/${result.slug}?demo=1`);
    } catch (err) {
      setError(toErrorMessage(err, "Não foi possível criar a demo. Tente novamente."));
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg py-16">
      <Card className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-ink">Experimente o OperaClinic</h1>
          <p className="text-sm text-muted">
            Digite o nome da sua clínica e veja a agenda online funcionando com a
            sua marca, na hora.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <FormField label="Nome da clínica" required error={error ?? undefined}>
            <Input
              value={clinicName}
              onChange={(event) => setClinicName(event.target.value)}
              placeholder="Ex.: Clínica Aurora"
              maxLength={160}
              disabled={isSubmitting}
              autoFocus
            />
          </FormField>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Criando sua demo..." : "Criar minha demo"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
