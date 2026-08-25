import { ChevronLeft, ChevronRight } from 'lucide-react';

export function TablePagination({
  currentPage,
  totalItems,
  pageSize = 20,
  onPageChange,
}: {
  currentPage: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.ceil(totalItems / pageSize);

  if (pageCount <= 1) {
    return null;
  }

  const page = Math.min(Math.max(currentPage, 1), pageCount);
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);

  return (
    <nav className="table-pagination" aria-label="Paginación de resultados">
      <span>{totalItems} registros</span>
      <div>
        <button type="button" className="secondary compact" disabled={page === 1} onClick={() => onPageChange(page - 1)} aria-label="Página anterior">
          <ChevronLeft size={16} />
        </button>
        {pages.map((item) => (
          <button key={item} type="button" className={item === page ? 'table-pagination-page active' : 'table-pagination-page'} aria-current={item === page ? 'page' : undefined} onClick={() => onPageChange(item)}>
            {item}
          </button>
        ))}
        <button type="button" className="secondary compact" disabled={page === pageCount} onClick={() => onPageChange(page + 1)} aria-label="Página siguiente">
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}
