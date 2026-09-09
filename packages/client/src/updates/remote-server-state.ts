import type { UpdaterCheckOptions, UpdaterClient } from '@yiru/protocol'
import type { StateCreator } from 'zustand'
import { isValidAppVersion } from '~renderer/app-version'
import { runRemoteServerUpdateBatch } from '~renderer/runtime/remote-server-update-batch'
import {
  checkingRemoteServerUpdateEntry,
  inspectRemoteServerUpdate,
  runRemoteServerUpdate,
  type RemoteServerUpdateEntry,
  type RemoteServerUpdateTransport
} from '~renderer/runtime/remote-server-update-coordinator'
import { getRuntimeEnvironmentStatus } from '~renderer/runtime/rpc-client'
import { runtimeEnvironmentsClient } from '~renderer/runtime/runtime-environments-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { openUpdaterTarget } from '~renderer/runtime/updater-target'

import type { AppState } from '../store/types'

const MAX_CONCURRENT_REMOTE_SERVER_UPDATES = 2

const transport: RemoteServerUpdateTransport = {
  getRuntimeStatus: getRuntimeEnvironmentStatus,
  subscribeStatus: async (environmentId, timeoutMs) =>
    (await updaterClient(environmentId)).subscribeStatus({ timeoutMs }),
  check: async (environmentId, options) =>
    (await updaterClient(environmentId)).check(options, { timeoutMs: 15_000 }),
  download: async (environmentId) =>
    (await updaterClient(environmentId)).download({ timeoutMs: 15_000 }),
  install: async (environmentId) =>
    (await updaterClient(environmentId)).install({ timeoutMs: 15_000 }),
  wait: (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

async function updaterClient(environmentId: string): Promise<UpdaterClient> {
  return openUpdaterTarget({ kind: 'environment', environmentId })
}

export type RemoteServerUpdatesSlice = {
  remoteServerUpdates: Map<string, RemoteServerUpdateEntry>
  remoteServerUpdateCheckOptions: UpdaterCheckOptions | null
  remoteServerUpdatesChecking: boolean
  remoteServerUpdatesRunning: boolean
  remoteServerUpdateDialogOpen: boolean
  remoteServerUpdatesLastCheckedAt: number | null
  setRemoteServerUpdateDialogOpen: (open: boolean) => void
  refreshRemoteServerUpdates: (options?: UpdaterCheckOptions) => Promise<void>
  startRemoteServerUpdates: (environmentIds?: readonly string[]) => Promise<void>
}

export const createRemoteServerUpdatesSlice: StateCreator<
  AppState,
  [],
  [],
  RemoteServerUpdatesSlice
> = (set, get) => ({
  remoteServerUpdates: new Map(),
  remoteServerUpdateCheckOptions: null,
  remoteServerUpdatesChecking: false,
  remoteServerUpdatesRunning: false,
  remoteServerUpdateDialogOpen: false,
  remoteServerUpdatesLastCheckedAt: null,

  setRemoteServerUpdateDialogOpen: (open) =>
    set({
      remoteServerUpdateDialogOpen: open,
      ...(open ? {} : { remoteServerUpdateCheckOptions: null })
    }),

  refreshRemoteServerUpdates: async (options) => {
    if (get().remoteServerUpdatesChecking || get().remoteServerUpdatesRunning) {
      return
    }
    const requestedOptions = options
      ? {
          includePrerelease: Boolean(options.includePrerelease),
          includePerfPrerelease: Boolean(options.includePerfPrerelease)
        }
      : undefined
    set({
      remoteServerUpdatesChecking: true,
      ...(requestedOptions ? { remoteServerUpdateCheckOptions: requestedOptions } : {})
    })
    try {
      const listed = await runtimeEnvironmentsClient.list()
      const environments = listed.filter((environment) => !environment.pairingRequired)
      get().setRuntimeEnvironments(listed)
      const previous = get().remoteServerUpdates
      set({
        remoteServerUpdates: new Map(
          environments.map((environment) => {
            const existing = previous.get(environment.id)
            return [
              environment.id,
              existing
                ? { ...existing, name: environment.name }
                : checkingRemoteServerUpdateEntry(environment)
            ]
          })
        )
      })
      const clientVersion = await shellClient.updater.getVersion()
      // Why: the web client has no app build version; ask each owning runtime's
      // updater instead of comparing against the sentinel "web" version.
      const effectiveOptions =
        requestedOptions ??
        (isValidAppVersion(clientVersion)
          ? undefined
          : { includePrerelease: false, includePerfPrerelease: false })
      await Promise.allSettled(
        environments.map(async (environment) => {
          const entry = await inspectRemoteServerUpdate(
            environment,
            clientVersion,
            transport,
            effectiveOptions
          )
          set((state) => {
            const next = new Map(state.remoteServerUpdates)
            next.set(environment.id, entry)
            return { remoteServerUpdates: next }
          })
        })
      )
      set({ remoteServerUpdatesLastCheckedAt: Date.now() })
    } finally {
      set({ remoteServerUpdatesChecking: false })
    }
  },

  startRemoteServerUpdates: async (environmentIds) => {
    if (get().remoteServerUpdatesRunning) {
      return
    }
    const selected = new Set(environmentIds ?? [])
    const checkOptions = get().remoteServerUpdateCheckOptions
    const entries = [...get().remoteServerUpdates.values()].filter(
      (entry) =>
        (entry.phase === 'available' || entry.phase === 'failed') &&
        (selected.size === 0 || selected.has(entry.environmentId))
    )
    if (entries.length === 0) {
      return
    }
    set((state) => {
      const next = new Map(state.remoteServerUpdates)
      for (const entry of entries) {
        next.set(entry.environmentId, { ...entry, phase: 'queued', error: null })
      }
      return { remoteServerUpdates: next, remoteServerUpdatesRunning: true }
    })
    try {
      await runRemoteServerUpdateBatch(
        entries,
        MAX_CONCURRENT_REMOTE_SERVER_UPDATES,
        async (entry) => {
          await runRemoteServerUpdate(
            entry,
            transport,
            (progress) => {
              set((state) => {
                const next = new Map(state.remoteServerUpdates)
                next.set(entry.environmentId, progress)
                return { remoteServerUpdates: next }
              })
            },
            checkOptions ? { checkOptions } : undefined
          )
        }
      )
    } finally {
      set({ remoteServerUpdatesRunning: false, remoteServerUpdatesLastCheckedAt: Date.now() })
    }
  }
})
