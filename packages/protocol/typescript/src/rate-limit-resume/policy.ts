import type { RateLimitResumeStatus } from '../rate-limit-resume-values'

// Why: provider windows can roll late, so automatic replay waits beyond the reset boundary.
export function isFinalRateLimitResumeStatus(status: RateLimitResumeStatus): boolean {
  return status === 'fired' || status === 'cancelled' || status === 'stale' || status === 'failed'
}

export function buildRateLimitResumeAt(resetsAt: number, now: number): number {
  return Math.max(now, resetsAt) + RATE_LIMIT_RESUME_GRACE_MS
}

export const RATE_LIMIT_RESUME_GRACE_MS = 30_000

export const RATE_LIMIT_RESUME_HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000
