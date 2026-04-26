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
  return provider === "WHATSAPP_META" ? "Meta WhatsApp" : "WhatsApp mock";
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
      setError(toErrorMessage(requestError, "Nao foi possivel carregar integracoes."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

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
        helper: "Integrações registradas para a clinica.",
      },
      {
        label: "Ativas",
        value: String(active),
        helper: "Disponiveis para inbound, outbound e handoff.",
        tone: active > 0 ? ("accent" as const) : ("default" as const),
      },
      {
        label: "Meta",
        value: String(meta),
        helper: "Conexoes oficiais do WhatsApp Cloud API.",
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
        label: "Nova conexao",
        description: "Cadastrar WhatsApp da clinica.",
        href: "#nova-integracao",
      },
      {
        label: "Mensagens",
        description: "Abrir threads e handoffs.",
        href: "/clinic/messaging",
      },
      {
        label: "Recepcao",
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
            : "Sem latencia disponivel."
          : "Readiness ainda nao carregado.",
      },
      {
        label: "Meta habilitado",
        status: readiness?.checks.messaging.metaEnabled ? "ok" : "degraded",
        details: readiness?.checks.messaging.metaEnabled
          ? "Variaveis Meta estao habilitadas no ambiente."
          : "Ative MESSAGING_WHATSAPP_META_ENABLED e credenciais Meta.",
      },
      {
        label: "Conexao ativa",
        status: activeConnections.length > 0 ? "ok" : "degraded",
        details:
          activeConnections.length > 0
            ? `${activeConnections.length} conexao(oes) ativa(s) nesta clinica.`
            : "Crie uma conexao antes do teste de webhook.",
      },
      {
        label: "Phone number id",
        status: hasExternalAccountId ? "ok" : "degraded",
        details: hasExternalAccountId
          ? "Existe conexao Meta com phone number id preenchido."
          : "Preencha o phone number id da Meta na conexao oficial.",
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
            : "Webhook Stripe ainda nao configurado."
          : "Readiness ainda nao carregado.",
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
            : "Agent layer esta desligado."
          : "Readiness ainda nao carregado.",
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
      setSuccess("Conexao criada. Configure o webhook no provedor antes do piloto.");
      await loadIntegrations();
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Falha ao criar integracao."));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clinica | Setup"
        title="Integracoes"
        description="Configure as conexoes externas que precisam estar prontas antes de WhatsApp, handoff e automacoes entrarem em operacao real."
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
        <AdminShortcutPanel title="Acoes rapidas" items={shortcuts} />
      </AdminPageHeader>

      {!canManage ? (
        <Card className="border-amber-200 bg-amber-50" role="alert">
          <p className="text-sm text-amber-700">
            Apenas admin e gestor da clinica podem criar conexoes externas.
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
            eyebrow="Conexoes"
            title="WhatsApp cadastrado"
            description="A readiness considera a conexao ativa e o phone number id preenchido para liberar validacao real."
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
                        {integration.phoneNumber || "Nao informado"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Phone number id</dt>
                      <dd className="font-medium text-ink">
                        {integration.externalAccountId || "Nao informado"}
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
              title="Nenhuma integracao criada"
              description="Cadastre uma conexao WhatsApp para liberar webhook, inbox e testes de campo controlados."
            />
          )}
        </Card>

        <div className="space-y-4">
        <Card className="space-y-4">
          <AdminSectionHeader
            eyebrow="Readiness"
            title="Pronto para piloto?"
            description="Checklist tecnico minimo para liberar WhatsApp real, billing e agentes em operacao controlada."
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
            title="Nova conexao"
            description="Use os dados da Meta Cloud API. O token global e app secret continuam no ambiente da API."
          />

          <form className="space-y-4" onSubmit={handleCreate}>
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
              <span>Nome da conexao</span>
              <input
                className={adminInputClassName}
                value={form.displayName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, displayName: event.target.value }))
                }
                placeholder="WhatsApp oficial da Clinica"
                required
                disabled={!canManage || isCreating}
              />
            </label>

            <label className="block space-y-2 text-sm font-medium text-ink">
              <span>Numero WhatsApp</span>
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
              <span>Verify token opcional</span>
              <input
                className={adminInputClassName}
                value={form.webhookVerifyToken}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    webhookVerifyToken: event.target.value,
                  }))
                }
                placeholder="Deixe vazio para gerar"
                disabled={!canManage || isCreating}
              />
            </label>

            <Button type="submit" disabled={!canManage || isCreating}>
              {isCreating ? "Criando..." : "Criar conexao"}
            </Button>
          </form>

          {lastCreated ? (
            <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm">
              <p className="font-semibold text-ink">Webhook para configurar no provedor</p>
              <dl className="mt-3 space-y-2">
                <div>
                  <dt className="text-muted">Path</dt>
                  <dd className="break-all font-medium text-ink">
                    {lastCreated.webhook.path}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Verify token</dt>
                  <dd className="font-medium text-ink">
                    {maskToken(lastCreated.webhook.verifyToken)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </Card>
        </div>
      </section>
    </div>
  );
}
