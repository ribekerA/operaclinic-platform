"use client";

import Link from "next/link";
import {
  AdminEmptyState,
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionHeader,
  AdminShortcutPanel,
} from "@/components/platform/platform-admin";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { usePlatformDashboard } from "@/hooks/use-platform-dashboard";

function formatPercent(value: number | null): string {
  if (value === null) {
    return "--";
  }

  return `${value.toFixed(1)}%`;
}

function formatDuration(value: number | null): string {
  if (value === null) {
    return "--";
  }

  return `${value.toFixed(0)} ms`;
}

export default function PlatformAgentsPage() {
  const { dashboard, isLoading, error, reload } = usePlatformDashboard();
  const commandCenter = dashboard?.agents.commandCenter ?? null;
  const readiness = dashboard?.agents.readiness ?? null;

  const metrics = commandCenter
    ? [
        {
          label: "Execucoes 30d",
          value: String(commandCenter.totalExecutions),
          helper: `${commandCenter.uniqueThreads} threads unicas com trilha persistida.`,
          tone: "accent" as const,
        },
        {
          label: "Resolucao segura",
          value: formatPercent(commandCenter.safeResolutionRate),
          helper: `${commandCenter.safeAutomaticResolutions} outcomes automaticos terminais persistidos sem handoff humano.`,
          tone:
            (commandCenter.safeResolutionRate ?? 0) > 0
              ? ("accent" as const)
              : ("default" as const),
        },
        {
          label: "Handoff rate",
          value: formatPercent(commandCenter.handoffRate),
          helper: `${commandCenter.handoffOpened} execucoes terminaram em fallback humano.`,
          tone:
            (commandCenter.handoffRate ?? 0) > 40
              ? ("warning" as const)
              : ("default" as const),
        },
        {
          label: "Failure rate",
          value: formatPercent(commandCenter.failureRate),
          helper: `${commandCenter.failed} execucoes falharam na janela.`,
          tone:
            (commandCenter.failureRate ?? 0) > 5
              ? ("danger" as const)
              : ("default" as const),
        },
        {
          label: "Duracao media",
          value: formatDuration(commandCenter.averageDurationMs),
          helper: `${commandCenter.totalSkillCalls} skill calls; ${commandCenter.failedSkillCalls} falharam.`,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Command Center"
        title="Agents & Skills"
        description="Leitura parcial real do agent layer: volume tratado, fallback humano, falhas e skills mais acionadas, com rastreabilidade por tenant, thread e correlationId."
        actions={
          <button
            type="button"
            onClick={() => {
              void reload();
            }}
            disabled={isLoading}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
          >
            {isLoading ? "Atualizando..." : "Atualizar modulo"}
          </button>
        }
      >
        <AdminMetricGrid items={metrics} isLoading={isLoading && !dashboard} />
      </AdminPageHeader>

      <AdminShortcutPanel
        items={[
          {
            label: "Abrir reliability",
            description: "Cruzar rollout, latencia e falha tecnica do agent layer.",
            href: "/platform/reliability",
          },
          {
            label: "Abrir operations",
            description: "Comparar fallback humano do agent layer com a carga operacional.",
            href: "/platform/operations",
          },
          {
            label: "Abrir overview",
            description: "Voltar para a leitura executiva consolidada.",
            href: "/platform",
          },
        ]}
      />

      {error ? (
        <Card className="border-rose-200 bg-rose-50" role="alert">
          <p className="text-sm text-rose-700">{error}</p>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <AdminSectionHeader
            eyebrow="Readiness"
            title="Estado tecnico do agent layer"
            description="Sinais de curto prazo vindos do readiness: rollout, falha e latencia recentes."
            actions={
              <StatusPill
                label={
                  readiness?.status === "ok"
                    ? "Operavel"
                    : readiness?.status === "degraded"
                      ? "Parcial"
                      : "Critico"
                }
                tone={
                  readiness?.status === "ok"
                    ? "success"
                    : readiness?.status === "degraded"
                      ? "warning"
                      : "danger"
                }
              />
            }
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                Rollout
              </p>
              <p className="mt-3 text-2xl font-semibold text-ink">
                {readiness ? `${readiness.rolloutPercentage}%` : "--"}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {readiness?.enabled
                  ? "Agent layer habilitado no ambiente."
                  : "Agent layer desligado por configuracao."}
              </p>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                Janela curta
              </p>
              <p className="mt-3 text-2xl font-semibold text-ink">
                {readiness ? `${readiness.metricsWindowMinutes} min` : "--"}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {readiness
                  ? `${readiness.totalExecutions} execucoes recentes, p95 ${formatDuration(readiness.p95DurationMs)}.`
                  : "Sem readiness carregado."}
              </p>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                Failure alert
              </p>
              <p className="mt-3 text-2xl font-semibold text-ink">
                {readiness ? formatPercent(readiness.failureRate) : "--"}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Limiar de alerta:{" "}
                {readiness
                  ? formatPercent(readiness.failureRateAlertThreshold * 100)
                  : "--"}
                .
              </p>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                Latencia media
              </p>
              <p className="mt-3 text-2xl font-semibold text-ink">
                {readiness ? formatDuration(readiness.avgDurationMs) : "--"}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Alerta de p95 em{" "}
                {readiness ? formatDuration(readiness.p95LatencyAlertMs) : "--"}.
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <AdminSectionHeader
            eyebrow="Snapshot persistido"
            title="O que ja e rastreavel por tenant"
            description="Execucoes agregadas em 30 dias a partir de fatos persistidos por thread."
            actions={
              <StatusPill
                label={commandCenter?.available ? "Ativo" : "Sem dado"}
                tone={commandCenter?.available ? "success" : "warning"}
              />
            }
          />
          {commandCenter ? (
            <div className="mt-4 grid gap-3">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-ink">Mix de agentes</p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Captacao: {commandCenter.agentMix.captacao} execucoes
                </p>
                <p className="text-sm leading-6 text-muted">
                  Agendamento: {commandCenter.agentMix.agendamento} execucoes
                </p>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-ink">Status finais</p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Aguardando input: {commandCenter.waitingForInput}
                </p>
                <p className="text-sm leading-6 text-muted">
                  Handoff aberto: {commandCenter.handoffOpened}
                </p>
                <p className="text-sm leading-6 text-muted">
                  Completadas: {commandCenter.completed}
                </p>
                <p className="text-sm leading-6 text-muted">
                  Falhas: {commandCenter.failed}
                </p>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-ink">Outcome explicito</p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Resolvidas sem humano: {commandCenter.safeAutomaticResolutions}
                </p>
                <p className="text-sm leading-6 text-muted">
                  Taxa segura sobre completadas: {formatPercent(commandCenter.safeResolutionRate)}
                </p>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-ink">Cobertura</p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {commandCenter.tenantCoverage.available}/
                  {commandCenter.tenantCoverage.active} tenants ativos com uso persistido.
                </p>
                <p className="text-sm leading-6 text-muted">
                  Metodo: {commandCenter.methodology}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <AdminEmptyState
                title="Sem agregacao de agentes carregada"
                description="O control plane ainda nao conseguiu consolidar os fatos persistidos do agent layer."
              />
            </div>
          )}
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <AdminSectionHeader
            eyebrow="Skills"
            title="Skills mais acionadas"
            description="Ranking derivado dos steps persistidos em cada execucao."
          />
          <div className="mt-4 space-y-3">
            {commandCenter?.topSkills.length ? (
              commandCenter.topSkills.map((skill) => (
                <div
                  key={skill.skillName}
                  className="rounded-[20px] border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{skill.skillName}</p>
                      <p className="text-xs text-muted">
                        {skill.totalExecutions} execucoes, {skill.failedExecutions} falhas
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-ink">
                      {formatPercent(skill.failureRate)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">
                Nenhuma skill persistida na janela selecionada.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <AdminSectionHeader
            eyebrow="Tenants"
            title="Maior volume de agentes"
            description="Clinicas onde o agent layer mais tocou threads no periodo."
          />
          <div className="mt-4 space-y-3">
            {commandCenter?.highestVolumeTenants.length ? (
              commandCenter.highestVolumeTenants.map((tenant) => (
                <div
                  key={tenant.tenantId}
                  className="rounded-[20px] border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{tenant.tenantName}</p>
                      <p className="text-xs text-muted">{tenant.timezone}</p>
                    </div>
                    <p className="text-sm font-semibold text-ink">
                      {tenant.totalExecutions} exec.
                    </p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {tenant.uniqueThreads} threads, fallback {formatPercent(tenant.handoffRate)},
                    falha {formatPercent(tenant.failureRate)}.
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">
                Nenhum tenant com execucao persistida na janela.
              </p>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <AdminSectionHeader
            eyebrow="Fallback"
            title="Tenants com mais handoff"
            description="Onde a automacao mais devolve a conversa para a recepcao."
          />
          <div className="mt-4 space-y-3">
            {commandCenter?.highestFallbackTenants.length ? (
              commandCenter.highestFallbackTenants.map((tenant) => (
                <div
                  key={tenant.tenantId}
                  className="rounded-[20px] border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{tenant.tenantName}</p>
                      <p className="text-xs text-muted">{tenant.timezone}</p>
                    </div>
                    <p className="text-sm font-semibold text-ink">
                      {formatPercent(tenant.handoffRate)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {tenant.handoffOpened} de {tenant.totalExecutions} execucoes abriram handoff.
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">
                Nenhum tenant com fallback persistido na janela.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <AdminSectionHeader
            eyebrow="Lacunas honestas"
            title="O que ainda nao entra no score"
            description="O modulo subiu porque o dado agora existe. O que ainda falta continua explicito."
            actions={<StatusPill label="Parcial" tone="warning" />}
          />
          <div className="mt-4 space-y-3">
            {commandCenter?.knownGaps.length ? (
              commandCenter.knownGaps.map((gap) => (
                <div
                  key={gap}
                  className="rounded-[20px] border border-amber-200 bg-amber-50 p-4"
                >
                  <p className="text-sm leading-6 text-amber-800">{gap}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">
                Nenhuma lacuna declarada para este modulo.
              </p>
            )}
            {readiness?.issues.length ? (
              readiness.issues.map((issue) => (
                <div
                  key={issue}
                  className="rounded-[20px] border border-rose-200 bg-rose-50 p-4"
                >
                  <p className="text-sm leading-6 text-rose-700">{issue}</p>
                </div>
              ))
            ) : null}
          </div>
          <div className="mt-5">
            <Link
              href="/platform/operations"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
            >
              Cruzar com operations
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
