export type CrashReportDiagnosticBundle =
  | {
      status: 'attached'
      bundleSubmissionId: string
      bytes: number
      spanCount: number
    }
  | {
      status: 'uploaded'
      ticketId: string
      bundleSubmissionId: string
      bytes: number
      spanCount: number
    }
  | {
      status: 'not_uploaded'
      reason: string
      bundleSubmissionId?: string
      bytes?: number
      spanCount?: number
    }
