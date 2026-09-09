import type { StateCreator } from 'zustand'
import { readProjectCatalogSnapshot } from '~renderer/project-catalog/catalog-snapshot'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'
import {
  clearRecentRuntimeCompatibilityFailure,
  clearRuntimeCompatibilityCache
} from '~renderer/runtime/rpc-client'
import { runtimeEnvironmentsClient } from '~renderer/runtime/runtime-environments-client'
import type { RuntimeStatus } from '~renderer/runtime/status/model'

import type { AppState } from '../store/types'

/** Live status for one saved runtime environment, as last observed by the
 * renderer. `status === null` records a probe that failed or timed out so the
 * sidebar can still distinguish "unknown/unreachable" from "never checked". */
export type RuntimeEnvironmentStatus = {
  status: RuntimeStatus | null
  appVersion?: string | null
  checkedAt: number
}

export type RuntimeStatusSlice = {
  /** Keyed by runtime environment id. Fed into buildExecutionHostRegistry so
   * compat verdicts/blocked health show live in the sidebar host pickers. */
  runtimeStatusByEnvironmentId: Map<string, RuntimeEnvironmentStatus>
  /** Replaces the saved-environment list and trims stale status entries. */
  setRuntimeEnvironments: (environments: PublicKnownRuntimeEnvironment[]) => void
  /** Merges one environment's status. Replaces the prior entry for that id. */
  setRuntimeEnvironmentStatus: (environmentId: string, status: RuntimeEnvironmentStatus) => void
  /** Drops a removed environment so stale hosts don't linger in the registry. */
  clearRuntimeEnvironmentStatus: (environmentId: string) => void
  /** Drops every entry whose id is not in the saved-environments set. */
  retainRuntimeEnvironmentStatuses: (environmentIds: Iterable<string>) => void
  /** Probes one saved runtime and records the latest reachable/unreachable state. */
  refreshRuntimeEnvironmentStatus: (environmentId: string, timeoutMs?: number) => Promise<boolean>
  /** Best-effort: probe saved environments so the sidebar shows
   * live health at boot, before the settings pane is ever opened. */
  hydrateRuntimeEnvironmentStatuses: (
    environments: readonly PublicKnownRuntimeEnvironment[]
  ) => Promise<void>
}

export const createRuntimeStatusSlice: StateCreator<AppState, [], [], RuntimeStatusSlice> = (
  set,
  get
) => ({
  runtimeStatusByEnvironmentId: new Map(),

  setRuntimeEnvironments: (environments) => {
    const keep = new Set(environments.map((environment) => environment.id))
    const previousIds = new Set([
      ...readProjectCatalogSnapshot().runtimeEnvironments.map((environment) => environment.id),
      ...get().runtimeStatusByEnvironmentId.keys()
    ])
    for (const environmentId of previousIds) {
      if (!keep.has(environmentId)) {
        clearRuntimeCompatibilityCache(environmentId)
      }
    }
    set((s) => {
      const nextStatuses = new Map(s.runtimeStatusByEnvironmentId)
      let statusesChanged = false
      for (const id of nextStatuses.keys()) {
        if (!keep.has(id)) {
          nextStatuses.delete(id)
          statusesChanged = true
        }
      }
      return statusesChanged ? { runtimeStatusByEnvironmentId: nextStatuses } : s
    })
    // Why: evict detected-agent caches for environments that no longer exist so
    // they don't leak per-environment entries for the renderer session.
    // Optional-chained: minimal store assemblies (some unit tests) omit the
    // detected-agents slice.
    get().retainRuntimeDetectedAgents?.(environments.map((environment) => environment.id))
  },

  setRuntimeEnvironmentStatus: (environmentId, status) => {
    const previousStatus = get().runtimeStatusByEnvironmentId.get(environmentId)?.status
    const connectionBoundary =
      status.status === null ||
      previousStatus === undefined ||
      previousStatus === null ||
      previousStatus.runtimeId !== status.status.runtimeId
    // Why: an offline, first-observed, or replaced host view starts a new
    // capability generation; no supported verdict may survive that boundary.
    if (connectionBoundary) {
      clearRuntimeCompatibilityCache(environmentId)
    } else {
      clearRecentRuntimeCompatibilityFailure(environmentId)
    }
    set((s) => {
      const next = new Map(s.runtimeStatusByEnvironmentId)
      next.set(environmentId, status)
      return { runtimeStatusByEnvironmentId: next }
    })
  },

  clearRuntimeEnvironmentStatus: (environmentId) => {
    clearRuntimeCompatibilityCache(environmentId)
    set((s) => {
      if (!s.runtimeStatusByEnvironmentId.has(environmentId)) {
        return s
      }
      const next = new Map(s.runtimeStatusByEnvironmentId)
      next.delete(environmentId)
      return { runtimeStatusByEnvironmentId: next }
    })
  },

  retainRuntimeEnvironmentStatuses: (environmentIds) => {
    const keep = new Set(environmentIds)
    for (const environmentId of get().runtimeStatusByEnvironmentId.keys()) {
      if (!keep.has(environmentId)) {
        clearRuntimeCompatibilityCache(environmentId)
      }
    }
    set((s) => {
      let changed = false
      const next = new Map(s.runtimeStatusByEnvironmentId)
      for (const id of next.keys()) {
        if (!keep.has(id)) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? { runtimeStatusByEnvironmentId: next } : s
    })
  },

  refreshRuntimeEnvironmentStatus: async (environmentId, timeoutMs = 10_000) => {
    try {
      const status = await runtimeEnvironmentsClient.getStatus({
        selector: environmentId,
        timeoutMs
      })

      // setRuntimeEnvironmentStatus drops any stale compat failure on a non-null
      // (reachable) status, so a recovered host's reuse-flagged refetches re-probe.
      get().setRuntimeEnvironmentStatus(environmentId, { status, checkedAt: Date.now() })
      return true
    } catch {
      get().setRuntimeEnvironmentStatus(environmentId, {
        status: null,
        checkedAt: Date.now()
      })
      return false
    }
  },

  hydrateRuntimeEnvironmentStatuses: async (environments) => {
    get().setRuntimeEnvironments([...environments])
    // Why: fire-and-forget per env; one unreachable server must not block the
    // others, and a failure records a null status rather than nothing.
    await Promise.allSettled(
      environments.map((environment) => get().refreshRuntimeEnvironmentStatus(environment.id))
    )
  }
})
