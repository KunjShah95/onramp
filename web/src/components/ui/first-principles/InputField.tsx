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
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full bg-base border border-seam-strong text-ink placeholder:text-ink-disabled',
              'px-3.5 py-2.5 text-[14px] font-body',
              'transition-[border-color,box-shadow] duration-150',
              'focus:outline-none focus:border-go/60 focus:shadow-[0_0_0_3px_rgb(14_122_60_/_0.12)]',
              sharp ? 'rounded-[3px]' : 'rounded-md',
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