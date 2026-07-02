"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CircleAlert,
  CircleCheckBig,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Analytics } from "@/lib/analytics";
import {
  AestheticClinicLoginTenantOption,
  LoginRequestPayload,
  ResolveClinicTenantsRequestPayload,
  ResolveClinicTenantsResponsePayload,
  SessionProfile,
  SessionUser,
} from "@/lib/session/types";

interface LoginCardProps {
  profile: SessionProfile;
  compact?: boolean;
  contextMessage?: string;
  initialEmail?: string;
  backHref?: string;
  backLabel?: string;
}

interface LoginResponse {
  user?: SessionUser;
  message?: string | string[];
}

const TENANT_SELECTION_REQUIRED_MESSAGE =
  "tenantId is required for clinic users assigned to multiple tenants.";

function resolveLoginErrorMessage(
  message: string | string[] | undefined,
  profile: SessionProfile,
): string {
  const resolvedMessage = Array.isArray(message) ? message.join(", ") : message;

  switch (resolvedMessage) {
    case "Invalid credentials.":
      return "E-mail ou senha inválidos. Revise os dados e tente novamente.";
    case "User is not active.":
      return profile === "clinic"
        ? "Este acesso da clínica está inativo no momento."
        : "Este acesso interno está inativo no momento.";
    case "Clinic users must have at least one active tenant assignment.":
      return "Este usuário ainda não tem uma clínica ativa disponível para abrir.";
    case "Requested tenant is not assigned to this user.":
      return "Esta clínica não está vinculada a este usuário.";
    default:
      return resolvedMessage ?? "Não foi possível entrar agora.";
  }
}

function resolveTargetPath(user: SessionUser): string {
  if (user.profile === "platform") {
    return "/platform";
  }

  if (user.roles.includes("RECEPTION")) {
    return "/clinic/reception";
  }

  return "/clinic";
}

export function LoginCard({
  profile,
  compact = false,
  contextMessage,
  initialEmail,
  backHref = "/acesso",
  backLabel = "Voltar para acesso",
}: LoginCardProps) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [tenantOptions, setTenantOptions] = useState<AestheticClinicLoginTenantOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResolvingTenants, setIsResolvingTenants] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const content = useMemo(
    () =>
      profile === "platform"
        ? {
            label: "Control plane",
            title: compact ? "Entrar no control plane" : "Entrar no control plane",
            description: compact
              ? "Acesso reservado para operação interna da plataforma."
              : "Use este acesso para acompanhar clínicas estéticas, planos, saúde da base e administração interna da OperaClinic.",
            placeholder: "superadmin@operaclinic.local",
            highlights: [
              "Acompanhe clínicas estéticas, planos e operação interna em uma área separada.",
              "Mantenha o control plane fora da jornada principal da clínica estética.",
              "Sessão isolada da área da clínica estética no mesmo navegador.",
            ],
            helper:
              "Este acesso não é da clínica estética. Ele continua reservado para uso interno da OperaClinic.",
            icon: ShieldCheck,
          }
        : {
            label: "Acesso da clínica",
            title: "Entrar na rotina da clínica estética",
            description:
              "Recepção, administração e gestão entram aqui para operar agenda, pacientes e o ritmo do dia da clínica estética.",
            placeholder: "recepcao@sua-clinica.com",
            highlights: [
              "A recepção entra para confirmar, fazer check-in e acompanhar a agenda do dia.",
              "Quem opera mais de uma clínica escolhe a unidade certa depois das credenciais.",
              "A operação continua separada por clínica, sem misturar pacientes e horários.",
            ],
            helper:
              "Se este usuário estiver vinculado a mais de uma clínica, a escolha acontece depois das credenciais. Nenhum campo técnico fica exposto aqui.",
            icon: Building2,
          },
    [profile],
  );

  const EntryIcon = content.icon;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setTenantOptions([]);

    try {
      const payload: LoginRequestPayload = {
        profile,
        email,
        password,
      };

      const response = await fetch("/api/session/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responsePayload = (await response.json()) as LoginResponse;

      if (
        profile === "clinic" &&
        !response.ok &&
        responsePayload.message === TENANT_SELECTION_REQUIRED_MESSAGE
      ) {
        setIsResolvingTenants(true);

        const tenantPayload: ResolveClinicTenantsRequestPayload = {
          email,
          password,
        };
        const tenantResponse = await fetch("/api/session/clinic-tenants", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(tenantPayload),
        });
        const tenantResponsePayload =
          (await tenantResponse.json()) as
            | ResolveClinicTenantsResponsePayload
            | LoginResponse;

        if (
          tenantResponse.ok &&
          "tenants" in tenantResponsePayload &&
          tenantResponsePayload.tenants.length > 0
        ) {
          setTenantOptions(tenantResponsePayload.tenants);
          setSuccess(
            "Credenciais conferidas. Agora escolha a clínica estética que deseja abrir.",
          );
          setError(null);
          return;
        }

        const tenantMessage = resolveLoginErrorMessage(
          "message" in tenantResponsePayload ? tenantResponsePayload.message : undefined,
          profile,
        );

        setError(tenantMessage);
        return;
      }

      if (!response.ok || !responsePayload.user) {
        const message = resolveLoginErrorMessage(responsePayload.message, profile);

        setError(message);
        return;
      }

      Analytics.loginSuccess(profile);
      setSuccess(
        profile === "clinic"
          ? "Credenciais validadas. Abrindo a operação da clínica estética..."
          : "Credenciais validadas. Abrindo o control plane...",
      );
      const targetPath = resolveTargetPath(responsePayload.user);
      router.replace(targetPath);
      router.refresh();
    } catch {
      Analytics.loginError(profile);
      setError("Não foi possível conectar ao sistema.");
    } finally {
      setIsResolvingTenants(false);
      setIsLoading(false);
    }
  }

  async function handleTenantSelection(tenantId: string): Promise<void> {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: LoginRequestPayload = {
        profile,
        email,
        password,
        tenantId,
      };

      const response = await fetch("/api/session/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responsePayload = (await response.json()) as LoginResponse;

      if (!response.ok || !responsePayload.user) {
        const message = resolveLoginErrorMessage(responsePayload.message, profile);

        setError(message);
        return;
      }

      const selectedClinic = tenantOptions.find((tenant) => tenant.id === tenantId);
      setSuccess(
        selectedClinic
          ? `Abrindo ${selectedClinic.name}...`
          : "Abrindo a clínica estética selecionada...",
      );
      const targetPath = resolveTargetPath(responsePayload.user);
      router.replace(targetPath);
      router.refresh();
    } catch {
      setError("Não foi possível conectar ao sistema.");
    } finally {
      setIsLoading(false);
    }
  }

  function resetTenantSelection(): void {
    setTenantOptions([]);
    setError(null);
    setSuccess(null);
  }

  return (
    <Card
      className={`w-full overflow-hidden border-0 p-0 shadow-[0_28px_70px_-34px_rgba(15,23,42,0.65)] ${
        compact ? "max-w-md" : "max-w-lg"
      }`}
    >
      <div
        className={`bg-slate-950 text-white ${compact ? "px-6 py-5" : "border-b border-slate-200 px-6 py-6"}`}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
            <EntryIcon className="h-5 w-5 text-teal-200" />
          </div>
          <div>
            <p className={`font-mono uppercase text-teal-200 ${compact ? "text-[11px] tracking-[0.24em]" : "text-xs tracking-[0.32em]"}`}>
              {content.label}
            </p>
            <h1 className={`font-semibold leading-tight ${compact ? "mt-2 text-2xl" : "mt-3 text-3xl"}`}>
              {content.title}
            </h1>
            {content.description ? (
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-200">
                {content.description}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className={`${compact ? "space-y-4" : "space-y-6"} px-6 py-6`}>
        {contextMessage ? (
          <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4 text-sm leading-6 text-slate-700">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">
              Continuidade da jornada
            </p>
            <p className="mt-2">{contextMessage}</p>
          </div>
        ) : null}

        {!compact ? (
          <div className="grid gap-3">
            {content.highlights.map((highlight) => (
              <div
                key={highlight}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <p className="text-sm leading-6 text-slate-700">{highlight}</p>
              </div>
            ))}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-1">
            <label
              className="text-xs font-semibold uppercase tracking-[0.12em] text-muted"
              htmlFor={`${profile}-email`}
            >
              E-mail
            </label>
            <input
              id={`${profile}-email`}
              type="email"
              placeholder={content.placeholder}
              autoComplete="email"
              className="w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (tenantOptions.length > 0) {
                  resetTenantSelection();
                }
              }}
              required
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <label
                className="text-xs font-semibold uppercase tracking-[0.12em] text-muted"
                htmlFor={`${profile}-password`}
              >
                Senha
              </label>
              <button
                type="button"
                className="text-xs font-semibold uppercase tracking-[0.08em] text-accent transition hover:opacity-80"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <input
              id={`${profile}-password`}
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none transition focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (tenantOptions.length > 0) {
                  resetTenantSelection();
                }
              }}
              required
            />
          </div>

          {!compact ? (
            <div className="rounded-2xl border border-border bg-panel/70 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Como este acesso funciona
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">{content.helper}</p>
            </div>
          ) : null}

          {profile === "clinic" && tenantOptions.length > 0 ? (
            <div className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">
                  Escolha a clínica
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Encontramos mais de uma clínica estética vinculada a este acesso.
                  Selecione a unidade que deseja abrir agora.
                </p>
              </div>
              <div className="space-y-2">
                {tenantOptions.map((tenant) => (
                  <button
                    key={tenant.id}
                    type="button"
                    onClick={() => void handleTenantSelection(tenant.id)}
                    className="w-full rounded-2xl border border-teal-200 bg-white px-4 py-4 text-left transition hover:bg-teal-50"
                    disabled={isLoading}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-ink">{tenant.name}</p>
                        <p className="text-xs text-muted">{tenant.slug}</p>
                      </div>
                      <span className="rounded-full bg-accentSoft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
                        Abrir
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={resetTenantSelection}
                className="text-sm font-semibold text-ink transition hover:text-accent"
                disabled={isLoading}
              >
                Voltar e revisar credenciais
              </button>
            </div>
          ) : null}

          {success ? (
            <div className="rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
              <div className="flex items-start gap-2">
                <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{success}</span>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-3 text-sm text-red-700">
              <span className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </span>
            </p>
          ) : null}

          {tenantOptions.length === 0 ? (
            <div className="space-y-3">
              <Button
                type="submit"
                className="w-full gap-2 rounded-xl py-3"
                disabled={isLoading || isResolvingTenants}
              >
                {isLoading || isResolvingTenants ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : null}
                {isResolvingTenants
                  ? "Buscando clínicas..."
                  : isLoading
                    ? "Validando acesso..."
                    : profile === "clinic"
                      ? "Entrar na clínica estética"
                      : "Entrar na plataforma"}
              </Button>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <Link
                  href={backHref}
                  className="inline-flex items-center gap-2 font-semibold text-slate-600 transition hover:text-ink"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {backLabel}
                </Link>
                {profile === "clinic" ? (
                  <Link
                    href="/clinic/password-reset"
                    className="font-semibold text-accent transition hover:opacity-80"
                  >
                    Esqueci minha senha
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 text-sm">
              <Link
                href={backHref}
                className="inline-flex items-center gap-2 font-semibold text-slate-600 transition hover:text-ink"
              >
                <ArrowLeft className="h-4 w-4" />
                {backLabel}
              </Link>
            </div>
          )}
        </form>
      </div>
    </Card>
  );
}
