import { resolveSetupAgentSequenceLaunchCommand } from '@yiru/protocol/setup/agent-sequencing'
import { CLIENT_PLATFORM } from '~renderer/new-workspace/workspace-creation'
import type { useAppStore } from '~renderer/store/state'

import type { ManagedPane } from '../pane-manager/pane-manager'
import { resolveTerminalPasteRuntime } from '../paste/runtime'
import { executeTerminalStartupCommandPaste } from '../terminal-startup-command-paste'
import {
  createColdRestoreAgentStartup,
  type ColdRestoreAgentResumeStartup,
  type ColdRestoreAgentStartup
} from './cold-restore-agent-startup'
import type { PtyConnectionDeps } from './connection-types'
import type { FreshSpawnOptions, PendingStartupCommand } from './fresh-spawn'
import type { SleepingAgentRecordEntry } from './sleeping-agent-record'
import {
  createStartupCommandDelivery,
  type StartupCommandDeliveryController
} from './startup-command-delivery'
import { createStartupDraftPaste, type StartupDraftPaste } from './startup-draft-paste'
import type { StartupLaunch } from './startup-launch'
import type { PtyTransport } from './transport-types'

type FreshSpawn = (
  startup?: PendingStartupCommand | ColdRestoreAgentResumeStartup | null,
  options?: FreshSpawnOptions
) => Promise<string | null>

type StartupSessionOptions = {
  pane: ManagedPane
  paneKey: string
  tabId: string
  worktreeId: string
  startup: PtyConnectionDeps['startup']
  launch: StartupLaunch
  transport: PtyTransport
  connectionId: string | null
  isNativeWindowsConpty: boolean
  useTerminalPaste: boolean
  getIsDisposed: () => boolean
  getIsCurrentTransport: () => boolean
  getResumePlatform: () => NodeJS.Platform
  getSleepingRecord: (
    state: ReturnType<typeof useAppStore.getState>
  ) => SleepingAgentRecordEntry | null
  waitForOutputParsed: () => Promise<void>
  recordInput: () => void
  showSessionRestored: () => void
}

export type StartupSession = {
  draftPaste: StartupDraftPaste
  commandDelivery: StartupCommandDeliveryController
  coldRestore: ColdRestoreAgentStartup
  setFreshSpawn: (spawn: FreshSpawn) => void
  startColdRestore: (
    startup?: ColdRestoreAgentResumeStartup | null,
    options?: FreshSpawnOptions
  ) => Promise<string | null>
  dispose: () => void
}

export function createStartupSession(options: StartupSessionOptions): StartupSession {
  let freshSpawn: FreshSpawn | null = null
  const initialCommand: PendingStartupCommand | null =
    options.useTerminalPaste || options.connectionId
      ? options.startup?.command
        ? { command: options.startup.command }
        : null
      : null
  const ownsDraftPaste = options.launch.claimDraftPaste()
  const draftPaste = createStartupDraftPaste({
    ownsPaste: ownsDraftPaste,
    prompt: options.launch.draftPrompt,
    readySignal: options.launch.draftReadySignal,
    expectedProcess: options.launch.expectedProcess,
    worktreeId: options.worktreeId,
    transport: options.transport,
    getCurrentPtyId: () => {
      const ptyId = options.transport.getPtyId()
      return ptyId && !options.getIsDisposed() && options.getIsCurrentTransport() ? ptyId : null
    },
    onAttempt: options.launch.markDraftPasteAttempted,
    onInputRecorded: options.recordInput
  })
  if (ownsDraftPaste && !options.connectionId && !options.useTerminalPaste) {
    draftPaste.arm()
  }
  const isPasteTargetCurrent = (ptyId: string | null): boolean =>
    !options.getIsDisposed() &&
    options.getIsCurrentTransport() &&
    options.transport.getPtyId() === ptyId
  const runTerminalPasteCommand = async (command: string): Promise<boolean> => {
    const ptyId = options.transport.getPtyId()
    const result = await executeTerminalStartupCommandPaste({
      command,
      pane: options.pane,
      ptyId,
      runtime: resolveTerminalPasteRuntime({
        platform: CLIENT_PLATFORM,
        ptyId,
        connectionId: options.connectionId,
        transport: options.transport,
        isWindowsConpty: options.isNativeWindowsConpty
      }),
      transport: options.transport,
      isTargetCurrent: isPasteTargetCurrent
    })
    return result.status === 'pasted' && isPasteTargetCurrent(ptyId)
      ? options.transport.sendInput('\r')
      : false
  }
  const commandDelivery = createStartupCommandDelivery({
    initialCommand,
    commandHint: resolveSetupAgentSequenceLaunchCommand(
      options.startup?.env ?? {},
      options.startup?.command
    ),
    configuredDelivery: options.startup?.startupCommandDelivery,
    hasSshConnection: Boolean(options.connectionId),
    useTerminalPaste: options.useTerminalPaste,
    getIsDisposed: options.getIsDisposed,
    waitForOutputParsed: options.waitForOutputParsed,
    submit: async (command) =>
      options.useTerminalPaste
        ? runTerminalPasteCommand(command)
        : options.transport.sendInput(`${command}\r`),
    onSubmitted: draftPaste.arm,
    onRejected: options.launch.releaseUnattemptedDraftPaste
  })
  const coldRestore = createColdRestoreAgentStartup({
    paneKey: options.paneKey,
    tabId: options.tabId,
    leafId: options.pane.leafId,
    hasPendingStartupCommand: commandDelivery.hasPending,
    getResumePlatform: options.getResumePlatform,
    getSleepingRecord: options.getSleepingRecord
  })
  const startColdRestore = (
    startup: ColdRestoreAgentResumeStartup | null = coldRestore.build(),
    spawnOptions: FreshSpawnOptions = {}
  ): Promise<string | null> => {
    coldRestore.register(startup)
    return freshSpawn ? freshSpawn(startup, spawnOptions) : Promise.resolve(null)
  }

  return {
    draftPaste,
    commandDelivery,
    coldRestore,
    setFreshSpawn: (spawn) => {
      freshSpawn = spawn
    },
    startColdRestore,
    dispose: () => {
      commandDelivery.dispose()
      draftPaste.dispose()
    }
  }
}
