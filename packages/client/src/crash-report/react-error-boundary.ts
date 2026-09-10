import type { ReactErrorBoundaryReportArgs } from '@agentstart/protocol/crash-reports/values'
import type React from 'react'

import { reportRendererErrorCrash } from './renderer-error'

type BuildReportArgsInput = {
  boundaryId: string
  surface: ReactErrorBoundaryReportArgs['surface']
  error: unknown
  errorInfo?: React.ErrorInfo
}

export function reportReactErrorBoundaryCrash(input: BuildReportArgsInput): Promise<void> {
  return reportRendererErrorCrash({
    kind: 'react-error-boundary',
    originId: input.boundaryId,
    surface: input.surface,
    error: input.error,
    ...(input.errorInfo?.componentStack ? { componentStack: input.errorInfo.componentStack } : {})
  })
}
