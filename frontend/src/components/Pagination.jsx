const buildPageItems = (currentPage, totalPages) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  if (currentPage <= 4) [2, 3, 4, 5].forEach((page) => pages.add(page));
  if (currentPage >= totalPages - 3) {
    [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1].forEach((page) => pages.add(page));
  }

  const sorted = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const items = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) items.push(`ellipsis-${page}`);
    items.push(page);
  });
  return items;
};

export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <nav className="flex items-center gap-1" aria-label="Pagination">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        aria-label="Previous page"
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-on-surface-variant hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined text-base">chevron_left</span>
      </button>

      {buildPageItems(page, totalPages).map((item) => typeof item === "number" ? (
        <button
          key={item}
          type="button"
          onClick={() => onPageChange(item)}
          aria-label={`Page ${item}`}
          aria-current={item === page ? "page" : undefined}
          className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${
            item === page ? "bg-primary text-white" : "border border-gray-200 text-on-surface-variant hover:bg-gray-50"
          }`}
        >
          {item}
        </button>
      ) : (
        <span key={item} className="w-8 h-8 flex items-center justify-center text-sm text-on-surface-variant" aria-hidden="true">…</span>
      ))}

      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        aria-label="Next page"
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-on-surface-variant hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined text-base">chevron_right</span>
      </button>
    </nav>
  );
}
