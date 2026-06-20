import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

const STEPS = [
  { step: 1, label: "Plano", href: "/planos" },
  { step: 2, label: "Cadastro", href: null },
  { step: 3, label: "Checkout", href: null },
  { step: 4, label: "Acesso", href: null },
] as const;

interface OnboardingProgressProps {
  currentStep: 1 | 2 | 3 | 4;
  token?: string | null;
}

export function OnboardingProgress({ currentStep, token }: OnboardingProgressProps) {
  return (
    <nav
      aria-label="Etapas do cadastro"
      className="flex items-center gap-0 rounded-[20px] border border-white/70 bg-white/80 p-1.5 shadow-panel backdrop-blur"
    >
      {STEPS.map((item, index) => {
        const isDone = item.step < currentStep;
        const isActive = item.step === currentStep;
        const isLast = index === STEPS.length - 1;

        const stepContent = (
          <span
            className={`flex items-center gap-1.5 sm:gap-2 rounded-[14px] px-2 sm:px-4 py-2 text-xs font-semibold transition-all duration-300 ${
              isActive
                ? "bg-ink text-white shadow-[0_0_0_2px_rgba(30,41,59,0.12),0_2px_8px_rgba(30,41,59,0.12)]"
                : isDone
                  ? "text-accent"
                  : "text-muted"
            }`}
          >
            {isDone ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" />
            ) : (
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                  isActive
                    ? "animate-pulse bg-white/20 text-white"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {item.step}
              </span>
            )}
            <span className="hidden sm:inline">{item.label}</span>
          </span>
        );

        const href =
          item.step === 2 && token
            ? `/cadastro?token=${encodeURIComponent(token)}`
            : item.step === 3 && token
              ? `/checkout?token=${encodeURIComponent(token)}`
              : item.href;

        return (
          <div key={item.step} className="flex items-center">
            {isDone && href ? (
              <Link href={href} aria-label={`Etapa ${item.step}: ${item.label} (concluída)`}>
                {stepContent}
              </Link>
            ) : (
              <span aria-current={isActive ? "step" : undefined}>{stepContent}</span>
            )}
            {!isLast && (
              <span
                className={`mx-0.5 h-px w-2 sm:w-4 transition-colors duration-500 ${isDone ? "bg-accent/40" : "bg-slate-200"}`}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
