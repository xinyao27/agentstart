import type { CrashReportBreadcrumbData } from '@agentstart/protocol/crash-reports/values'

import { shellClient } from './shell-client'

/** Best-effort crash evidence recording; must never create or mask failures. */
export function recordRendererCrashReportBreadcrumb(
  name: string,
  data?: CrashReportBreadcrumbData
): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    shellClient.crashReports.recordBreadcrumb({ name, ...(data ? { data } : {}) })
  } catch {
    // Why: crash evidence is diagnostic only and can race renderer teardown.
  }
}
