"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

type RuntimeHealthStatus = "ok" | "degraded" | "down";

interface RuntimeStatusPayload {
  checkedAt: string;
  environment: string;
  web: {
    status: RuntimeHealthStatus;
    message: string;
  };
  api: {
    status: RuntimeHealthStatus;
    statusCode: number | null;
    message: string;
  };
}

function getTone(status: RuntimeHealthStatus): string {
  switch (status) {
    case "ok":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "degraded":
      return "bg-amber-50 text-amber-700 border-amber-200";
    default:
      return "bg-rose-50 text-rose-700 border-rose-200";
  }
}

function getLabel(status: RuntimeHealthStatus): string {
  switch (status) {
    case "ok":
      return "Online";
    case "degraded":
      return "Atencao";
    default:
      return "Offline";
  }
}

export function RuntimeStatusPanel() {
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus(): Promise<void> {
      try {
        const response = await fetch("/api/runtime/status", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Falha ao carregar o status local.");
        }

        const payload = (await response.json()) as RuntimeStatusPayload;

        if (!cancelled) {
          setRuntimeStatus(payload);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError("Nao foi possivel ler a saude do ambiente local.");
        }
      }
    }

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="space-y-4 border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
            Runtime local
          </p>
          <h2 className="mt-2 text-xl font-semibold text-ink">
            Saude da suite em execucao
          </h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
          {runtimeStatus?.environment ?? "carregando"}
        </span>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">Web</p>
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${getTone(
                runtimeStatus?.web.status ?? "degraded",
              )}`}
            >
              {getLabel(runtimeStatus?.web.status ?? "degraded")}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted">
            {runtimeStatus?.web.message ?? "Verificando o runtime do Next.js."}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">API</p>
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${getTone(
                runtimeStatus?.api.status ?? "degraded",
              )}`}
            >
              {getLabel(runtimeStatus?.api.status ?? "degraded")}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted">
            {runtimeStatus?.api.message ?? "Consultando healthcheck do backend."}
          </p>
          <p className="mt-2 text-xs text-muted">
            {runtimeStatus?.api.statusCode
              ? `HTTP ${runtimeStatus.api.statusCode}`
              : "Sem resposta HTTP ainda"}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted">
        {runtimeStatus?.checkedAt
          ? `Ultima leitura em ${new Date(runtimeStatus.checkedAt).toLocaleString("pt-BR")}.`
          : "Sincronizando status local."}
      </p>
    </Card>
  );
}
