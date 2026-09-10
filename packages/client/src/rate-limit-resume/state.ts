import type {
  RateLimitHit,
  RateLimitResumeSchedule
} from '@agentstart/protocol/rate-limit-resume-values'
import { isFinalRateLimitResumeStatus } from '@agentstart/protocol/rate-limit-resume/policy'
import type { StateCreator } from 'zustand'
import { listRateLimitResumes } from '~renderer/runtime/rate-limit-resume-client'

import type { AppState } from '../store/types'

export type RateLimitResumeSlice = {
  /** Detected limits awaiting a user decision, keyed by pty id. */
  rateLimitHitByPtyId: Record<string, RateLimitHit>
  /** Live schedules, keyed by pty id. Terminal ones are dropped on write. */
  rateLimitResumeByPtyId: Record<string, RateLimitResumeSchedule>
  recordRateLimitHit: (hit: RateLimitHit) => void
  dismissRateLimitHit: (ptyId: string) => void
  applyRateLimitResume: (schedule: RateLimitResumeSchedule) => void
  loadRateLimitResumes: () => Promise<void>
}

function withoutKey<T>(source: Record<string, T>, key: string): Record<string, T> {
  if (!(key in source)) {
    return source
  }
  const next = { ...source }
  delete next[key]
  return next
}

export const createRateLimitResumeSlice: StateCreator<AppState, [], [], RateLimitResumeSlice> = (
  set
) => ({
  rateLimitHitByPtyId: {},
  rateLimitResumeByPtyId: {},

  recordRateLimitHit: (hit) => {
    set((s) => ({ rateLimitHitByPtyId: { ...s.rateLimitHitByPtyId, [hit.ptyId]: hit } }))
  },

  dismissRateLimitHit: (ptyId) => {
    set((s) => ({
      rateLimitHitByPtyId: withoutKey(s.rateLimitHitByPtyId, ptyId),
      rateLimitResumeByPtyId: withoutKey(s.rateLimitResumeByPtyId, ptyId)
    }))
  },

  applyRateLimitResume: (schedule) => {
    set((s) => {
      if (isFinalRateLimitResumeStatus(schedule.status)) {
        return {
          rateLimitHitByPtyId: withoutKey(s.rateLimitHitByPtyId, schedule.ptyId),
          rateLimitResumeByPtyId: withoutKey(s.rateLimitResumeByPtyId, schedule.ptyId)
        }
      }
      return {
        // Why: the card renders the schedule once one exists, so the bare hit
        // must not linger and win the "needs a decision" branch.
        rateLimitHitByPtyId: withoutKey(s.rateLimitHitByPtyId, schedule.ptyId),
        rateLimitResumeByPtyId: { ...s.rateLimitResumeByPtyId, [schedule.ptyId]: schedule }
      }
    })
  },

  loadRateLimitResumes: async () => {
    try {
      const schedules = await listRateLimitResumes()
      const live = schedules.filter((schedule) => !isFinalRateLimitResumeStatus(schedule.status))
      set({
        rateLimitResumeByPtyId: Object.fromEntries(
          live.map((schedule) => [schedule.ptyId, schedule])
        )
      })
    } catch (error) {
      console.error('Failed to load rate-limit resumes:', error)
    }
  }
})
