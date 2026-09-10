import type { ReactErrorBoundaryReportArgs } from '@agentstart/protocol/crash-reports/values'
import React from 'react'
import { isLazyChunkLoadError } from '~renderer/application-shell/lazy-with-retry'
import { reportReactErrorBoundaryCrash } from '~renderer/crash-report/react-error-boundary'
import { translate } from '~renderer/i18n/i18n'
import { Warning as AlertTriangle, ArrowClockwise as RotateCw } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

type BoundaryFallbackArgs = {
  error: Error | null
  reset: () => void
}

type Props = {
  boundaryId: string
  surface: ReactErrorBoundaryReportArgs['surface']
  children: React.ReactNode
  className?: string
  compact?: boolean
  reportAsCrash?: boolean
  resetKey?: string | number | boolean | null
  title?: string
  description?: string
  fallback?: (args: BoundaryFallbackArgs) => React.ReactNode
}

type State = {
  error: Error | null
  resetKey: Props['resetKey']
}

export class RecoverableRenderErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey }
    }
    return null
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(`[${this.props.boundaryId}] render crash contained by boundary`, error, errorInfo)
    if (this.props.reportAsCrash === false) {
      return
    }
    if (isLazyChunkLoadError(error)) {
      return
    }
    void reportReactErrorBoundaryCrash({
      boundaryId: this.props.boundaryId,
      surface: this.props.surface,
      error,
      errorInfo
    })
  }

  handleReset = (): void => {
    if (isLazyChunkLoadError(this.state.error)) {
      // Why: React.lazy permanently caches a rejected import, so remounting this
      // boundary cannot retry it. A user-triggered reload rebuilds the module map.
      window.location.reload()
      return
    }
    this.setState({ error: null })
  }

  render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children
    }

    if (this.props.fallback) {
      return this.props.fallback({ error: this.state.error, reset: this.handleReset })
    }

    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground',
          this.props.compact ? 'min-h-9 py-2' : 'h-full min-h-0 w-full py-8',
          this.props.className
        )}
        role="alert"
      >
        <div className="border-destructive/25 bg-destructive/10 text-destructive flex size-8 items-center justify-center rounded-full border">
          <AlertTriangle className="size-4" />
        </div>
        <div className="space-y-1">
          <div className="text-foreground font-medium">
            {this.props.title ??
              translate(
                'auto.components.error.boundaries.RecoverableRenderErrorBoundary.ab855c11f4',
                'This part of AgentStart hit an error.'
              )}
          </div>
          <div className="max-w-md text-xs">
            {this.props.description ??
              translate(
                'auto.components.error.boundaries.RecoverableRenderErrorBoundary.34a189ae0f',
                'The rest of the app is still running. Retry this surface or switch away and come back.'
              )}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={this.handleReset}>
          <RotateCw className="size-3.5" />
          {translate(
            'auto.components.error.boundaries.RecoverableRenderErrorBoundary.55001880db',
            'Retry'
          )}
        </Button>
      </div>
    )
  }
}
