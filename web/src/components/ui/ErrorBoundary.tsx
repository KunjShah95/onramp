import { Component, type ReactNode, type ErrorInfo } from 'react'
import { Warning } from '@phosphor-icons/react'
import { cn } from '../../lib/utils'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  className?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  private unhandledRejectionHandler?: (e: PromiseRejectionEvent) => void

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidMount() {
    this.unhandledRejectionHandler = (e: PromiseRejectionEvent) => {
      console.error('[ErrorBoundary] unhandledrejection', e.reason)
      // Prevent default browser error overlay; surface via boundary
      e.preventDefault()
      this.setState({ hasError: true, error: e.reason instanceof Error ? e.reason : new Error(String(e.reason)) })
      this.props.onError?.(e.reason instanceof Error ? e.reason : new Error(String(e.reason)), { componentStack: '' } as ErrorInfo)
    }
    window.addEventListener('unhandledrejection', this.unhandledRejectionHandler)
  }

  componentWillUnmount() {
    if (this.unhandledRejectionHandler) {
      window.removeEventListener('unhandledrejection', this.unhandledRejectionHandler)
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          role="alert"
          aria-labelledby="error-boundary-heading"
          className={cn(
            'flex flex-col items-center justify-center p-8 min-h-[200px]',
            this.props.className
          )}>
          <div className="w-12 h-12 rounded-xl bg-abort/10 border border-abort/20 flex items-center justify-center mb-4">
            <Warning size={24} weight="fill" aria-hidden className="text-abort shrink-0" />
          </div>
          <h3 className="text-base font-semibold text-ink mb-1" id="error-boundary-heading">Something went wrong</h3>
          <p className="text-sm text-ink-muted text-center max-w-md mb-4">
            {this.state.error?.message || 'An unexpected error occurred while rendering this section.'}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 bg-caution hover:bg-caution-lit text-[hsl(var(--primary-foreground))] text-xs font-bold rounded-btn transition-colors"
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
