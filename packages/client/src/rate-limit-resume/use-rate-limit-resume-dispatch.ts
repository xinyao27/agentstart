import type { RateLimitResumeSchedule } from '@agentstart/protocol/rate-limit-resume-values'
import { useEffect } from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  markRateLimitResumeFailed,
  markRateLimitResumeFired,
  markRateLimitResumeStale,
  notifyRateLimitResumeRendererReady
} from '~renderer/runtime/rate-limit-resume-client'
import { useAppStore } from '~renderer/store/state'
// Executes a due resume: replay the prompt that the provider limit cut short
// into the same pane, then report the outcome back to main.
import { submitPromptToAgentPty } from '~renderer/terminal-pane/agent/draft-delivery'

// Why: main re-dispatches a due schedule on every tick until its status leaves
// 'scheduled'. Replaying a prompt takes seconds, so guard against a second
// dispatch landing mid-flight and double-sending the prompt.
const replayingScheduleIds = new Set<string>()

function paneIsStillLive(schedule: RateLimitResumeSchedule): boolean {
  const ptyIds = useAppStore.getState().ptyIdsByTabId[schedule.tabId] ?? []
  return ptyIds.includes(schedule.ptyId)
}

// Why: Resume outcomes must return to the same runtime that owns the schedule.
export async function handleRateLimitResumeDispatchRequest(
  schedule: RateLimitResumeSchedule
): Promise<void> {
  if (replayingScheduleIds.has(schedule.id)) {
    return
  }
  replayingScheduleIds.add(schedule.id)
  const { applyRateLimitResume } = useAppStore.getState()
  try {
    if (!paneIsStillLive(schedule)) {
      applyRateLimitResume(await markRateLimitResumeStale(schedule.id))
      return
    }
    const submitted = await submitPromptToAgentPty({
      tabId: schedule.tabId,
      ptyId: schedule.ptyId,
      content: schedule.prompt
    })
    applyRateLimitResume(
      submitted
        ? await markRateLimitResumeFired(schedule.id)
        : await markRateLimitResumeFailed(
            schedule.id,
            translate(
              'auto.components.rate.limit.resume.use.rate.limit.resume.dispatch.8ec3ff2193',
              'The agent pane did not accept the replayed prompt.'
            )
          )
    )
  } catch (error) {
    console.error('Failed to resume after rate limit:', error)
  } finally {
    replayingScheduleIds.delete(schedule.id)
  }
}

// Why: `rendererReady` still matters even though the dispatch push moved to
// the shellServices reverse link (connected earlier, at the local runtime
// handshake, before rateLimitResumes are loaded into the store). This
// mount-time signal both flushes any resume that came due while the app was
// closed and tells RateLimitResumeService the renderer can execute one now.
export function useRateLimitResumeDispatch(): void {
  const activeRuntimeEnvironmentId = useAppStore(
    (state) => state.settings?.activeRuntimeEnvironmentId ?? null
  )
  useEffect(() => {
    void useAppStore.getState().loadRateLimitResumes()
    void notifyRateLimitResumeRendererReady()
  }, [activeRuntimeEnvironmentId])
}
