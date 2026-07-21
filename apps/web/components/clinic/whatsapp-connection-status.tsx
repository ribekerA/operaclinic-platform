import { AlertTriangle, CheckCircle2, MessageCircle, XCircle } from "lucide-react";

export type WhatsAppConnectionState = "connected" | "degraded" | "disconnected" | "error";

interface WhatsAppConnectionStatusProps {
  state: WhatsAppConnectionState;
  label: string;
  description?: string;
}

const stateConfig: Record<WhatsAppConnectionState, { icon: typeof MessageCircle; className: string }> = {
  connected: { icon: CheckCircle2, className: "border-success/20 bg-success-soft text-success" },
  degraded: { icon: AlertTriangle, className: "border-warning/20 bg-warning-soft text-warning" },
  disconnected: { icon: MessageCircle, className: "border-slate-200 bg-slate-100 text-slate-600" },
  error: { icon: XCircle, className: "border-danger/20 bg-danger-soft text-danger" },
};

/**
 * Indicador padronizado do estado da conexão WhatsApp — usado na página de integrações
 * e onde mais o produto precisar sinalizar se o canal está operante. Nunca depende só de
 * cor: sempre acompanha ícone + rótulo textual.
 */
export function WhatsAppConnectionStatus({ state, label, description }: WhatsAppConnectionStatusProps) {
  const config = stateConfig[state];
  const Icon = config.icon;

  return (
    <div className={`inline-flex items-start gap-2.5 rounded-panel border px-3.5 py-2.5 ${config.className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {description ? <p className="text-xs opacity-80">{description}</p> : null}
      </div>
    </div>
  );
}
