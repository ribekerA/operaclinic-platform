"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { canAccessClinicPath, resolveClinicHomePath } from "@/lib/clinic-access";
import {
  AuthResponsePayload,
  SessionUser,
  SwitchClinicRequestPayload,
} from "@/lib/session/types";
import { adminSelectClassName } from "@/components/platform/platform-admin";

interface ClinicSwitcherProps {
  user: SessionUser;
}

function isAuthResponsePayload(payload: unknown): payload is AuthResponsePayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "user" in payload &&
      payload.user &&
      typeof payload.user === "object" &&
      "roles" in payload.user &&
      Array.isArray(payload.user.roles),
  );
}

function toErrorMessage(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    Array.isArray(payload.message)
  ) {
    return payload.message.join(", ");
  }

  return "Nao foi possivel trocar de clinica.";
}

export function ClinicSwitcher({ user }: ClinicSwitcherProps) {
  const pathname = usePathname();
  const clinics = user.availableClinics ?? [];
  const activeClinic =
    user.activeClinic ??
    clinics.find((clinic) => clinic.id === user.activeTenantId) ??
    null;
  const [selectedTenantId, setSelectedTenantId] = useState(user.activeTenantId ?? "");
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedTenantId(user.activeTenantId ?? "");
    setError(null);
  }, [user.activeTenantId]);

  if (user.profile !== "clinic" || !activeClinic) {
    return null;
  }

  async function handleChange(event: ChangeEvent<HTMLSelectElement>): Promise<void> {
    const nextTenantId = event.target.value;

    setSelectedTenantId(nextTenantId);
    setError(null);

    if (!nextTenantId || nextTenantId === user.activeTenantId) {
      return;
    }

    setIsSwitching(true);

    try {
      const response = await fetch("/api/session/switch-clinic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId: nextTenantId,
        } satisfies SwitchClinicRequestPayload),
      });
      const payload = (await response.json().catch(() => null)) as
        | AuthResponsePayload
        | Record<string, unknown>
        | null;

      if (!response.ok || !isAuthResponsePayload(payload)) {
        setSelectedTenantId(user.activeTenantId ?? "");
        setError(toErrorMessage(payload));
        return;
      }

      const nextPath = canAccessClinicPath(pathname, payload.user.roles)
        ? pathname
        : resolveClinicHomePath(payload.user.roles);

      if (nextPath === pathname) {
        window.location.reload();
        return;
      }

      window.location.assign(nextPath);
    } catch {
      setSelectedTenantId(user.activeTenantId ?? "");
      setError("Nao foi possivel trocar de clinica.");
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <div className="rounded-[20px] border border-white/80 bg-white px-3 py-1.5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
          <Building2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Clinica ativa
          </p>
          <p className="truncate text-sm font-semibold text-ink">{activeClinic.name}</p>
        </div>
      </div>

      {clinics.length > 1 ? (
        <div className="mt-2 space-y-2">
          <select
            id="clinic-switcher"
            value={selectedTenantId}
            onChange={(event) => {
              void handleChange(event);
            }}
            className={`${adminSelectClassName} h-10 min-w-[220px]`}
            disabled={isSwitching}
          >
            {clinics.map((clinic) => (
              <option key={clinic.id} value={clinic.id}>
                {clinic.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">
            {isSwitching ? "Atualizando contexto..." : `${clinics.length} clinicas disponiveis.`}
          </p>
        </div>
      ) : (
        <p className="mt-1 pl-10 text-xs text-muted">{activeClinic.slug}</p>
      )}

      {error ? (
        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
