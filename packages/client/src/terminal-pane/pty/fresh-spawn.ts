import type { TuiAgent } from '@yiru/protocol/agent/types'

import type { ColdRestoreAgentResumeStartup } from './cold-restore-agent-startup'
import type { PtyConnectResult, PtyTransport } from './transport-types'

const pendingSpawnByPaneKey = new Map<string, Promise<string | null>>()

export type PendingStartupCommand = {
  command: string
  env?: Record<string, string>
  envToDelete?: string[]
}

export type FreshSpawnOptions = {
  forceBlankRestoredViewport?: boolean
}

type FreshSpawnStartup = PendingStartupCommand | ColdRestoreAgentResumeStartup
type ConnectCallbacks = Parameters<PtyTransport['connect']>[0]['callbacks']

type FreshSpawnFactoryOptions = {
  paneKey: string
  cols: number
  rows: number
  connectionId: string | null
  paneIdentityEnv: Record<string, string>
  transport: PtyTransport
  getStreamGeneration: () => number
  captureOutputCallbacks: () => { generation: number; callbacks: ConnectCallbacks }
  setConnectStartedAt: (startedAt: number | null) => void
  resetBeforeSpawn: (options: FreshSpawnOptions) => void
  setSshStartupCommand: (command: string) => void
  registerLaunchConfig: (
    launchConfig: PtyConnectResult['launchConfig'] | undefined,
    metadata?: { launchToken?: string; launchAgent?: TuiAgent }
  ) => void
  clearLaunchConfig: () => void
  hasConfiguredLaunch: () => boolean
  showStartupCwdFallback: () => void
  showSessionRestored: () => void
  clearSleepingRecord: (startup: ColdRestoreAgentResumeStartup | null) => void
  getActivePtyBinding: () => string | null
  bindReattachedPty: (ptyId: string) => void
  reconcileSize: (ptyId: string, cols: number, rows: number) => void
  scheduleSshStartupCommand: () => void
}

export function getPendingFreshSpawn(paneKey: string): Promise<string | null> | undefined {
  return pendingSpawnByPaneKey.get(paneKey)
}

export function createFreshSpawn(options: FreshSpawnFactoryOptions) {
  return (
    startupOverride?: FreshSpawnStartup | null,
    spawnOptions: FreshSpawnOptions = {}
  ): Promise<string | null> => {
    options.resetBeforeSpawn(spawnOptions)
    const coldRestoreOverride =
      startupOverride && 'launchConfig' in startupOverride ? startupOverride : null
    const envToDelete =
      startupOverride && 'envToDelete' in startupOverride ? startupOverride.envToDelete : undefined
    if (options.connectionId && startupOverride?.command) {
      options.setSshStartupCommand(startupOverride.command)
    }
    options.setConnectStartedAt(Date.now())
    const output = options.captureOutputCallbacks()
    const spawnedRaw = options.transport.connect({
      url: '',
      cols: options.cols,
      rows: options.rows,
      ...(startupOverride?.command ? { command: startupOverride.command } : {}),
      ...(startupOverride?.env
        ? {
            env: {
              ...startupOverride.env,
              ...options.paneIdentityEnv,
              ...(startupOverride.env.YIRU_AGENT_LAUNCH_TOKEN
                ? { YIRU_AGENT_LAUNCH_TOKEN: startupOverride.env.YIRU_AGENT_LAUNCH_TOKEN }
                : {})
            }
          }
        : {}),
      ...(envToDelete ? { envToDelete } : {}),
      ...(coldRestoreOverride ? { launchConfig: coldRestoreOverride.launchConfig } : {}),
      ...(coldRestoreOverride ? { launchToken: coldRestoreOverride.launchToken } : {}),
      ...(coldRestoreOverride ? { launchAgent: coldRestoreOverride.agent } : {}),
      callbacks: output.callbacks
    })
    void Promise.resolve(spawnedRaw)
      .catch(() => null)
      .finally(() => {
        options.setConnectStartedAt(null)
      })
    const tracked: Promise<string | null> = Promise.resolve(spawnedRaw)
      .then((spawned) => {
        if (output.generation !== options.getStreamGeneration()) {
          return null
        }
        const result = spawned && typeof spawned === 'object' && 'id' in spawned ? spawned : null
        const ptyId =
          result?.id ?? (typeof spawned === 'string' ? spawned : options.transport.getPtyId())
        if (result) {
          options.registerLaunchConfig(result.launchConfig, {
            ...(coldRestoreOverride ? { launchToken: coldRestoreOverride.launchToken } : {}),
            ...(coldRestoreOverride ? { launchAgent: coldRestoreOverride.agent } : {})
          })
        }
        if (ptyId) {
          if (result?.startupCwdFallback?.kind === 'worktree') {
            options.showStartupCwdFallback()
          }
          if (coldRestoreOverride?.hasSleepingRecord) {
            options.showSessionRestored()
          }
          options.clearSleepingRecord(coldRestoreOverride)
        } else if (options.hasConfiguredLaunch() || coldRestoreOverride) {
          options.clearLaunchConfig()
        }
        if (
          ptyId &&
          result &&
          options.getActivePtyBinding() !== ptyId &&
          options.transport.getPtyId() === ptyId
        ) {
          options.bindReattachedPty(ptyId)
        }
        if (ptyId) {
          options.reconcileSize(ptyId, options.cols, options.rows)
          if (options.connectionId) {
            options.scheduleSshStartupCommand()
          }
        }
        return ptyId
      })
      .catch(() => {
        if (options.hasConfiguredLaunch() || coldRestoreOverride) {
          options.clearLaunchConfig()
        }
        return null
      })
      .finally(() => {
        if (pendingSpawnByPaneKey.get(options.paneKey) === tracked) {
          pendingSpawnByPaneKey.delete(options.paneKey)
        }
      })
    // Why: split panes in one tab can spawn concurrently. Key by pane as well
    // as tab so a remount cannot attach to a sibling setup pane's PTY.
    pendingSpawnByPaneKey.set(options.paneKey, tracked)
    return tracked
  }
}
