import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

const CHUNK_RELOAD_KEY = 'id8:chunk-reloaded'

/** True when the error is a stale dynamically-imported chunk (post-deploy hash change). */
function isChunkLoadError(error: Error | null): boolean {
  const msg = error?.message || ''
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|chunkloaderror/i.test(msg)
}

interface Props {
  /** Label shown in the error card so the user knows which section failed */
  section?: string
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Lightweight error boundary for individual sections / panels.
 * Unlike the global ErrorFallback, this renders inline and lets the rest
 * of the page continue working.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[SectionErrorBoundary${this.props.section ? ` – ${this.props.section}` : ''}]`, error, info)
    // A stale chunk means a newer version shipped while this tab was open — reload
    // once to fetch the current build (guarded against reload loops).
    if (isChunkLoadError(error) && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
      window.location.reload()
    }
  }

  handleRetry = () => {
    if (isChunkLoadError(this.state.error)) {
      window.location.reload()
      return
    }
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      const chunk = isChunkLoadError(this.state.error)
      return (
        <Alert variant="destructive" className="my-4">
          <AlertTitle>
            {chunk
              ? 'A new version is available'
              : this.props.section ? `${this.props.section} failed to render` : 'Something went wrong'}
          </AlertTitle>
          <AlertDescription className="mt-1 text-xs">
            {chunk
              ? 'This page was updated since you loaded it. Reload to get the latest version.'
              : this.state.error?.message || 'An unexpected error occurred in this section.'}
          </AlertDescription>
          <Button size="sm" variant="outline" className="mt-3" onClick={this.handleRetry}>
            {chunk ? 'Reload' : 'Retry'}
          </Button>
        </Alert>
      )
    }

    return this.props.children
  }
}
