import type { CrashReportRecord } from './values'

export function isCrashReportReason(reason: string): boolean {
  return [
    'abnormal-exit',
    'crashed',
    'integrity-failure',
    'killed',
    'launch-failed',
    'memory-eviction',
    'oom'
  ].includes(reason)
}

export function isReactErrorBoundaryReport(report: CrashReportRecord): boolean {
  return (
    report.source === 'renderer' &&
    report.processType === 'react-render' &&
    report.reason === 'react-error-boundary'
  )
}

export function isRecoverableRendererErrorReport(report: CrashReportRecord): boolean {
  return (
    report.source === 'renderer' &&
    (report.reason === 'react-error-boundary' ||
      report.reason === 'renderer-unhandled-error' ||
      report.reason === 'terminal-error')
  )
}
