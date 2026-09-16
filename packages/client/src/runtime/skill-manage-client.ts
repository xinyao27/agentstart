import type { SkillManageScope, SkillUpdateStartResult } from '@agentstart/protocol'
import type {
  SkillDirectoryListing,
  SkillDiscoveryResult,
  SkillFileReadResult
} from '@agentstart/protocol'
import type { SkillDiscoveryTarget } from '~renderer/skills/discovery-target'
import { flattenSkillUpdateRun } from '~renderer/skills/freshness-model'
import type { SkillFreshnessInventory, SkillUpdateRun } from '~renderer/skills/freshness-model'
import { useAppStore } from '~renderer/store/state'

import { getActiveRuntimeTarget } from './rpc-client'
import { requireSkillsProtocolClient } from './skills-protocol-target'

function activeSkillManageTarget() {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

export async function discoverSkills(target?: SkillDiscoveryTarget): Promise<SkillDiscoveryResult> {
  const client = await requireSkillsProtocolClient(activeSkillManageTarget())
  // Why: the protobuf Discover request carries runtime/cwd/executionHostId;
  // WSL distro and project-runtime resolution moved into the daemon authority.
  return client.discover({
    runtime: target?.runtime,
    cwd: target?.cwd ?? undefined,
    executionHostId: target?.executionHostId ?? undefined
  })
}

export async function getSkillFreshnessInventory(): Promise<SkillFreshnessInventory> {
  const client = await requireSkillsProtocolClient(activeSkillManageTarget())
  // Why: schemaVersion 1 is the renderer-side freshness cache contract; the
  // wire carries only the inventory itself.
  return { schemaVersion: 1, ...(await client.manageFreshnessInventory()) }
}

export async function startSkillManageUpdateRun(names: string[]): Promise<SkillUpdateStartResult> {
  const client = await requireSkillsProtocolClient(activeSkillManageTarget())
  return client.manageStartUpdateRun(names)
}

export async function startSkillManageInstallRun(request: {
  source: string
  skillNames?: string[]
  scope: SkillManageScope
}): Promise<SkillUpdateStartResult> {
  const client = await requireSkillsProtocolClient(activeSkillManageTarget())
  return client.manageStartInstallRun(request)
}

export async function startSkillManageRemoveRun(request: {
  names: string[]
  scope: SkillManageScope
}): Promise<SkillUpdateStartResult> {
  const client = await requireSkillsProtocolClient(activeSkillManageTarget())
  return client.manageStartRemoveRun(request)
}

export async function listSkillManageFiles(directoryPath: string): Promise<SkillDirectoryListing> {
  const client = await requireSkillsProtocolClient(activeSkillManageTarget())
  return client.manageListSkillFiles(directoryPath)
}

export async function readSkillManageDirFile(request: {
  directoryPath: string
  relativePath: string
}): Promise<SkillFileReadResult> {
  const client = await requireSkillsProtocolClient(activeSkillManageTarget())
  return client.manageReadSkillDirFile(request.directoryPath, request.relativePath)
}

export async function cancelSkillManageUpdateRun(): Promise<SkillUpdateRun> {
  const client = await requireSkillsProtocolClient(activeSkillManageTarget())
  return flattenSkillUpdateRun(await client.manageCancelUpdateRun())
}

export async function acknowledgeSkillManageUpdateRun(): Promise<SkillUpdateRun> {
  const client = await requireSkillsProtocolClient(activeSkillManageTarget())
  return flattenSkillUpdateRun(await client.manageAcknowledgeUpdateRun())
}

export async function getSkillManageUpdateRun(): Promise<SkillUpdateRun> {
  const client = await requireSkillsProtocolClient(activeSkillManageTarget())
  return flattenSkillUpdateRun(await client.manageGetUpdateRun())
}

export type SkillRunSubscriptionHandlers = {
  onRun: (run: SkillUpdateRun) => void
  // Why: the stream replays nothing, so a (re)opened subscription says nothing
  // about the run already in flight — the caller has to ask for it.
  onSubscribed: () => void
}

/** How long a dropped run stream waits before it is opened again. */
const SKILL_RUN_RESUBSCRIBE_DELAY_MS = 1_000

// Why: the run is one host-wide operation, so one subscription per renderer
// lifetime is enough — the shared runner reports its own state and this
// subscription only forwards run events to the single listener. A daemon
// restart or a swapped runtime target ends that stream for good, so it reopens
// itself: a caller left believing the last run it heard about is still the
// current one refuses the next start the daemon would have accepted.
export function subscribeSkillManageUpdateRun(handlers: SkillRunSubscriptionHandlers): () => void {
  let cancelled = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let stopCurrent: (() => void) | null = null

  function scheduleResubscribe(): void {
    if (cancelled || retryTimer) {
      return
    }
    retryTimer = setTimeout(() => {
      retryTimer = null
      openStream()
    }, SKILL_RUN_RESUBSCRIBE_DELAY_MS)
  }

  function openStream(): void {
    void (async () => {
      try {
        const controller = new AbortController()
        stopCurrent = () => controller.abort()
        const client = await requireSkillsProtocolClient(activeSkillManageTarget())
        if (cancelled) {
          return
        }
        const events = await client.manageEventsSubscribe({ signal: controller.signal })
        try {
          for await (const event of events.messages) {
            if (cancelled || controller.signal.aborted) {
              return
            }
            switch (event.type) {
              case 'ready':
                // Why: the daemon has registered this receiver by the time the
                // envelope arrives, so the snapshot taken here cannot miss an
                // event the stream is already being sent.
                handlers.onSubscribed()
                break
              case 'run':
                handlers.onRun(flattenSkillUpdateRun(event.run))
                break
              case 'end':
                break
            }
          }
          scheduleResubscribe()
        } finally {
          await events.cancel('subscriber detached')
        }
      } catch {
        // Why: an aborted subscription (unsubscribe, or a dropped transport the
        // resubscribe replaces) must not surface as an unhandled rejection, and
        // a stream that never opened is exactly when the retry is needed.
        scheduleResubscribe()
      }
    })()
  }

  openStream()
  return () => {
    cancelled = true
    stopCurrent?.()
    if (retryTimer) {
      clearTimeout(retryTimer)
    }
  }
}
