import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Which section this boundary protects — shown in the fallback UI */
  section: 'app' | 'map' | 'tab'
  /** Optional callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[ErrorBoundary:${this.props.section}]`, error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const { section } = this.props
    const message =
      section === 'map'
        ? 'The map encountered an error.'
        : section === 'tab'
          ? 'This section encountered an error.'
          : 'Something went wrong.'

    return (
      <div className="flex flex-col items-center justify-center p-8 text-center gap-4 h-full min-h-[200px]">
        <div className="text-red-500 dark:text-red-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
        {this.state.error && (
          <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs truncate">
            {this.state.error.message}
          </p>
        )}
        <button
          onClick={this.handleRetry}
          className="px-4 py-2 text-sm font-medium text-white bg-[#2C3E7B] rounded-lg hover:bg-[#1a2a5e] transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }
}
