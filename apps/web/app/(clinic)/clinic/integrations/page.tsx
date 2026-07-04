"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminCountBadge,
  AdminEmptyState,
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionHeader,
  AdminShortcutPanel,
  adminInputClassName,
} from "@/components/platform/platform-admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { useSession } from "@/hooks/use-session";
import { toErrorMessage } from "@/lib/client/http";
import {
  completeWhatsAppEmbeddedSignup,
  createMessagingIntegration,
  listMessagingIntegrations,
} from "@/lib/client/messaging-api";
import {
  getRuntimeReadiness,
  RuntimeReadinessPayload,
  RuntimeReadinessStatus,
} from "@/lib/client/runtime-api";
import type {
  CreateMessagingIntegrationConnectionResponsePayload,
  MessagingIntegrationConnectionPayload,
  MessagingIntegrationProvider,
} from "@operaclinic/shared";
import { formatDateTime } from "@/lib/formatters";

interface IntegrationFormState {
  provider: MessagingIntegrationProvider;
  displayName: string;
  phoneNumber: string;
  externalAccountId: string;
  webhookVerifyToken: string;
}

const defaultForm: IntegrationFormState = {
  provider: "WHATSAPP_META",
  displayName: "",
  phoneNumber: "",
  externalAccountId: "",
  webhookVerifyToken: "",
};

function maskToken(value: string | null | undefined): string {
  if (!value) {
    return "Gerado automaticamente";
  }

  if (value.length <= 8) {
    return "********";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function resolveProviderLabel(provider: MessagingIntegrationProvider): string {
  if (provider === "WHATSAPP_META") return "Meta WhatsApp";
  if (provider === "WHATSAPP_EVOLUTION") return "Evolution API (QR code)";
  return "WhatsApp mock";
}

export default function ClinicIntegrationsPage() {
  const { user } = useSession({ expectedProfile: "clinic" });
  const canManage = useMemo(() => {
    if (!user) {
      return false;
    }

    return (
      user.roles.includes("TENANT_ADMIN") || user.roles.includes("CLINIC_MANAGER")
    );
  }, [user]);

  const [integrations, setIntegrations] = useState<
    MessagingIntegrationConnectionPayload[]
  >([]);
  const [form, setForm] = useState<IntegrationFormState>(defaultForm);
  const [lastCreated, setLastCreated] =
    useState<CreateMessagingIntegrationConnectionResponsePayload | null>(null);
  const [readiness, setReadiness] = useState<RuntimeReadinessPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [fbSdkReady, setFbSdkReady] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);

  const metaAppId = process.env.NEXT_PUBLIC_META_APP_ID ?? "";
  const metaConfigId = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID ?? "";
  const embeddedSignupAvailable = Boolean(metaAppId && metaConfigId);

  const loadIntegrations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextIntegrations, nextReadiness] = await Promise.all([
        listMessagingIntegrations(),
        getRuntimeReadiness(),
      ]);
      setIntegrations(nextIntegrations);
      setReadiness(nextReadiness);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Não foi possível carregar integrações."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

  // Load Meta FB SDK when embedded signup is available
  useEffect(() => {
    if (!embeddedSignupAvailable || typeof window === "undefined") return;

    if (window.FB) {
      setFbSdkReady(true);
      return;
    }

    window.fbAsyncInit = function () {
      window.FB.init({ appId: metaAppId, version: "v21.0", xfbml: false, autoLogAppEvents: true });
      setFbSdkReady(true);
    };

    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, [embeddedSignupAvailable, metaAppId]);

  const metrics = useMemo(() => {
    const active = integrations.filter((item) => item.status === "ACTIVE").length;
    const meta = integrations.filter((item) => item.provider === "WHATSAPP_META").length;
    const missingPhoneId = integrations.filter(
      (item) => item.provider === "WHATSAPP_META" && !item.externalAccountId,
    ).length;

    return [
      {
        label: "Conexoes",
        value: String(integrations.length),
        helper: "Integrações registradas para a clínica.",
      },
      {
        label: "Ativas",
        value: String(active),
        helper: "Disponíveis para inbound, outbound e handoff.",
        tone: active > 0 ? ("accent" as const) : ("default" as const),
      },
      {
        label: "Meta",
        value: String(meta),
        helper: "Conexões oficiais do WhatsApp Cloud API.",
      },
      {
        label: "Pendencias",
        value: String(missingPhoneId),
        helper: "Sem phone number id confirmado.",
        tone: missingPhoneId > 0 ? ("warning" as const) : ("default" as const),
      },
    ];
  }, [integrations]);

  const shortcuts = useMemo(
    () => [
      {
        label: "Nova conexão",
        description: "Cadastrar WhatsApp da clínica.",
        href: "#nova-integracao",
      },
      {
        label: "Mensagens",
        description: "Abrir threads e handoffs.",
        href: "/clinic/messaging",
      },
      {
        label: "Recepção",
        description: "Validar agenda e atendimento.",
        href: "/clinic/reception",
      },
    ],
    [],
  );

  const readinessItems = useMemo(() => {
    const activeMetaConnections = integrations.filter(
      (item) => item.provider === "WHATSAPP_META" && item.status === "ACTIVE",
    );
    const activeConnections = integrations.filter((item) => item.status === "ACTIVE");
    const hasExternalAccountId = activeMetaConnections.some((item) =>
      Boolean(item.externalAccountId),
    );

    return [
      {
        label: "Backend",
        status: readiness?.checks.database.status ?? "degraded",
        details: readiness
          ? readiness.checks.database.latencyMs !== null
            ? `${readiness.checks.database.latencyMs} ms no readiness.`
            : "Sem latência disponível."
          : "Readiness ainda não carregado.",
      },
      {
        label: "Meta habilitado",
        status: readiness?.checks.messaging.metaEnabled ? "ok" : "degraded",
        details: readiness?.checks.messaging.metaEnabled
          ? "Variáveis Meta estão habilitadas no ambiente."
          : "Ative MESSAGING_WHATSAPP_META_ENABLED e credenciais Meta.",
      },
      {
        label: "Conexão ativa",
        status: activeConnections.length > 0 ? "ok" : "degraded",
        details:
          activeConnections.length > 0
            ? `${activeConnections.length} conexão(ões) ativa(s) nesta clínica.`
            : "Crie uma conexão antes do teste de webhook.",
      },
      {
        label: "Phone number id",
        status: hasExternalAccountId ? "ok" : "degraded",
        details: hasExternalAccountId
          ? "Existe conexão Meta com phone number id preenchido."
          : "Preencha o phone number id da Meta na conexão oficial.",
      },
      {
        label: "Stripe",
        status:
          readiness?.checks.payment.provider === "stripe" &&
          readiness.checks.payment.webhookConfigured
            ? "ok"
            : "degraded",
        details: readiness
          ? readiness.checks.payment.webhookConfigured
            ? `Provider ${readiness.checks.payment.provider.toUpperCase()} com webhook configurado.`
            : "Webhook Stripe ainda não configurado."
          : "Readiness ainda não carregado.",
      },
      {
        label: "Agentes",
        status:
          readiness?.checks.agent.enabled && readiness.checks.agent.rolloutPercentage > 0
            ? readiness.checks.agent.status
            : "degraded",
        details: readiness
          ? readiness.checks.agent.enabled
            ? `Rollout em ${readiness.checks.agent.rolloutPercentage}%.`
            : "Agent layer está desligado."
          : "Readiness ainda não carregado.",
      },
    ] satisfies Array<{
      label: string;
      status: RuntimeReadinessStatus;
      details: string;
    }>;
  }, [integrations, readiness]);

  function getStatusTone(status: RuntimeReadinessStatus): "success" | "warning" | "danger" {
    if (status === "ok") {
      return "success";
    }

    if (status === "error") {
      return "danger";
    }

    return "warning";
  }

  function handleEmbeddedSignup(): void {
    if (!canManage || !fbSdkReady || isSigningUp) return;

    setIsSigningUp(true);
    setError(null);
    setSuccess(null);

    window.FB.login(
      async (response: { authResponse?: { code?: string } }) => {
        if (!response.authResponse?.code) {
          setIsSigningUp(false);
          setError("Conexão cancelada ou não autorizada pelo Meta.");
          return;
        }

        try {
          const result = await completeWhatsAppEmbeddedSignup(response.authResponse.code);
          setLastCreated(result);
          setSuccess(
            "WhatsApp conectado com sucesso! Configure o webhook no Meta usando os dados abaixo.",
          );
          await loadIntegrations();
        } catch (requestError) {
          setError(toErrorMessage(requestError, "Falha ao finalizar conexão com a Meta."));
        } finally {
          setIsSigningUp(false);
        }
      },
      {
        config_id: metaConfigId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "2" },
      },
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccess(null);
    setLastCreated(null);

    try {
      const response = await createMessagingIntegration({
        provider: form.provider,
        displayName: form.displayName.trim(),
        phoneNumber: form.phoneNumber.trim() || undefined,
        externalAccountId: form.externalAccountId.trim() || undefined,
        webhookVerifyToken: form.webhookVerifyToken.trim() || undefined,
      });

      setLastCreated(response);
      setForm(defaultForm);
      setSuccess("Conexão criada. Configure o webhook no provedor antes do piloto.");
      await loadIntegrations();
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao criar integração."));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clínica | Setup"
        title="Integrações"
        description="Configure as conexões externas que precisam estar prontas antes de WhatsApp, handoff e automações entrarem em operação real."
        actions={
          <Button
            type="button"
            className="border border-slate-200 bg-white text-ink hover:bg-slate-50"
            onClick={() => {
              void loadIntegrations();
            }}
            disabled={isLoading}
          >
            {isLoading ? "Atualizando..." : "Atualizar"}
          </Button>
        }
      >
        <AdminMetricGrid items={metrics} isLoading={isLoading && integrations.length === 0} />
        <AdminShortcutPanel title="Ações rápidas" items={shortcuts} />
      </AdminPageHeader>

      {!canManage ? (
        <Card className="border-amber-200 bg-amber-50" role="alert">
          <p className="text-sm text-amber-700">
            Apenas admin e gestor da clínica podem criar conexões externas.
          </p>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-red-200 bg-red-50" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      ) : null}

      {success ? (
        <Card className="border-emerald-200 bg-emerald-50" role="status">
          <p className="text-sm text-emerald-700">{success}</p>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Conexões"
            title="WhatsApp cadastrado"
            description="A readiness considera a conexão ativa e o phone number id preenchido para liberar validação real."
            actions={<AdminCountBadge value={integrations.length} loading={isLoading} />}
          />

          {isLoading && integrations.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : integrations.length > 0 ? (
            <div className="space-y-3">
              {integrations.map((integration) => (
                <article
                  key={integration.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-ink">
                          {integration.displayName}
                        </h2>
                        <StatusPill label={integration.status} />
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {resolveProviderLabel(integration.provider)}
                      </p>
                    </div>
                    <StatusPill
                      label={integration.externalAccountId ? "Phone ID OK" : "Phone ID pendente"}
                      tone={integration.externalAccountId ? "success" : "warning"}
                    />
                  </div>

                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">Numero</dt>
                      <dd className="font-medium text-ink">
                        {integration.phoneNumber || "Não informado"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Phone number id</dt>
                      <dd className="font-medium text-ink">
                        {integration.externalAccountId || "Não informado"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Criado em</dt>
                      <dd className="font-medium text-ink">
                        {formatDateTime(integration.createdAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Atualizado em</dt>
                      <dd className="font-medium text-ink">
                        {formatDateTime(integration.updatedAt)}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <AdminEmptyState
              title="Nenhuma integração criada"
              description="Cadastre uma conexão WhatsApp para liberar webhook, inbox e testes de campo controlados."
            />
          )}
        </Card>

        <div className="space-y-4">
        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Readiness"
            title="Pronto para piloto?"
            description="Checklist técnico mínimo para liberar WhatsApp real, billing e agentes em operação controlada."
            actions={
              readiness ? (
                <StatusPill label={readiness.status} tone={getStatusTone(readiness.status)} />
              ) : undefined
            }
          />

          <div className="space-y-3">
            {readinessItems.map((item) => (
              <div
                key={item.label}
                className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{item.label}</p>
                  <p className="mt-1 text-sm text-muted">{item.details}</p>
                </div>
                <StatusPill label={item.status} tone={getStatusTone(item.status)} />
              </div>
            ))}
          </div>
        </Card>

        <Card id="nova-integracao" className="space-y-4">
          <AdminSectionHeader
            eyebrow="Setup WhatsApp"
            title="Conectar WhatsApp"
            description={
              embeddedSignupAvailable
                ? "Conecte o número da clínica em poucos cliques via conta Meta Business. Sem copiar tokens manualmente."
                : "Configure manualmente usando os dados da Meta Cloud API."
            }
          />

          {/* ── Primary: Meta Embedded Signup ── */}
          {embeddedSignupAvailable && canManage ? (
            <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-5 text-center">
              <div className="mb-3 text-3xl">💬</div>
              <p className="text-sm font-semibold text-ink">
                Conectar via conta Meta Business
              </p>
              <p className="mt-1 text-xs text-muted">
                Selecione sua conta e número de WhatsApp Business. A autorização é feita
                diretamente no painel da Meta — sem precisar copiar tokens.
              </p>
              <Button
                type="button"
                className="mt-4 w-full bg-[#1877F2] text-white hover:bg-[#166FE5] disabled:opacity-60"
                onClick={handleEmbeddedSignup}
                disabled={!fbSdkReady || isSigningUp || integrations.length > 0}
              >
                {isSigningUp
                  ? "Aguardando autorização..."
                  : !fbSdkReady
                    ? "Carregando SDK Meta..."
                    : integrations.length > 0
                      ? "Conexão já configurada"
                      : "Entrar com Meta Business"}
              </Button>
              {integrations.length > 0 ? (
                <p className="mt-2 text-xs text-muted">
                  Esta clínica já possui uma conexão WhatsApp ativa.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* ── Toggle: Manual form ── */}
          {canManage ? (
            <button
              type="button"
              onClick={() => setShowManualForm((v) => !v)}
              className="w-full text-left text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:text-ink"
            >
              {showManualForm ? "▲" : "▼"}{" "}
              {embeddedSignupAvailable
                ? "Configuração avançada (manual)"
                : "Configurar manualmente"}
            </button>
          ) : null}

          {showManualForm || !embeddedSignupAvailable ? (
            <form className="space-y-4" onSubmit={(e) => void handleCreate(e)}>
              <label className="block space-y-2 text-sm font-medium text-ink">
                <span>Provedor</span>
                <select
                  className={adminInputClassName}
                  value={form.provider}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      provider: event.target.value as MessagingIntegrationProvider,
                    }))
                  }
                  disabled={!canManage || isCreating}
                >
                  <option value="WHATSAPP_META">Meta WhatsApp</option>
                  <option value="WHATSAPP_MOCK">WhatsApp mock</option>
                </select>
              </label>

              <label className="block space-y-2 text-sm font-medium text-ink">
                <span>Nome da conexão</span>
                <input
                  className={adminInputClassName}
                  value={form.displayName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, displayName: event.target.value }))
                  }
                  placeholder="WhatsApp oficial da Clínica"
                  required
                  disabled={!canManage || isCreating}
                />
              </label>

              <label className="block space-y-2 text-sm font-medium text-ink">
                <span>Número WhatsApp</span>
                <input
                  className={adminInputClassName}
                  value={form.phoneNumber}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, phoneNumber: event.target.value }))
                  }
                  placeholder="+5511999999999"
                  disabled={!canManage || isCreating}
                />
              </label>

              <label className="block space-y-2 text-sm font-medium text-ink">
                <span>Phone number id da Meta</span>
                <input
                  className={adminInputClassName}
                  value={form.externalAccountId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      externalAccountId: event.target.value,
                    }))
                  }
                  placeholder="123456789012345"
                  disabled={!canManage || isCreating}
                />
              </label>

              <label className="block space-y-2 text-sm font-medium text-ink">
                <span>Verify token (opcional)</span>
                <input
                  className={adminInputClassName}
                  value={form.webhookVerifyToken}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      webhookVerifyToken: event.target.value,
                    }))
                  }
                  placeholder="Deixe vazio para gerar automaticamente"
                  disabled={!canManage || isCreating}
                />
              </label>

              <Button type="submit" disabled={!canManage || isCreating}>
                {isCreating ? "Criando..." : "Criar conexão manual"}
              </Button>
            </form>
          ) : null}

          {/* ── Webhook info after creation ── */}
          {lastCreated ? (
            <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm">
              <p className="font-semibold text-ink">
                Configure este webhook no painel da Meta Business
              </p>
              <dl className="mt-3 space-y-2">
                <div>
                  <dt className="text-muted">URL do webhook</dt>
                  <dd className="break-all font-medium text-ink">
                    {`https://seudominio.com.br${lastCreated.webhook.path}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Verify token</dt>
                  <dd className="font-mono text-xs font-medium text-ink">
                    {lastCreated.webhook.verifyToken}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted">
                Copie o verify token agora — ele não será exibido novamente.
              </p>
            </div>
          ) : null}
        </Card>
        </div>
      </section>
    </div>
  );
}
