import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Eye, EyeSlash } from '@phosphor-icons/react'
import InputField from './first-principles/InputField'

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  name: string
  icon?: ReactNode
  /** Extra element rendered left of the eye toggle (e.g. "Forgot?" link). */
  trailingExtra?: ReactNode
}

/**
 * Password input with a persistent show/hide eye toggle.
 * Toggle is type="button" so it never submits the form, and uses
<<<<<<< HEAD
 * onMouseDown preventDefault so the input keeps focus.
=======
 * onMouseDown preventDefault so the input keeps focus (toggle never "jato rahe").
>>>>>>> cae272328a35776c20cb7e65ca99143addd641e7
 */
const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ label, trailingExtra, ...rest }, ref) => {
    const [show, setShow] = useState(false)
    return (
      <InputField
        ref={ref}
        label={label}
        type={show ? 'text' : 'password'}
        trailing={
          <span className="inline-flex items-center gap-2">
            {trailingExtra}
            <button
              type="button"
              aria-label={show ? 'Hide password' : 'Show password'}
              aria-pressed={show}
              title={show ? 'Hide password' : 'Show password'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShow((v) => !v)}
              className="rounded p-1 text-ink-tertiary transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/50"
            >
              {show ? <EyeSlash size={16} weight="bold" /> : <Eye size={16} weight="bold" />}
            </button>
          </span>
        }
        {...rest}
      />
    )
  },
)

PasswordField.displayName = 'PasswordField'
export default PasswordField
