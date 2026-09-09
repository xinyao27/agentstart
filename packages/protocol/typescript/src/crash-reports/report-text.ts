import type { CrashReportDiagnosticBundle } from './diagnostic-bundle'
import { sanitizeCrashReportString } from './redaction'
import type { CrashReportRecord, UncapturedCrashReportContext } from './values'

const MAX_FORMATTED_REPORT_LENGTH = 64_000
const FORMATTED_REPORT_TRUNCATION_SUFFIX =
  '\n\n[Crash report truncated to fit feedback endpoint limits.]'
export function formatCrashReportText(
  report: CrashReportRecord,
  notes?: string,
  diagnosticBundle?: CrashReportDiagnosticBundle
): string {
  const lines = [
    '[Crash Report]',
    '',
    `Report ID: ${report.id}`,
    `Created: ${report.createdAt}`,
    `Status: ${report.status}`,
    `Source: ${report.source}`,
    `Process: ${report.processType}`,
    `Reason: ${report.reason}`,
    `Exit code: ${report.exitCode ?? 'unknown'}`,
    `App version: ${report.appVersion}`,
    `Platform: ${report.platform} ${report.osRelease} ${report.arch}`,
    `Chrome: ${report.chromeVersion}`
  ]

  appendDiagnosticBundleLines(lines, diagnosticBundle, sanitizeCrashReportString)

  const details = Object.entries(report.details)
  if (details.length > 0) {
    lines.push('', 'Details:')
    for (const [key, value] of details) {
      lines.push(`- ${key}: ${String(value)}`)
    }
  }

  if (report.breadcrumbs && report.breadcrumbs.length > 0) {
    lines.push('', 'Recent activity:')
    for (const breadcrumb of report.breadcrumbs) {
      const data = breadcrumb.data ? Object.entries(breadcrumb.data) : []
      const suffix =
        data.length > 0
          ? ` (${data.map(([key, value]) => `${key}=${String(value)}`).join(', ')})`
          : ''
      lines.push(`- ${breadcrumb.createdAt}: ${breadcrumb.name}${suffix}`)
    }
  }

  const trimmedNotes = notes?.trim()
  if (trimmedNotes) {
    lines.push('', 'User notes:', sanitizeCrashReportString(trimmedNotes))
  }

  return truncateFormattedCrashReport(lines.join('\n'))
}

export function formatUncapturedCrashReportText(
  context: UncapturedCrashReportContext,
  notes?: string,
  diagnosticBundle?: CrashReportDiagnosticBundle
): string {
  const lines = [
    '[Crash Report]',
    '',
    'Report ID: not captured',
    `Created: ${context.createdAt}`,
    'Status: uncaptured',
    'Source: user-reported',
    'Process: unknown',
    'Reason: no captured crash report',
    'Exit code: unknown',
    `App version: ${context.appVersion}`,
    `Platform: ${context.platform} ${context.osRelease} ${context.arch}`,
    `Chrome: ${context.chromeVersion}`,
    '',
    'Details:',
    '- captured_crash_report: false',
    '- report_source: help_menu'
  ]

  appendDiagnosticBundleLines(lines, diagnosticBundle, sanitizeCrashReportString)

  const trimmedNotes = notes?.trim()
  if (trimmedNotes) {
    lines.push('', 'User notes:', sanitizeCrashReportString(trimmedNotes))
  }

  return truncateFormattedCrashReport(lines.join('\n'))
}

function truncateFormattedCrashReport(text: string): string {
  if (text.length <= MAX_FORMATTED_REPORT_LENGTH) {
    return text
  }
  // Why: the feedback endpoint accepts larger crash bodies and handles
  // Slack-specific attachments server-side. Keep local reports below that API cap.
  const budget = MAX_FORMATTED_REPORT_LENGTH - FORMATTED_REPORT_TRUNCATION_SUFFIX.length
  return `${text.slice(0, Math.max(0, budget)).trimEnd()}${FORMATTED_REPORT_TRUNCATION_SUFFIX}`
}

function appendDiagnosticBundleLines(
  lines: string[],
  diagnosticBundle: CrashReportDiagnosticBundle | undefined,
  sanitizeString: (value: string) => string
): void {
  if (!diagnosticBundle) {
    return
  }
  lines.push('', 'Diagnostic log:')
  if (diagnosticBundle.status === 'attached') {
    lines.push(
      '- Status: attached',
      `- Bundle submission ID: ${sanitizeString(diagnosticBundle.bundleSubmissionId)}`,
      `- Spans: ${diagnosticBundle.spanCount}`,
      `- Bytes: ${diagnosticBundle.bytes}`
    )
    return
  }
  if (diagnosticBundle.status === 'uploaded') {
    lines.push(
      '- Status: uploaded',
      `- Ticket ID: ${sanitizeString(diagnosticBundle.ticketId)}`,
      `- Bundle submission ID: ${sanitizeString(diagnosticBundle.bundleSubmissionId)}`,
      `- Spans: ${diagnosticBundle.spanCount}`,
      `- Bytes: ${diagnosticBundle.bytes}`
    )
    return
  }
  lines.push('- Status: not uploaded', `- Reason: ${sanitizeString(diagnosticBundle.reason)}`)
  if (diagnosticBundle.bundleSubmissionId) {
    lines.push(`- Bundle submission ID: ${sanitizeString(diagnosticBundle.bundleSubmissionId)}`)
  }
  if (typeof diagnosticBundle.spanCount === 'number') {
    lines.push(`- Spans: ${diagnosticBundle.spanCount}`)
  }
  if (typeof diagnosticBundle.bytes === 'number') {
    lines.push(`- Bytes: ${diagnosticBundle.bytes}`)
  }
}
