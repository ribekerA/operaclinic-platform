import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "./icon-button";

interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  totalLabel?: string;
}

export function Pagination({ page, pageCount, onPageChange, totalLabel }: PaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3 pt-3">
      <p className="text-xs text-muted">
        {totalLabel ?? `Página ${page} de ${pageCount}`}
      </p>
      <div className="flex items-center gap-1.5">
        <IconButton
          icon={<ChevronLeft className="h-4 w-4" />}
          label="Página anterior"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        />
        <IconButton
          icon={<ChevronRight className="h-4 w-4" />}
          label="Próxima página"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </nav>
  );
}
