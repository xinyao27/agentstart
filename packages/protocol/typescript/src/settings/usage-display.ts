export type StatusBarUsageMode = 'verbose' | 'compact'
export type UsagePercentageDisplay = 'used' | 'remaining'

// Why: missing settings preserve the consumption-meter behavior introduced in #8167.
export const DEFAULT_USAGE_PERCENTAGE_DISPLAY: UsagePercentageDisplay = 'used'

export function normalizeUsagePercentageDisplay(value: unknown): UsagePercentageDisplay {
  return value === 'used' || value === 'remaining' ? value : DEFAULT_USAGE_PERCENTAGE_DISPLAY
}

export const DEFAULT_STATUS_BAR_USAGE_MODE: StatusBarUsageMode = 'verbose'

export function normalizeStatusBarUsageMode(value: unknown): StatusBarUsageMode {
  return value === 'verbose' || value === 'compact' ? value : DEFAULT_STATUS_BAR_USAGE_MODE
}

// Why: only upgraded profiles still using the changed default need this one-time notice.
export function resolveUsagePercentageDisplayChangeNoticeDismissed(args: {
  rawDismissed: unknown
  rawUsagePercentageDisplay: unknown
  isExistingProfile: boolean
}): boolean {
  if (args.rawDismissed === true) {
    return true
  }
  if (!args.isExistingProfile) {
    return true
  }
  // Why: choosing remaining is the discovery path; re-teaching the default flip
  // would only interrupt someone who already adapted.
  if (args.rawUsagePercentageDisplay === 'remaining') {
    return true
  }
  return false
}
