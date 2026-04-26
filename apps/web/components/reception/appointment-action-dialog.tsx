"use client";

import { adminTextareaClassName } from "@/components/platform/platform-admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface AppointmentActionDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  reason: string;
  requireReason?: boolean;
  isSubmitting?: boolean;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function AppointmentActionDialog({
  open,
  title,
  description,
  confirmLabel,
  reasonLabel,
  reasonPlaceholder,
  reason,
  requireReason = false,
  isSubmitting = false,
  onReasonChange,
  onConfirm,
  onClose,
}: AppointmentActionDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-6">
      <Card className="w-full max-w-xl space-y-4 bg-white p-6 shadow-2xl">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.16em] text-muted">
            Acao operacional
          </p>
          <h2 className="text-2xl font-semibold text-ink">{title}</h2>
          <p className="text-sm text-muted">{description}</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-ink" htmlFor="appointment-action-reason">
            {reasonLabel}
            {requireReason ? " *" : ""}
          </label>
          <textarea
            id="appointment-action-reason"
            className={`${adminTextareaClassName} min-h-28`}
            placeholder={reasonPlaceholder}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accentSoft"
            disabled={isSubmitting}
          >
            Fechar
          </button>
          <Button type="button" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}
