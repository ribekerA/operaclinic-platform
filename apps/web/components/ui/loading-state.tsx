interface LoadingStateProps {
  label?: string;
}

/** Spinner + rótulo, para carregamentos de página inteira. Para listas, prefira os Skeletons de platform-admin.tsx. */
export function LoadingState({ label = "Carregando..." }: LoadingStateProps) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-muted">
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-accent"
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}
