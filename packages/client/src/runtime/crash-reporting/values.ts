import {
  CrashReportSource,
  CrashReportStatus,
  RendererErrorReportKind,
  RendererErrorSurface,
  type CrashReport,
  type CrashReportDetails,
  type CrashReportDiagnosticBundle
} from '@yiru/protocol/crash-reports'
import type { CrashReportDiagnosticBundle as ReportDiagnosticBundle } from '@yiru/protocol/crash-reports/diagnostic-bundle'
import type { RendererErrorReportArgs } from '@yiru/protocol/crash-reports/renderer-error'
import type {
  CrashReportRecord,
  CrashReportBreadcrumbData
} from '@yiru/protocol/crash-reports/values'
import { translate } from '~renderer/i18n/i18n'

export function crashReport(value: CrashReport | undefined): CrashReportRecord | null {
  if (!value) {
    return null
  }
  return {
    id: value.id,
    createdAt: value.createdAt,
    status: reportStatus(value.status),
    source: reportSource(value.source),
    processType: value.processType,
    reason: value.reason,
    exitCode: value.exitCode === undefined ? null : safeInteger(value.exitCode),
    appVersion: value.appVersion,
    platform: reportPlatform(value.platform),
    osRelease: value.osRelease,
    arch: value.arch,
    chromeVersion: value.chromeVersion,
    details: detailValues(value.details),
    breadcrumbs: value.breadcrumbs.map((item) => ({
      createdAt: item.createdAt,
      name: item.name,
      ...(item.data ? { data: detailValues(item.data) } : {})
    }))
  }
}

function safeInteger(value: bigint): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result)) {
    throw new Error(
      translate(
        'runtime.crash.report.integer.exceeds.safe.range',
        'Crash report integer exceeds safe range'
      )
    )
  }
  return result
}

function reportStatus(value: CrashReportStatus): CrashReportRecord['status'] {
  switch (value) {
    case CrashReportStatus.PENDING:
      return 'pending'
    case CrashReportStatus.SENT:
      return 'sent'
    case CrashReportStatus.DISMISSED:
      return 'dismissed'
    case CrashReportStatus.UNSPECIFIED:
      throw new Error(
        translate('runtime.crash.report.status.is.missing', 'Crash report status is missing')
      )
  }
  throw new Error(
    translate('runtime.crash.report.status.is.unknown', 'Crash report status is unknown')
  )
}

function reportSource(value: CrashReportSource): CrashReportRecord['source'] {
  switch (value) {
    case CrashReportSource.RENDERER:
      return 'renderer'
    case CrashReportSource.CHILD:
      return 'child'
    case CrashReportSource.UNSPECIFIED:
      throw new Error(
        translate('runtime.crash.report.source.is.missing', 'Crash report source is missing')
      )
  }
  throw new Error(
    translate('runtime.crash.report.source.is.unknown', 'Crash report source is unknown')
  )
}

function reportPlatform(value: string): CrashReportRecord['platform'] {
  switch (value) {
    case 'aix':
    case 'android':
    case 'darwin':
    case 'freebsd':
    case 'haiku':
    case 'linux':
    case 'openbsd':
    case 'sunos':
    case 'win32':
    case 'cygwin':
    case 'netbsd':
      return value
  }
  throw new Error(
    translate('runtime.crash.report.platform.is.unknown', 'Crash report platform is unknown')
  )
}

function detailValues(value: CrashReportDetails | undefined): CrashReportBreadcrumbData {
  return Object.fromEntries(
    Object.entries(value?.entries ?? {}).map(([key, item]) => {
      switch (item.kind.case) {
        case 'stringValue':
        case 'numberValue':
        case 'boolValue':
          return [key, item.kind.value]
        case 'nullValue':
          return [key, null]
        case undefined:
          throw new Error(
            translate(
              'runtime.crash.report.detail.value.is.missing',
              'Crash report detail value is missing'
            )
          )
      }
    })
  )
}

export function crashReportDetails(value: CrashReportBreadcrumbData | undefined) {
  if (value === undefined) {
    return undefined
  }
  return {
    entries: Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (item === null) {
          return [key, { kind: { case: 'nullValue' as const, value: {} } }]
        }
        switch (typeof item) {
          case 'string':
            return [key, { kind: { case: 'stringValue' as const, value: item } }]
          case 'boolean':
            return [key, { kind: { case: 'boolValue' as const, value: item } }]
          case 'number':
            return [key, { kind: { case: 'numberValue' as const, value: item } }]
        }
      })
    )
  }
}

export function diagnosticBundle(
  value: CrashReportDiagnosticBundle | undefined
): ReportDiagnosticBundle | undefined {
  if (!value) {
    return undefined
  }
  switch (value.status.case) {
    case 'attached':
      return {
        status: 'attached',
        bundleSubmissionId: value.status.value.bundleSubmissionId,
        spanCount: value.status.value.spanCount,
        bytes: safeInteger(value.status.value.bytes)
      }
    case 'notUploaded':
      return {
        status: 'not_uploaded',
        reason: value.status.value.reason,
        bundleSubmissionId: value.status.value.bundleSubmissionId,
        bytes:
          value.status.value.bytes === undefined
            ? undefined
            : safeInteger(value.status.value.bytes),
        spanCount: value.status.value.spanCount
      }
    case undefined:
      throw new Error(
        translate(
          'runtime.crash.report.diagnostic.bundle.status.is.missing',
          'Crash report diagnostic bundle status is missing'
        )
      )
  }
}

export function rendererErrorInput(input: RendererErrorReportArgs) {
  return {
    ...input,
    kind: reportKinds[input.kind],
    surface: reportSurfaces[input.surface],
    activeModal: nullableString(input.activeModal),
    activeTabType: nullableString(input.activeTabType),
    activeRightSidebarTab: nullableString(input.activeRightSidebarTab)
  }
}

function nullableString(value: string | null | undefined) {
  if (value === undefined) {
    return undefined
  }
  return value === null
    ? { value: { case: 'null' as const, value: true } }
    : { value: { case: 'text' as const, value } }
}

const reportKinds = {
  'react-error-boundary': RendererErrorReportKind.REACT_ERROR_BOUNDARY,
  'renderer-unhandled-error': RendererErrorReportKind.RENDERER_UNHANDLED_ERROR,
  'terminal-error': RendererErrorReportKind.TERMINAL_ERROR
} satisfies Record<RendererErrorReportArgs['kind'], RendererErrorReportKind>
const reportSurfaces = {
  'app-root': RendererErrorSurface.APP_ROOT,
  'web-root': RendererErrorSurface.WEB_ROOT,
  'workspace-shell': RendererErrorSurface.WORKSPACE_SHELL,
  sidebar: RendererErrorSurface.SIDEBAR,
  'terminal-workbench': RendererErrorSurface.TERMINAL_WORKBENCH,
  'right-sidebar': RendererErrorSurface.RIGHT_SIDEBAR,
  page: RendererErrorSurface.PAGE,
  modal: RendererErrorSurface.MODAL,
  overlay: RendererErrorSurface.OVERLAY,
  'rich-markdown-editor': RendererErrorSurface.RICH_MARKDOWN_EDITOR
} satisfies Record<RendererErrorReportArgs['surface'], RendererErrorSurface>
