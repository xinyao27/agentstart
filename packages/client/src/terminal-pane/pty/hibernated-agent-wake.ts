import type { SleepingAgentSessionRecord } from '@agentstart/protocol/agent/session-resume'

import {
  getProviderSessionClaimKey,
  isPassiveCompletedHibernationEvidence
} from '../sleeping-agent-pane-ownership'

type WakeTarget = { ptyId: string; record: SleepingAgentSessionRecord }

type HibernatedAgentWakeOptions = {
  getIsDisposed: () => boolean
  getIsCurrentTransport: () => boolean
  getIsVisible: () => boolean
  getPtyId: () => string | null
  getSleepingRecord: () => SleepingAgentSessionRecord | null
  getIsSuppressedExit: (ptyId: string) => boolean
}

export type HibernatedAgentWake = {
  setWake: (wake: () => Promise<string | null>) => void
  armFromSuppressedExit: (ptyId: string) => boolean
  consume: (claimedProviderSessions?: Set<string>) => string | null
  wakeIfArmed: (claimedProviderSessions?: Set<string>) => string | null
}

export function createHibernatedAgentWake(
  options: HibernatedAgentWakeOptions
): HibernatedAgentWake {
  let target: WakeTarget | null = null
  let pendingTarget: WakeTarget | null = null
  let inFlightClaimKey: string | null = null
  let wake: (() => Promise<string | null>) | null = null

  const consume = (claimedProviderSessions?: Set<string>): string | null => {
    const currentTarget = target
    if (!currentTarget || options.getIsDisposed() || !options.getIsCurrentTransport()) {
      return null
    }
    if (options.getSleepingRecord() !== currentTarget.record) {
      target = null
      pendingTarget = null
      return null
    }
    const currentPtyId = options.getPtyId()
    // Why: null is the normal real-exit state; only a different non-null PTY
    // proves another restart already won this wake race.
    if (currentPtyId !== null && currentPtyId !== currentTarget.ptyId) {
      target = null
      pendingTarget = null
      return null
    }
    if (!wake) {
      return null
    }
    const claimKey = getProviderSessionClaimKey(currentTarget.record)
    if (claimedProviderSessions?.has(claimKey)) {
      return null
    }
    claimedProviderSessions?.add(claimKey)
    target = null
    pendingTarget = null
    inFlightClaimKey = claimKey
    void wake()
      .then((spawnedPtyId) => {
        // Why: a transient spawn failure leaves this exact passive record
        // retryable on the next reveal or mobile wake.
        if (!spawnedPtyId) {
          target = currentTarget
        }
      })
      .finally(() => {
        if (inFlightClaimKey === claimKey) {
          inFlightClaimKey = null
        }
      })
    return claimKey
  }

  return {
    setWake: (nextWake) => {
      wake = nextWake
    },
    armFromSuppressedExit: (ptyId) => {
      const record = options.getSleepingRecord()
      if (!record || !isPassiveCompletedHibernationEvidence(record)) {
        if (pendingTarget?.ptyId === ptyId) {
          pendingTarget = null
        }
        return false
      }
      target = { ptyId, record }
      const pendingMatches = pendingTarget?.ptyId === ptyId && pendingTarget.record === record
      if (pendingTarget && !pendingMatches) {
        pendingTarget = null
      }
      if (options.getIsVisible() || pendingMatches) {
        // Why: a reveal can race the suppressed exit and observe no armed
        // target. Consume after the exit handler has completed its cleanup.
        queueMicrotask(() => consume())
      }
      return true
    },
    consume,
    wakeIfArmed: (claimedProviderSessions) => {
      if (inFlightClaimKey) {
        if (claimedProviderSessions?.has(inFlightClaimKey)) {
          return null
        }
        claimedProviderSessions?.add(inFlightClaimKey)
        return inFlightClaimKey
      }
      const consumedClaimKey = consume(claimedProviderSessions)
      if (consumedClaimKey) {
        return consumedClaimKey
      }
      // Why: mobile wake can arrive after the passive record is written but
      // before the suppressed PTY exit arms the ordinary target.
      const record = options.getSleepingRecord()
      const currentPtyId = options.getPtyId()
      if (
        !record ||
        !isPassiveCompletedHibernationEvidence(record) ||
        currentPtyId === null ||
        !options.getIsSuppressedExit(currentPtyId) ||
        options.getIsDisposed() ||
        target !== null ||
        !options.getIsCurrentTransport() ||
        options.getPtyId() !== currentPtyId
      ) {
        return null
      }
      const claimKey = getProviderSessionClaimKey(record)
      if (claimedProviderSessions?.has(claimKey)) {
        return null
      }
      claimedProviderSessions?.add(claimKey)
      pendingTarget = { ptyId: currentPtyId, record }
      return claimKey
    }
  }
}
