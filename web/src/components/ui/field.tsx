import { forwardRef, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface FieldShellProps {
  label: string
  hint?: string
  error?: string
  htmlFor: string
  children: ReactNode
  className?: string
}

/** Shared label + control + hint/error wrapper for every form control. */
function FieldShell({ label, hint, error, htmlFor, children, className }: FieldShellProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-tertiary">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-caption text-abort" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-caption text-ink-muted">{hint}</p>
      ) : null}
    </div>
  )
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, hint, error, id, className, children, ...rest }, ref) => {
    const fieldId = id ?? rest.name ?? `select-${label.toLowerCase().replace(/\s+/g, '-')}`
    return (
      <FieldShell label={label} hint={hint} error={error} htmlFor={fieldId}>
        <select
          ref={ref}
          id={fieldId}
          className={cn(
            'w-full bg-base border border-seam-strong text-ink placeholder:text-ink-disabled appearance-none',
            'px-3.5 py-2.5 text-[14px] font-body pr-9',
            "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%226%22%20viewBox%3D%220%200%2010%206%22%3E%3Cpath%20fill%3D%22%236C716A%22%20d%3D%22M5%206%200%200h10z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.9rem_center]",
            'rounded-[3px] transition-[border-color,box-shadow] duration-150',
            'focus:outline-none focus:border-go/60 focus:shadow-[0_0_0_3px_rgb(14_122_60_/_0.12)]',
            error && 'border-abort',
            className,
          )}
          aria-invalid={!!error}
          {...rest}
        >
          {children}
        </select>
      </FieldShell>
    )
  },
)
SelectField.displayName = 'SelectField'

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
  error?: string
}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  ({ label, hint, error, id, className, rows = 3, ...rest }, ref) => {
    const fieldId = id ?? rest.name ?? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}`
    return (
      <FieldShell label={label} hint={hint} error={error} htmlFor={fieldId}>
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          className={cn(
            'w-full bg-base border border-seam-strong text-ink placeholder:text-ink-disabled resize-y',
            'px-3.5 py-2.5 text-[14px] font-body leading-relaxed',
            'rounded-[3px] transition-[border-color,box-shadow] duration-150',
            'focus:outline-none focus:border-go/60 focus:shadow-[0_0_0_3px_rgb(14_122_60_/_0.12)]',
            error && 'border-abort',
            className,
          )}
          aria-invalid={!!error}
          {...rest}
        />
      </FieldShell>
    )
  },
)
TextareaField.displayName = 'TextareaField'
