import type { StartupHostPlatform } from '../agent/shell-command'
import type { CrashReportDiagnosticBundle } from './diagnostic-bundle'
import type { RendererErrorSurface } from './renderer-error'

export type CrashReportStatus = 'pending' | 'sent' | 'dismissed'
export type CrashReportSource = 'renderer' | 'child'

export type CrashReportDetailValue = string | number | boolean | null
export type CrashReportBreadcrumbData = Record<string, CrashReportDetailValue>

export type CrashReportBreadcrumb = {
  createdAt: string
  name: string
  data?: CrashReportBreadcrumbData
}

export type CrashReportBreadcrumbInput = {
  createdAt: string
  name: string
  data?: Record<string, unknown>
}

export type CrashReportRecord = {
  id: string
  createdAt: string
  status: CrashReportStatus
  source: CrashReportSource
  processType: string
  reason: string
  exitCode: number | null
  appVersion: string
  platform: StartupHostPlatform
  osRelease: string
  arch: string
  chromeVersion: string
  details: Record<string, CrashReportDetailValue>
  breadcrumbs?: CrashReportBreadcrumb[]
}

export type UncapturedCrashReportContext = {
  createdAt: string
  appVersion: string
  platform: StartupHostPlatform
  osRelease: string
  arch: string
  chromeVersion: string
}

export type CrashReportCreateInput = Omit<
  CrashReportRecord,
  'id' | 'createdAt' | 'status' | 'details' | 'breadcrumbs'
> & {
  details: Record<string, unknown>
  breadcrumbs?: CrashReportBreadcrumbInput[]
}

export type RendererErrorReportResult =
  | { ok: true; report: CrashReportRecord | null; deduped: boolean }
  | { ok: false; error: string }

export type ReactErrorBoundarySurface = RendererErrorSurface

export type ReactErrorBoundaryReportArgs = {
  boundaryId: string
  surface: ReactErrorBoundarySurface
  errorName: string
  errorMessage: string
  errorStack?: string
  componentStack?: string
  activeView?: string
  activeModal?: string | null
  activeTabType?: string | null
  activeRightSidebarTab?: string | null
  hasActiveWorktree?: boolean
}

export type ReactErrorBoundaryReportResult =
  | { ok: true; report: CrashReportRecord | null; deduped: boolean }
  | { ok: false; error: string }

export type CrashReportSubmitArgs = {
  reportId?: string
  notes?: string
  includeDiagnosticLogs?: boolean
  submitAnonymously?: boolean
  githubLogin: string | null
  githubEmail: string | null
  chromeVersion?: string
}

export type CrashReportSubmitResult =
  | { ok: true; report: CrashReportRecord | null; diagnosticBundle?: CrashReportDiagnosticBundle }
  | {
      ok: false
      status: number | null
      error: string
      report?: CrashReportRecord | null
      diagnosticBundle?: CrashReportDiagnosticBundle
    }

export type CrashReportBreadcrumbRecordArgs = {
  name: string
  data?: CrashReportBreadcrumbData
}
