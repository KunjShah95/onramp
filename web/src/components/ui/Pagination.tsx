import { cn } from '../../lib/utils'

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export default function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div
      className="flex items-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-[#FF8C00]/30 rounded-lg"
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
      <span className="text-[10px] text-[#FDFBF8]/30 font-mono mr-1">
        Page {page + 1} of {totalPages}
      </span>

      {/* Previous */}
      <button
        onClick={() => onPageChange(Math.max(0, page - 1))}
        disabled={page === 0}
        className="w-7 h-7 rounded-lg bg-[#FDFBF8]/5 border border-[#FDFBF8]/8 flex items-center justify-center text-[11px] text-[#FDFBF8]/60 hover:text-[#FDFBF8] hover:bg-[#FDFBF8]/10 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
      >
        ‹
      </button>

      {/* Page numbers */}
      {totalPages <= 7 ? (
        Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            onClick={() => onPageChange(i)}
            className={cn(
              'w-7 h-7 rounded-lg text-[11px] font-mono transition-all',
              page === i
                ? 'bg-[#FF8C00]/15 text-[#FF8C00] border border-[#FF8C00]/30'
                : 'text-[#FDFBF8]/40 hover:text-[#FDFBF8] hover:bg-[#FDFBF8]/5'
            )}
          >
            {i + 1}
          </button>
        ))
      ) : (
        <>
          {/* First page */}
          <button
            onClick={() => onPageChange(0)}
            className={cn(
              'w-7 h-7 rounded-lg text-[11px] font-mono transition-all',
              page === 0
                ? 'bg-[#FF8C00]/15 text-[#FF8C00] border border-[#FF8C00]/30'
                : 'text-[#FDFBF8]/40 hover:text-[#FDFBF8] hover:bg-[#FDFBF8]/5'
            )}
          >
            1
          </button>

          {/* Left ellipsis */}
          {page > 2 && <span className="text-[#FDFBF8]/20 text-[11px] px-0.5">…</span>}

          {/* Adjacent pages */}
          {Array.from({ length: totalPages }, (_, i) => i)
            .filter(i => i !== 0 && i !== totalPages - 1 && Math.abs(i - page) <= 1)
            .map(i => (
              <button
                key={i}
                onClick={() => onPageChange(i)}
                className={cn(
                  'w-7 h-7 rounded-lg text-[11px] font-mono transition-all',
                  page === i
                    ? 'bg-[#FF8C00]/15 text-[#FF8C00] border border-[#FF8C00]/30'
                    : 'text-[#FDFBF8]/40 hover:text-[#FDFBF8] hover:bg-[#FDFBF8]/5'
                )}
              >
                {i + 1}
              </button>
            ))}

          {/* Right ellipsis */}
          {page < totalPages - 3 && <span className="text-[#FDFBF8]/20 text-[11px] px-0.5">…</span>}

          {/* Last page */}
          <button
            onClick={() => onPageChange(totalPages - 1)}
            className={cn(
              'w-7 h-7 rounded-lg text-[11px] font-mono transition-all',
              page === totalPages - 1
                ? 'bg-[#FF8C00]/15 text-[#FF8C00] border border-[#FF8C00]/30'
                : 'text-[#FDFBF8]/40 hover:text-[#FDFBF8] hover:bg-[#FDFBF8]/5'
            )}
          >
            {totalPages}
          </button>
        </>
      )}

      {/* Next */}
      <button
        onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
        disabled={page >= totalPages - 1}
        className="w-7 h-7 rounded-lg bg-[#FDFBF8]/5 border border-[#FDFBF8]/8 flex items-center justify-center text-[11px] text-[#FDFBF8]/60 hover:text-[#FDFBF8] hover:bg-[#FDFBF8]/10 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
      >
        ›
      </button>
    </div>
  )
}
