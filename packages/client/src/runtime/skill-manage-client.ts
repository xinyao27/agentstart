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

// Why: the run is one host-wide operation, so one subscription per renderer
// lifetime is enough — the shared runner reports its own state and this
// subscription only forwards run events to the single listener.
export function subscribeSkillManageUpdateRun(onRun: (run: SkillUpdateRun) => void): () => void {
  const controller = new AbortController()
  void (async () => {
    try {
      const client = await requireSkillsProtocolClient(activeSkillManageTarget())
      const events = await client.manageEventsSubscribe({ signal: controller.signal })
      try {
        for await (const event of events.messages) {
          if (controller.signal.aborted) {
            return
          }
          if (event.type === 'run') {
            onRun(flattenSkillUpdateRun(event.run))
          }
        }
      } finally {
        await events.cancel('subscriber detached')
      }
    } catch {
      // Why: an aborted subscription (unmount, or a dropped transport that a
      // reconnect will replace) must not surface as an unhandled rejection.
    }
  })()
  return () => controller.abort()
}
