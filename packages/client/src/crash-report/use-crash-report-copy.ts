import type { CrashReportCopySubmissionFailure } from '@yiru/protocol/crash-reports/copy-values'
import type { CrashReportRecord } from '@yiru/protocol/crash-reports/values'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { shellClient } from '~renderer/runtime/shell-client'

export const CRASH_REPORT_COPY_FAILURE_TOAST_ID = 'crash-report-copy-failure'

function showCopyFailure(description?: string): void {
  toast.error(
    translate(
      'auto.components.crash.report.copy.copyFailed',
      'Crash report details could not be copied.'
    ),
    {
      id: CRASH_REPORT_COPY_FAILURE_TOAST_ID,
      ...(description ? { description } : {}),
      duration: Infinity,
      dismissible: true
    }
  )
}

export function useCrashReportCopy(
  report: CrashReportRecord | null,
  notes: string
): (submissionFailure?: CrashReportCopySubmissionFailure) => Promise<void> {
  // Why: a submission toast can outlive the render that created it while the
  // user edits or changes reports; the event callback always sees the latest pair.
  return useEventCallback(async (submissionFailure?: CrashReportCopySubmissionFailure) => {
    try {
      const result = await shellClient.crashReports.copyLatestDiagnostics({
        ...(report ? { reportId: report.id } : {}),
        notes,
        ...(submissionFailure ? { submissionFailure } : {})
      })
      if (!result.ok) {
        showCopyFailure(result.error)
        return
      }
      await shellClient.ui.writeClipboardText(result.text)
      toast.dismiss(CRASH_REPORT_COPY_FAILURE_TOAST_ID)
      toast.success(
        translate(
          'auto.components.crash.report.CrashReportDialog.8b8473c544',
          'Crash report copied.'
        )
      )
    } catch (error) {
      console.error('Failed to copy crash report details:', error)
      // Why: Sonner closes an action toast when clicked, so a sticky generic
      // replacement keeps the failure actionable without exposing raw IPC detail.
      showCopyFailure()
    }
  })
}
