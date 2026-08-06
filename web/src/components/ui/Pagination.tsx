import { cn } from '../../lib/utils'

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

const pageBtn =
  'w-7 h-7 rounded-lg bg-bg-secondary border border-border flex items-center justify-center text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-all disabled:opacity-25 disabled:cursor-not-allowed'

const numBtn = (active: boolean) =>
  cn(
    'w-7 h-7 rounded-lg text-[11px] font-mono transition-all',
    active
      ? 'bg-warning/15 text-warning border border-warning/30'
      : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
  )

export default function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div
      className="flex items-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-warning/30 rounded-lg"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' && page > 0) {
          e.preventDefault()
          onPageChange(page - 1)
        } else if (e.key === 'ArrowRight' && page < totalPages - 1) {
          e.preventDefault()
          onPageChange(page + 1)
        }
      }}
    >
      <span className="text-[10px] text-text-muted/70 font-mono mr-1">
        Page {page + 1} of {totalPages}
      </span>

      {/* Previous */}
      <button
        onClick={() => onPageChange(Math.max(0, page - 1))}
        disabled={page === 0}
        aria-label="Previous page"
        className={pageBtn}
      >
        ‹
      </button>

      {/* Page numbers */}
      {totalPages <= 7 ? (
        Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            onClick={() => onPageChange(i)}
            className={numBtn(page === i)}
          >
            {i + 1}
          </button>
        ))
      ) : (
        <>
          {/* First page */}
          <button
            onClick={() => onPageChange(0)}
            className={numBtn(page === 0)}
          >
            1
          </button>

          {/* Left ellipsis */}
          {page > 2 && <span className="text-text-disabled text-[11px] px-0.5">…</span>}

          {/* Adjacent pages */}
          {Array.from({ length: totalPages }, (_, i) => i)
            .filter(i => i !== 0 && i !== totalPages - 1 && Math.abs(i - page) <= 1)
            .map(i => (
              <button
                key={i}
                onClick={() => onPageChange(i)}
                className={numBtn(page === i)}
              >
                {i + 1}
              </button>
            ))}

          {/* Right ellipsis */}
          {page < totalPages - 3 && <span className="text-text-disabled text-[11px] px-0.5">…</span>}

          {/* Last page */}
          <button
            onClick={() => onPageChange(totalPages - 1)}
            className={numBtn(page === totalPages - 1)}
          >
            {totalPages}
          </button>
        </>
      )}

      {/* Next */}
      <button
        onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
        disabled={page >= totalPages - 1}
        aria-label="Next page"
        className={pageBtn}
      >
        ›
      </button>
    </div>
  )
}
