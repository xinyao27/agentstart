import type { RateLimitHit, RateLimitResumeSchedule } from '@yiru/protocol/rate-limit-resume-values'
import type { AppState } from '~renderer/store/types'

export type RateLimitNotice = {
  hit: RateLimitHit
  /** Present once the user opted into an automatic continue. */
  schedule: RateLimitResumeSchedule | null
}

export type RateLimitNoticeState = Pick<AppState, 'rateLimitHitByPtyId' | 'rateLimitResumeByPtyId'>

/**
 * Resolve the notice a pane should render, if any. A live schedule wins: it
 * carries the same hit fields plus the resume time, so the card can render the
 * scheduled state from it alone.
 */
export function selectRateLimitNotice(
  state: RateLimitNoticeState,
  ptyId: string
): RateLimitNotice | null {
  const schedule = state.rateLimitResumeByPtyId[ptyId]
  if (schedule) {
    return { hit: schedule, schedule }
  }
  const hit = state.rateLimitHitByPtyId[ptyId]
  return hit ? { hit, schedule: null } : null
}
