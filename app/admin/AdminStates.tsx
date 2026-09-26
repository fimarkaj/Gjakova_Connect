export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="admin-table-wrap" aria-busy="true" aria-label="Duke ngarkuar…">
      <div className="skeleton-table">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="skeleton-row" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols }, (_, c) => (
              <span key={c} className="skeleton" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="inline-error" role="alert">
      <span>{message}</span>
      <button type="button" onClick={onRetry}>
        Provo përsëri
      </button>
    </div>
  );
}
