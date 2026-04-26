"use client";

import Link from "next/link";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminShortcutPanel,
  adminMutedPanelClassName,
} from "@/components/platform/platform-admin";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  CommandCenterDomainDefinition,
  getCommandCenterPhaseLabel,
  getCommandCenterStatusLabel,
  getCommandCenterStatusTone,
} from "@/lib/platform-command-center";

interface CommandCenterDomainGridProps {
  domains: CommandCenterDomainDefinition[];
}

export function CommandCenterDomainGrid({
  domains,
}: CommandCenterDomainGridProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {domains.map((domain) => (
        <Link
          key={domain.href}
          href={domain.href}
          className="group rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm transition hover:border-slate-300 hover:bg-white"
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              label={getCommandCenterStatusLabel(domain.status)}
              tone={getCommandCenterStatusTone(domain.status)}
            />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              {getCommandCenterPhaseLabel(domain.phase)}
            </span>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-ink">{domain.label}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{domain.description}</p>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            {domain.activationRule}
          </p>
          <p className="mt-4 text-sm font-semibold text-slate-900 transition group-hover:text-teal-700">
            Abrir modulo
          </p>
        </Link>
      ))}
    </div>
  );
}

interface CommandCenterPlannedModuleProps {
  eyebrow: string;
  title: string;
  description: string;
  status: CommandCenterDomainDefinition["status"];
  phase: CommandCenterDomainDefinition["phase"];
  availableSignals: string[];
  requiredSignals: string[];
  nextAction: string;
  shortcuts?: Array<{
    label: string;
    description: string;
    href: string;
  }>;
}

export function CommandCenterPlannedModule({
  eyebrow,
  title,
  description,
  status,
  phase,
  availableSignals,
  requiredSignals,
  nextAction,
  shortcuts = [],
}: CommandCenterPlannedModuleProps) {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusPill
              label={getCommandCenterStatusLabel(status)}
              tone={getCommandCenterStatusTone(status)}
            />
            <StatusPill label={getCommandCenterPhaseLabel(phase)} tone="neutral" />
          </div>
        }
      />

      {shortcuts.length > 0 ? <AdminShortcutPanel items={shortcuts} /> : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Sinais ja conectados
          </p>
          <div className="mt-4 space-y-3">
            {availableSignals.map((signal) => (
              <div key={signal} className={adminMutedPanelClassName}>
                <p className="text-sm font-medium text-ink">{signal}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            O que falta para entrar com score real
          </p>
          <div className="mt-4 space-y-3">
            {requiredSignals.map((signal) => (
              <div key={signal} className={adminMutedPanelClassName}>
                <p className="text-sm font-medium text-ink">{signal}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <AdminEmptyState
        title="Modulo definido no nivel de arquitetura"
        description={nextAction}
      />
    </div>
  );
}
