export type CrashReportCopySubmissionFailure = {
  error: string
  diagnosticContext?:
    | { status: 'uploaded'; ticketId: string }
    | { status: 'not_uploaded'; reason: string }
}

export type CrashReportCopyDiagnosticsArgs = {
  reportId?: string
  notes?: string
  submissionFailure?: CrashReportCopySubmissionFailure
}

export type CrashReportCopyDiagnosticsResult =
  | { ok: true; text: string }
  | { ok: false; error: string }
