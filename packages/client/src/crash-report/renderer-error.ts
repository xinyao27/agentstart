import type {
  RendererErrorReportArgs,
  RendererErrorReportKind,
  RendererErrorSurface
} from '@agentstart/protocol/crash-reports/renderer-error'
import type { CrashReportRecord } from '@agentstart/protocol/crash-reports/values'

import { getChromeVersion } from './browser-version'

type RendererErrorContext = Pick<
  RendererErrorReportArgs,
  'activeView' | 'activeModal' | 'activeTabType' | 'activeRightSidebarTab' | 'hasActiveWorktree'
>

type ReportRendererErrorInput = {
  kind: RendererErrorReportKind
  originId: string
  surface: RendererErrorSurface
  error: unknown
  componentStack?: string
}

const reportedRendererErrorKeys: string[] = []
const reportedRendererErrorKeySet = new Set<string>()
const MAX_REPORTED_RENDERER_ERROR_KEYS = 50
let pendingRendererErrorReport: CrashReportRecord | null = null

export const RENDERER_ERROR_REPORT_AVAILABLE_EVENT = 'agentstart:renderer-error-report-available'

function stringFromThrown(value: unknown): { name: string; message: string; stack?: string } {
  if (value instanceof Error) {
    return {
      name: value.name || 'Error',
      message: value.message || String(value),
      ...(value.stack ? { stack: value.stack } : {})
    }
  }

  return {
    name: 'NonErrorThrown',
    message: String(value)
  }
}

async function collectRendererErrorContext(): Promise<RendererErrorContext> {
  try {
    const { useAppStore } = await import('~renderer/store/state')
    const state = useAppStore.getState()
    return {
      activeView: state.activeView,
      activeModal: state.activeModal,
      activeTabType: state.activeTabType,
      activeRightSidebarTab: state.rightSidebarTab,
      hasActiveWorktree: state.activeWorktreeId !== null
    }
  } catch {
    return {}
  }
}

function rememberRendererErrorKey(key: string): boolean {
  if (reportedRendererErrorKeySet.has(key)) {
    return false
  }
  reportedRendererErrorKeySet.add(key)
  reportedRendererErrorKeys.push(key)
  if (reportedRendererErrorKeys.length > MAX_REPORTED_RENDERER_ERROR_KEYS) {
    const expiredKey = reportedRendererErrorKeys.shift()
    if (expiredKey) {
      reportedRendererErrorKeySet.delete(expiredKey)
    }
  }
  return true
}

function getRendererErrorKey(args: RendererErrorReportArgs): string {
  return JSON.stringify({
    kind: args.kind,
    originId: args.originId,
    surface: args.surface,
    errorName: args.errorName,
    errorMessage: args.errorMessage,
    componentStack: args.componentStack
  })
}

function notifyRendererErrorReportAvailable(report: CrashReportRecord): void {
  pendingRendererErrorReport = report
  window.dispatchEvent(new CustomEvent(RENDERER_ERROR_REPORT_AVAILABLE_EVENT))
}

export function takePendingRendererErrorReport(): CrashReportRecord | null {
  const report = pendingRendererErrorReport
  pendingRendererErrorReport = null
  return report
}

export async function reportRendererErrorCrash(input: ReportRendererErrorInput): Promise<void> {
  const context = await collectRendererErrorContext()
  const chromeVersion = getChromeVersion()
  const fields = stringFromThrown(input.error)
  const componentStack = input.componentStack?.trim()
  const args: RendererErrorReportArgs = {
    kind: input.kind,
    originId: input.originId,
    surface: input.surface,
    errorName: fields.name,
    errorMessage: fields.message,
    ...(fields.stack ? { errorStack: fields.stack } : {}),
    ...(componentStack ? { componentStack } : {}),
    ...(context.activeView ? { activeView: context.activeView } : {}),
    ...(context.activeModal !== undefined ? { activeModal: context.activeModal } : {}),
    ...(context.activeTabType ? { activeTabType: context.activeTabType } : {}),
    ...(context.activeRightSidebarTab
      ? { activeRightSidebarTab: context.activeRightSidebarTab }
      : {}),
    ...(context.hasActiveWorktree !== undefined
      ? { hasActiveWorktree: context.hasActiveWorktree }
      : {}),
    ...(chromeVersion ? { chromeVersion } : {})
  }
  if (!rememberRendererErrorKey(getRendererErrorKey(args))) {
    return
  }

  try {
    // Why: the Web root loads error boundaries before it installs the paired
    // shell. Importing only when reporting preserves that startup ordering.
    const { shellClient } = await import('~renderer/runtime/shell-client')
    const result = await shellClient?.crashReports?.recordRendererError?.(args)
    if (result && !result.ok) {
      console.warn('[renderer-error] Failed to record renderer crash:', result.error)
      return
    }
    if (result?.ok && result.report && !result.deduped) {
      notifyRendererErrorReportAvailable(result.report)
    }
  } catch (error) {
    console.warn('[renderer-error] Crash reporting IPC failed:', error)
  }
}
