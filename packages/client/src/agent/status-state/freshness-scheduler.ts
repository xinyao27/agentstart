import type { AgentStatusEntry } from '@agentstart/protocol/agent/status-records'
import { AGENT_STATUS_STALE_AFTER_MS } from '@agentstart/protocol/agent/status-records'

export type FreshnessSchedulerDeps = {
  getEntries: () => AgentStatusEntry[]
  bumpEpochs: () => void
}

export type FreshnessScheduler = {
  schedule: () => void
}

export function createFreshnessScheduler(deps: FreshnessSchedulerDeps): FreshnessScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null

  const clear = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const schedule = (): void => {
    clear()
    const entries = deps.getEntries()
    if (entries.length === 0) {
      return
    }
    const now = Date.now()
    let nextExpiryAt = Number.POSITIVE_INFINITY
    // Why: skip entries already past the stale boundary — they each contribute
    // exactly one epoch bump at crossing, and rescheduling on them would spin
    // the timer forever because the bump doesn't clear them from the map
    // (retention is intentional so freshness-aware selectors can decay).
    //
    // Snapshot hydration can insert already-stale entries. Those need no
    // future timer: the setAgentStatus write already bumped the epoch, so
    // freshness-aware selectors can decay them immediately on that render.
    for (const entry of entries) {
      const expiryAt = entry.updatedAt + AGENT_STATUS_STALE_AFTER_MS
      if (expiryAt > now) {
        nextExpiryAt = Math.min(nextExpiryAt, expiryAt)
      }
    }
    if (!Number.isFinite(nextExpiryAt)) {
      return
    }
    // Why: +1 ms ensures the timer fires strictly after the stale boundary,
    // so isExplicitAgentStatusFresh (which uses `<=`) flips to stale when the
    // timer runs. Without the +1, float/rounding could leave the entry "just
    // fresh enough" at the tick, delaying the epoch bump by one tick.
    const delayMs = nextExpiryAt - now + 1
    timer = setTimeout(() => {
      timer = null
      deps.bumpEpochs()
      schedule()
    }, delayMs)
  }

  return { schedule }
}
