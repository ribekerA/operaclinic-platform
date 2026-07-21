import { Button } from "./button";
import { Alert } from "./alert";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

/** Substitui as caixas vermelhas ad hoc repetidas em várias páginas por um estado de erro padronizado. */
export function ErrorState({ title = "Não foi possível carregar os dados", message, onRetry }: ErrorStateProps) {
  return (
    <Alert
      tone="danger"
      title={title}
      action={
        onRetry ? (
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            Tentar novamente
          </Button>
        ) : undefined
      }
    >
      {message}
    </Alert>
  );
}
