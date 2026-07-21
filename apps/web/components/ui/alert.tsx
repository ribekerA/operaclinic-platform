import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";

type AlertTone = "info" | "success" | "warning" | "danger";

interface AlertProps {
  tone?: AlertTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

const toneConfig: Record<AlertTone, { container: string; icon: ReactNode; iconColor: string }> = {
  info: {
    container: "border-slate-200 bg-slate-50 text-ink",
    icon: <Info className="h-4 w-4" aria-hidden="true" />,
    iconColor: "text-slate-500",
  },
  success: {
    container: "border-success/20 bg-success-soft text-ink",
    icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
    iconColor: "text-success",
  },
  warning: {
    container: "border-warning/20 bg-warning-soft text-ink",
    icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
    iconColor: "text-warning",
  },
  danger: {
    container: "border-danger/20 bg-danger-soft text-ink",
    icon: <XCircle className="h-4 w-4" aria-hidden="true" />,
    iconColor: "text-danger",
  },
};

/** Banner persistente inline (não confundir com Toast, que é transitório). */
export function Alert({ tone = "info", title, children, action, className = "" }: AlertProps) {
  const config = toneConfig[tone];
  const isUrgent = tone === "danger" || tone === "warning";

  return (
    <div
      role={isUrgent ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-panel border p-4 ${config.container} ${className}`}
    >
      <span className={`mt-0.5 shrink-0 ${config.iconColor}`}>{config.icon}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        {children ? <div className="text-sm text-muted">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
