import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../../lib/utils'

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** Optional icon rendered inside the input on the left. */
  icon?: ReactNode
  /** Optional trailing element (e.g. "Forgot?" link, eye toggle). */
  trailing?: ReactNode
  /** Force sharp 3px radius (default true — Mission Control language). */
  sharp?: boolean
}

/**
 * Floating-label input with sharp border + focus glow. Mission Control language:
 * seated, instrumented, no rounded-2xl soft-corner imports.
 */
const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  ({ label, icon, trailing, sharp = true, className, id, ...rest }, ref) => {
    const inputId = id ?? rest.name ?? `input-${label.toLowerCase().replace(/\s+/g, '-')}`
    return (
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-tertiary">
          {label}
        </label>
        <div className="relative group">
          {icon && (
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-tertiary">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full bg-white border border-black/10 text-ink placeholder:text-ink-muted',
              'px-3.5 py-2.5 text-[14px] font-body shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
              'transition-[border-color,box-shadow,background-color] duration-150',
              'hover:border-black/15 focus:outline-none focus:border-accent-primary/40 focus:shadow-[0_0_0_3px_rgba(79,70,229,0.14)] focus:bg-white',
              sharp ? 'rounded-[5px]' : 'rounded-xl',
              icon && 'pl-10',
              trailing && 'pr-16',
              className,
            )}
            {...rest}
          />
          {trailing && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {trailing}
            </div>
          )}
        </div>
      </div>
    )
  },
)

InputField.displayName = 'InputField'
export default InputField