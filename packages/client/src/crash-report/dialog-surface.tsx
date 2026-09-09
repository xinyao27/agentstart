import {
  isRecoverableRendererErrorReport,
  isReactErrorBoundaryReport
} from '@yiru/protocol/crash-reports/classification'
import type { CrashReportDiagnosticBundle } from '@yiru/protocol/crash-reports/diagnostic-bundle'
import { formatCrashReportText } from '@yiru/protocol/crash-reports/report-text'
import type { CrashReportRecord } from '@yiru/protocol/crash-reports/values'
import type { GitHubViewer } from '@yiru/protocol/hosted-review/review-types'
import { useDeferredValue, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import {
  Warning as AlertTriangle,
  Clipboard,
  PaperPlaneRight as Send
} from '~renderer/icons/hugeicons'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { getShellGitHubViewer } from '~renderer/runtime/github-shell-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { Button } from '~renderer/ui/button'
import { Checkbox } from '~renderer/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'
import { Label } from '~renderer/ui/label'
import { Textarea } from '~renderer/ui/textarea'

import { getChromeVersion } from './browser-version'
import {
  CRASH_REPORT_SUBMIT_FAILURE_TOAST_ID,
  getCrashReportCopySubmissionFailure,
  getCrashReportSubmitFailureNotice,
  getCrashReportSubmitWarningNotice
} from './submit-notice'
import { useCrashReportCopy } from './use-crash-report-copy'

function formatSummary(report: CrashReportRecord): string {
  if (isRecoverableRendererErrorReport(report)) {
    const surface = typeof report.details.surface === 'string' ? report.details.surface : null
    const errorType = isReactErrorBoundaryReport(report)
      ? translate(
          'auto.components.crash.report.CrashReportDialog.reactRenderError',
          'React render error'
        )
      : report.reason === 'terminal-error'
        ? translate(
            'auto.components.crash.report.CrashReportDialog.terminalError',
            'Terminal error'
          )
        : translate(
            'auto.components.crash.report.CrashReportDialog.rendererError',
            'Application error'
          )
    return surface ? `${errorType} · ${surface}` : errorType
  }
  return `${report.processType} ${report.reason}${
    report.exitCode === null ? '' : ` (exit ${report.exitCode})`
  }`
}

function getDialogTitle(report: CrashReportRecord | null): string {
  if (!report) {
    return translate('auto.components.crash.report.CrashReportDialog.reportCrash', 'Report a crash')
  }
  return report && isRecoverableRendererErrorReport(report)
    ? translate(
        'auto.components.crash.report.CrashReportDialog.recoverableError',
        'Yiru hit a recoverable error'
      )
    : translate(
        'auto.components.crash.report.CrashReportDialog.closedUnexpectedly',
        'Yiru closed unexpectedly'
      )
}

function getDialogDescription(report: CrashReportRecord | null): string {
  if (!report) {
    return translate(
      'auto.components.crash.report.CrashReportDialog.reportCrashDescription',
      'Send a privacy-safe crash report. Recent redacted diagnostic logs are included when available.'
    )
  }
  return report && isRecoverableRendererErrorReport(report)
    ? translate(
        'auto.components.crash.report.CrashReportDialog.recoverableErrorDescription',
        'Send a privacy-safe diagnostic report to help us understand this error.'
      )
    : translate(
        'auto.components.crash.report.CrashReportDialog.crashDescription',
        'Send a privacy-safe diagnostic report to help us understand what happened.'
      )
}

function getNotesPlaceholder(report: CrashReportRecord | null): string {
  if (!report) {
    return translate(
      'auto.components.crash.report.CrashReportDialog.reportCrashNotes',
      'Optional: what happened?'
    )
  }
  return report && isRecoverableRendererErrorReport(report)
    ? translate(
        'auto.components.crash.report.CrashReportDialog.recoverableErrorNotes',
        'Optional: what were you doing before this error?'
      )
    : translate(
        'auto.components.crash.report.CrashReportDialog.crashNotes',
        'Optional: what were you doing before Yiru closed?'
      )
}

type CrashReportDialogSurfaceProps = {
  open: boolean
  report: CrashReportRecord | null
  loading: boolean
  onOpenChange: (open: boolean) => void
  onReportChange: (report: CrashReportRecord | null) => void
}

export function CrashReportDialogSurface({
  open,
  report,
  loading,
  onOpenChange,
  onReportChange
}: CrashReportDialogSurfaceProps): React.JSX.Element {
  const mountedRef = useMountedRef()
  const [notes, setNotes] = useState('')
  // Why: per-open default. The surface fully unmounts whenever the dialog closes
  // (see CrashReportDialog's `if (!open) return null`), so this initializer already
  // resets the checkbox on every genuine open without an imperative effect.
  const [includeDiagnosticLogs, setIncludeDiagnosticLogs] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [viewer, setViewer] = useState<GitHubViewer | null>(null)
  const deferredNotes = useDeferredValue(notes)
  const diagnosticText = (() => (report ? formatCrashReportText(report, deferredNotes) : ''))()
  const copyCrashReportDetails = useCrashReportCopy(report, notes)

  useEffect(() => {
    if (!open) {
      return
    }
    void getShellGitHubViewer()
      .then((nextViewer) => {
        if (mountedRef.current) {
          setViewer(nextViewer)
        }
      })
      .catch((error) => {
        if (mountedRef.current) {
          setViewer(null)
          console.error('Failed to load GitHub viewer for crash report:', error)
        }
      })
  }, [mountedRef, open])

  const showSubmitFailure = (
    error: unknown,
    diagnosticBundle?: CrashReportDiagnosticBundle
  ): void => {
    const failure = { error, ...(diagnosticBundle ? { diagnosticBundle } : {}) }
    const notice = getCrashReportSubmitFailureNotice(failure, includeDiagnosticLogs)
    const copyFailure = getCrashReportCopySubmissionFailure(failure)
    toast.error(notice.title, {
      id: CRASH_REPORT_SUBMIT_FAILURE_TOAST_ID,
      description: notice.description,
      duration: Infinity,
      dismissible: true,
      action: {
        label: notice.actionLabel,
        onClick: () => {
          void copyCrashReportDetails(copyFailure)
        }
      }
    })
  }

  const dismissReportIfNeeded = async (): Promise<void> => {
    if (report?.status === 'pending') {
      await shellClient.crashReports.dismiss({ reportId: report.id })
      if (mountedRef.current) {
        onReportChange({ ...report, status: 'dismissed' })
      }
    }
  }

  const handleDismiss = async (): Promise<void> => {
    await dismissReportIfNeeded()
    if (mountedRef.current) {
      onOpenChange(false)
    }
  }

  const handleSubmit = async (): Promise<void> => {
    setSubmitting(true)
    try {
      const chromeVersion = getChromeVersion()
      const result = await shellClient.crashReports.submit({
        ...(report ? { reportId: report.id } : {}),
        notes,
        includeDiagnosticLogs,
        // Why: crash reporting must degrade to anonymous if gh is unavailable;
        // identity lookup is best-effort and never blocks report creation.
        submitAnonymously: !viewer,
        githubLogin: viewer?.login ?? null,
        githubEmail: null,
        ...(chromeVersion ? { chromeVersion } : {})
      })
      if (!result.ok) {
        showSubmitFailure(result.error, result.diagnosticBundle)
        console.error('Failed to submit crash report:', result.error)
        return
      }
      if (!mountedRef.current) {
        return
      }
      onReportChange(result.report)
      setNotes('')
      toast.dismiss(CRASH_REPORT_SUBMIT_FAILURE_TOAST_ID)
      const warningNotice = getCrashReportSubmitWarningNotice(result, includeDiagnosticLogs)
      if (warningNotice) {
        toast.warning(warningNotice.title, { description: warningNotice.description })
      } else {
        toast.success(
          translate(
            'auto.components.crash.report.CrashReportDialog.8e24fe4f75',
            'Crash report sent.'
          )
        )
      }
      onOpenChange(false)
    } catch (error) {
      showSubmitFailure(error)
      console.error('Failed to submit crash report:', error)
    } finally {
      if (mountedRef.current) {
        setSubmitting(false)
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (submitting && !nextOpen) {
          return
        }
        if (!nextOpen) {
          void dismissReportIfNeeded().finally(() => {
            if (mountedRef.current) {
              onOpenChange(false)
            }
          })
          return
        }
        onOpenChange(true)
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="text-destructive size-4" />
            {getDialogTitle(report)}
          </DialogTitle>
          <DialogDescription className="text-xs">{getDialogDescription(report)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {report ? (
            <>
              <div className="border-border/70 bg-muted/30 border p-3 text-xs">
                <div className="text-foreground font-medium">{formatSummary(report)}</div>
                <div className="text-muted-foreground mt-1">
                  {new Date(report.createdAt).toLocaleString()} · {report.platform} {report.arch} ·
                  {translate('auto.components.crash.report.CrashReportDialog.835037edc9', 'Yiru')}{' '}
                  {report.appVersion}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="text-muted-foreground text-[11px] font-medium">
                  {translate(
                    'auto.components.crash.report.CrashReportDialog.6d3ebe216a',
                    'Diagnostic text'
                  )}
                </div>
                <pre className="border-border bg-muted/20 text-muted-foreground scrollbar-sleek max-h-44 overflow-auto border p-3 font-mono text-[11px] leading-5 break-words whitespace-pre-wrap">
                  {diagnosticText}
                </pre>
              </div>
            </>
          ) : (
            <div className="border-border/70 bg-muted/30 text-muted-foreground border p-3 text-xs">
              {loading
                ? translate(
                    'auto.components.crash.report.CrashReportDialog.765591798d',
                    'Checking for crash reports...'
                  )
                : translate(
                    'auto.components.crash.report.CrashReportDialog.ead6fc0510',
                    'No automatic crash report was captured. You can still send details and include recent diagnostic logs when available.'
                  )}
            </div>
          )}
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            placeholder={getNotesPlaceholder(report)}
            className="border-border bg-background placeholder:text-muted-foreground min-h-24 w-full border px-3 py-2 text-sm outline-none"
          />
          <div className="border-border/70 bg-muted/20 flex items-start gap-2 border p-3">
            <Checkbox
              id="crash-report-attach-diagnostics"
              checked={includeDiagnosticLogs}
              onCheckedChange={(checked) => setIncludeDiagnosticLogs(checked === true)}
              disabled={submitting}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="crash-report-attach-diagnostics" className="text-xs">
                {translate(
                  'auto.components.crash.report.CrashReportDialog.b082f27490',
                  'Attach recent diagnostic logs'
                )}
              </Label>
              <div className="text-muted-foreground text-xs leading-5">
                {translate(
                  'auto.components.crash.report.CrashReportDialog.e59f0b9427',
                  'Sends a capped redacted log bundle with the report.'
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copyCrashReportDetails()}
            disabled={loading}
          >
            <Clipboard className="size-3.5" />
            {translate('auto.components.crash.report.CrashReportDialog.50b00dc327', 'Copy Details')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDismiss}
            disabled={submitting}
          >
            {translate('auto.components.crash.report.CrashReportDialog.88fea8e84e', "Don't Send")}
          </Button>
          <Button type="button" size="sm" onClick={handleSubmit} disabled={loading || submitting}>
            <Send className="size-3.5" />
            {translate('auto.components.crash.report.CrashReportDialog.b4951cd27c', 'Send Report')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
