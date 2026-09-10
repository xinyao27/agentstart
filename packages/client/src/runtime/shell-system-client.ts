import {
  SHELL_RUNTIME_PROTOCOL_CAPABILITY,
  ShellRuntimeClient,
  type TerminalDriverState,
  type TerminalFitOverride
} from '@agentstart/protocol'
import type {
  UpdaterCheckOptions as UpdateCheckOptions,
  UpdaterStatus as UpdateStatus
} from '@agentstart/protocol/updater-values'
import type { RuntimeSyncWindowGraph } from '~renderer/runtime/status/window-graph'
import {
  AGENTSTART_APP_RESTART_ABORTED_EVENT,
  AGENTSTART_APP_RESTART_STARTED_EVENT,
  AGENTSTART_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT,
  AGENTSTART_UPDATER_QUIT_AND_INSTALL_STARTED_EVENT
} from '~renderer/updater-renderer-events'

import {
  recordConfiguredBrowserHostStartupDiagnostic,
  restartConfiguredBrowserHost
} from './browser-host-runtime'
import { openRuntimeProtocolTarget } from './protocol-target'
import { requireShellRepoHostClient } from './shell-repo-host-target'
import { prepareShellRestart } from './shell-restart-client'
import { readRuntimeStatus } from './status-client'
import { openTerminalFitTarget } from './terminal-fit-target'
import { openLocalUpdaterTarget } from './updater-target'

export { shellGitHubApi } from './github-shell-target'
export type { ShellGitHubApi } from './github-shell-target'

export type ShellAppApi = {
  restart: () => Promise<void>
  startupDiagnostic: (event: string, details?: Record<string, unknown>) => Promise<void>
}
export type ShellRepoHostApi = {
  pickFolder: () => Promise<string | null>
  pickFolders: () => Promise<string[]>
  pickDirectory: () => Promise<string | null>
  removeForHost: (args: {
    expectedRevision: number
    repoId: string
    hostId: string
  }) => Promise<{ removed: boolean; revision: number }>
  reorderForHost: (args: {
    expectedRevision: number
    orderedIds: string[]
    hostId: string
  }) => Promise<{ revision?: number; status: 'applied' | 'rejected' }>
  cloneAbort: () => Promise<void>
  getDefaultCreateProjectParent: () => Promise<string>
}
export type ShellRuntimeStateApi = {
  // Why: the protobuf authority answers with the runtime status snapshot; the
  // legacy orchestration map rode the JSON body and has no protobuf field.
  syncWindowGraph: (graph: RuntimeSyncWindowGraph) => Promise<void>
  getTerminalFitOverrides: () => Promise<TerminalFitOverride[]>
  getTerminalDrivers: () => Promise<{ ptyId: string; driver: TerminalDriverState }[]>
  restoreTerminalFit: (ptyId: string) => Promise<{ restored: boolean }>
}
export type ShellUpdaterApi = {
  getVersion: () => Promise<string>
  check: (options?: UpdateCheckOptions) => Promise<void>
  download: () => Promise<void>
  quitAndInstall: () => Promise<void>
  onStatus: (callback: (status: UpdateStatus) => void) => () => void
}

export const shellAppApi: ShellAppApi = {
  restart: async () => {
    await prepareShellRestart({
      startedEventName: AGENTSTART_APP_RESTART_STARTED_EVENT,
      abortedEventName: AGENTSTART_APP_RESTART_ABORTED_EVENT
    })
    try {
      await restartConfiguredBrowserHost()
    } catch (error) {
      window.dispatchEvent(new Event(AGENTSTART_APP_RESTART_ABORTED_EVENT))
      throw error
    }
  },
  startupDiagnostic: recordConfiguredBrowserHostStartupDiagnostic
}

export const shellRepoHostApi: ShellRepoHostApi = {
  pickFolder: async () => (await requireShellRepoHostClient()).pickFolder(),
  pickFolders: async () => (await requireShellRepoHostClient()).pickFolders(),
  pickDirectory: async () => (await requireShellRepoHostClient()).pickDirectory(),
  removeForHost: async (input) => (await requireShellRepoHostClient()).removeForHost(input),
  reorderForHost: async (input) => (await requireShellRepoHostClient()).reorderForHost(input),
  cloneAbort: async () => {
    await (await requireShellRepoHostClient()).cloneAbort()
  },
  getDefaultCreateProjectParent: async () =>
    (await requireShellRepoHostClient()).getDefaultCreateProjectParent()
}

// Why: shell.runtime is LOCAL-only by contract, so its client anchors to the
// fixed local rendering shell, never the active environment — and a missing
// capability means the daemon predates the cutover, an error rather than a
// legacy retry.
async function requireShellRuntimeClient(): Promise<ShellRuntimeClient> {
  const target = { kind: 'local' } as const
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(SHELL_RUNTIME_PROTOCOL_CAPABILITY)) {
    throw new Error('shell.runtime.protobuf.v1 capability is not available')
  }
  return new ShellRuntimeClient(await openRuntimeProtocolTarget(target))
}

export const shellRuntimeStateApi: ShellRuntimeStateApi = {
  syncWindowGraph: async (input) => {
    await (await requireShellRuntimeClient()).syncWindowGraph(input)
  },
  getTerminalFitOverrides: async () => (await openTerminalFitTarget()).getOverrides(),
  getTerminalDrivers: async () => (await openTerminalFitTarget()).getDrivers(),
  restoreTerminalFit: async (ptyId) => ({
    restored: await (await openTerminalFitTarget()).restore(ptyId)
  })
}

export const shellUpdaterApi: ShellUpdaterApi = {
  getVersion: async () => (await openLocalUpdaterTarget()).getVersion(),
  check: async (input) => {
    await (await openLocalUpdaterTarget()).check(input)
  },
  download: async () => {
    await (await openLocalUpdaterTarget()).download()
  },
  quitAndInstall: async () => {
    await prepareShellRestart({
      startedEventName: AGENTSTART_UPDATER_QUIT_AND_INSTALL_STARTED_EVENT,
      abortedEventName: AGENTSTART_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT
    })
    try {
      await (await openLocalUpdaterTarget()).install()
    } catch (error) {
      window.dispatchEvent(new Event(AGENTSTART_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT))
      throw error
    }
  },
  onStatus: subscribeShellUpdaterStatus
}

function subscribeShellUpdaterStatus(callback: (status: UpdateStatus) => void): () => void {
  let isCancelled = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let stopCurrent: (() => void) | null = null

  function scheduleReconnect(): void {
    if (isCancelled || retryTimer) {
      return
    }
    retryTimer = setTimeout(() => {
      retryTimer = null
      openStream()
    }, 1_000)
  }

  function openStream(): void {
    void (async () => {
      try {
        const client = await openLocalUpdaterTarget()
        if (isCancelled) {
          return
        }
        const controller = new AbortController()
        stopCurrent = () => controller.abort()
        const subscription = await client.subscribeStatus({ signal: controller.signal })
        for await (const snapshot of subscription.snapshots) {
          if (controller.signal.aborted) {
            return
          }
          try {
            callback(snapshot.status)
          } catch (error) {
            console.error('[runtime] updater status listener failed', error)
          }
        }
        scheduleReconnect()
      } catch {
        // Why: reconnect with a fresh authenticated transport after a dropped subscription.
        scheduleReconnect()
      }
    })()
  }

  openStream()
  return () => {
    isCancelled = true
    stopCurrent?.()
    if (retryTimer) {
      clearTimeout(retryTimer)
    }
  }
}

export { shellStarNagApi, type ShellStarNagApi } from './star-nag/client'
