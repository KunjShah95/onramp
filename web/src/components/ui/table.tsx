import { type ReactNode, type ThHTMLAttributes, type TdHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

/**
 * Mission Control data-table primitives. Consistent row seams, mono
 * telemetry columns, hairline dividers — no zebra stripes, no card-per-row.
 * Wrap a set of rows in a single <Table> inside a ConsolePanel with pad="none".
 */

export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  )
}

export function THead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <thead className={cn('border-b border-seam', className)}>{children}</thead>
  )
}

export function TBody({ children, className }: { children: ReactNode; className?: string }) {
  return <tbody className={className}>{children}</tbody>
}

export function TR({ children, className, hoverable }: { children: ReactNode; className?: string; hoverable?: boolean }) {
  return (
    <tr className={cn('border-b border-seam last:border-b-0', hoverable && 'transition-colors hover:bg-well/50', className)}>
      {children}
    </tr>
  )
}

export function TH({ children, className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'overline text-ink-muted font-semibold px-4 py-2.5 text-left whitespace-nowrap first:pl-5 last:pr-5',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  )
}

export function TD({ children, className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle text-body-sm text-ink first:pl-5 last:pr-5',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  )
}
