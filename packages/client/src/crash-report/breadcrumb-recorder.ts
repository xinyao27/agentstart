import type { CrashReportBreadcrumbData } from '@agentstart/protocol/crash-reports/values'
import { recordRendererCrashReportBreadcrumb } from '~renderer/runtime/crash-report-client'

// Why a leaf module: terminal hot paths record breadcrumbs without loading
// crash-diagnostics.ts and its webview-registry import chain.

/** Best-effort breadcrumb recording; must never create or mask failures. */
export function recordRendererCrashBreadcrumb(
  name: string,
  data?: CrashReportBreadcrumbData
): void {
  recordRendererCrashReportBreadcrumb(name, data)
}
