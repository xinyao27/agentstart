import type { DiagnosticsBundle, DiagnosticsStatus, DiagnosticsUploadResult } from '@yiru/protocol'
import { SHELL_TELEMETRY_PROTOCOL_CAPABILITY, ShellTelemetryClient } from '@yiru/protocol'
import { CrashReportsClient } from '@yiru/protocol/crash-reports'
import type {
  CrashReportCopyDiagnosticsArgs,
  CrashReportCopyDiagnosticsResult
} from '@yiru/protocol/crash-reports/copy-values'
import type { RendererErrorReportArgs } from '@yiru/protocol/crash-reports/renderer-error'
import type {
  CrashReportBreadcrumbData,
  CrashReportRecord,
  CrashReportSubmitArgs,
  CrashReportSubmitResult,
  RendererErrorReportResult
} from '@yiru/protocol/crash-reports/values'
import { FeedbackClient } from '@yiru/protocol/feedback'
import type { FeedbackSubmitArgs, FeedbackSubmitResult } from '@yiru/protocol/feedback/values'
import type { TelemetryConsentState } from '@yiru/protocol/telemetry/consent'
import { translate } from '~renderer/i18n/i18n'

import { openConfiguredBrowserHostProtocol } from './browser-host-runtime'
import {
  crashReport,
  crashReportDetails,
  diagnosticBundle,
  rendererErrorInput
} from './crash-reporting/values'
import { openDiagnosticsTarget } from './diagnostics-target'
import { openRuntimeProtocolTarget } from './protocol-target'
import { readRuntimeStatus } from './status-client'

export type ShellFeedbackApi = {
  submit: (args: FeedbackSubmitArgs) => Promise<FeedbackSubmitResult>
}

export type ShellCrashReportsApi = {
  getLatestPending: () => Promise<CrashReportRecord | null>
  getLatestReport: () => Promise<CrashReportRecord | null>
  dismiss: (args: { reportId: string }) => Promise<CrashReportRecord | null>
  recordRendererError: (args: RendererErrorReportArgs) => Promise<RendererErrorReportResult>
  recordBreadcrumb: (args: { name: string; data?: CrashReportBreadcrumbData }) => void
  submit: (args: CrashReportSubmitArgs) => Promise<CrashReportSubmitResult>
  copyLatestDiagnostics: (
    args?: CrashReportCopyDiagnosticsArgs
  ) => Promise<CrashReportCopyDiagnosticsResult>
}

export type ShellDiagnosticsApi = {
  getStatus: () => Promise<DiagnosticsStatus>
  collectBundle: (lookbackMinutes?: number) => Promise<DiagnosticsBundle>
  openBundlePreview: (bundleSubmissionId: string) => Promise<void>
  discardBundlePreview: (bundleSubmissionId: string) => Promise<void>
  uploadBundle: (bundleSubmissionId: string) => Promise<DiagnosticsUploadResult>
}

export type ShellTelemetryApi = {
  track: (name: string, props: Record<string, unknown>) => Promise<void>
  setOptIn: (optedIn: boolean) => Promise<void>
  getConsentState: () => Promise<TelemetryConsentState>
  acknowledgeBanner: () => Promise<void>
}

function restoreShellDocument<T>(value: unknown): T {
  return value as T
}

// Why: shell.telemetry is LOCAL-only by contract, so its client anchors to the
// fixed local rendering shell, never the active environment.
async function requireShellTelemetryClient(): Promise<ShellTelemetryClient> {
  const target = { kind: 'local' } as const
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(SHELL_TELEMETRY_PROTOCOL_CAPABILITY)) {
    throw new Error(
      translate(
        'runtime.shell.telemetry.protobuf.v1.capability.is.not.available',
        'shell.telemetry.protobuf.v1 capability is not available'
      )
    )
  }
  return new ShellTelemetryClient(await openRuntimeProtocolTarget(target))
}

export const shellFeedbackApi: ShellFeedbackApi = {
  submit: async (input) => {
    const response = await new FeedbackClient(await openConfiguredBrowserHostProtocol()).submit({
      ...input,
      githubLogin: input.githubLogin ?? undefined,
      githubEmail: input.githubEmail ?? undefined
    })
    return response.ok
      ? { ok: true }
      : {
          ok: false,
          status: response.status ?? null,
          error:
            response.error ??
            translate('runtime.feedback.submitFailed', 'Feedback submission failed')
        }
  }
}

async function crashReportsClient(): Promise<CrashReportsClient> {
  return new CrashReportsClient(await openConfiguredBrowserHostProtocol())
}

export const shellCrashReportsApi: ShellCrashReportsApi = {
  getLatestPending: async () =>
    crashReport((await (await crashReportsClient()).getLatestPending()).report),
  getLatestReport: async () =>
    crashReport((await (await crashReportsClient()).getLatestReport()).report),
  dismiss: async (input) => crashReport((await (await crashReportsClient()).dismiss(input)).report),
  recordRendererError: async (input) => {
    const { result } = await (
      await crashReportsClient()
    ).recordRendererError(rendererErrorInput(input))
    switch (result.case) {
      case 'success':
        return { ok: true, report: crashReport(result.value.report), deduped: result.value.deduped }
      case 'error':
        return { ok: false, error: result.value }
      case undefined:
        throw new Error(
          translate(
            'runtime.renderer.error.response.is.missing.its.result',
            'Renderer error response is missing its result'
          )
        )
    }
  },
  recordBreadcrumb: (input) => {
    void crashReportsClient()
      .then((client) =>
        client.recordBreadcrumb({ name: input.name, data: crashReportDetails(input.data) })
      )
      .catch((error: unknown) =>
        console.warn('[crash-reporting] Failed to record breadcrumb:', error)
      )
  },
  submit: async (input) => {
    const { result } = await (
      await crashReportsClient()
    ).submit(
      {
        ...input,
        githubLogin: input.githubLogin ?? undefined,
        githubEmail: input.githubEmail ?? undefined
      },
      { timeoutMs: 60_000 }
    )
    switch (result.case) {
      case 'success':
        return {
          ok: true,
          report: crashReport(result.value.report),
          diagnosticBundle: diagnosticBundle(result.value.diagnosticBundle)
        }
      case 'failure':
        return {
          ok: false,
          error: result.value.error,
          status: result.value.status ?? null,
          report: crashReport(result.value.report),
          diagnosticBundle: diagnosticBundle(result.value.diagnosticBundle)
        }
      case undefined:
        throw new Error(
          translate(
            'runtime.crash.submission.response.is.missing.its.result',
            'Crash submission response is missing its result'
          )
        )
    }
  },
  copyLatestDiagnostics: async (input) => {
    const context = input?.submissionFailure?.diagnosticContext
    const { result } = await (
      await crashReportsClient()
    ).copyLatestDiagnostics({
      reportId: input?.reportId,
      notes: input?.notes,
      submissionFailure: input?.submissionFailure
        ? {
            error: input.submissionFailure.error,
            diagnosticContext:
              context?.status === 'uploaded'
                ? { case: 'uploaded', value: { ticketId: context.ticketId } }
                : context?.status === 'not_uploaded'
                  ? { case: 'notUploaded', value: { reason: context.reason } }
                  : undefined
          }
        : undefined
    })
    switch (result.case) {
      case 'text':
        return { ok: true, text: result.value }
      case 'error':
        return { ok: false, error: result.value }
      case undefined:
        throw new Error(
          translate(
            'runtime.crash.diagnostic.response.is.missing.its.result',
            'Crash diagnostic response is missing its result'
          )
        )
    }
  }
}

export const shellDiagnosticsApi: ShellDiagnosticsApi = {
  getStatus: async () => (await openDiagnosticsTarget()).getStatus({ timeoutMs: 12_000 }),
  collectBundle: async (lookbackMinutes) =>
    (await openDiagnosticsTarget()).collectBundle(lookbackMinutes, { timeoutMs: 30_000 }),
  openBundlePreview: async (bundleSubmissionId) =>
    (await openDiagnosticsTarget()).openBundlePreview(bundleSubmissionId, { timeoutMs: 12_000 }),
  discardBundlePreview: async (bundleSubmissionId) =>
    (await openDiagnosticsTarget()).discardBundlePreview(bundleSubmissionId, { timeoutMs: 12_000 }),
  uploadBundle: async (bundleSubmissionId) =>
    (await openDiagnosticsTarget()).uploadBundle(bundleSubmissionId, { timeoutMs: 15_000 })
}

export const shellTelemetryApi: ShellTelemetryApi = {
  track: async (name, props) => {
    await (await requireShellTelemetryClient()).track(name, props)
  },
  setOptIn: async (optedIn) => {
    await (await requireShellTelemetryClient()).setOptIn(optedIn)
  },
  getConsentState: async () =>
    restoreShellDocument<TelemetryConsentState>(
      await (await requireShellTelemetryClient()).getConsentState()
    ),
  acknowledgeBanner: async () => {
    await (await requireShellTelemetryClient()).acknowledgeBanner()
  }
}
