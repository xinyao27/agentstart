import { createSequencedSetupAgentCommands } from '@agentstart/protocol/setup/agent-sequencing'
import { getSetupRunnerCommandPlatformForPath } from '@agentstart/protocol/setup/runner-command'
import type {
  WorktreeDefaultTabsLaunch,
  WorktreeSetupLaunch
} from '@agentstart/protocol/worktree/create-result'
import { createBrowserUuid } from '~renderer/browser/uuid'

import { queueHookCommandsForFirstWorktreeTab } from '../agent/hook-command-delivery'
import { isRemoteRuntimeSessionActive } from '../runtime/remote-runtime-session'
import { useAppStore } from '../store/state'
import { shouldAutoCreateInitialTerminal } from '../terminal/initial-terminal'
import type { WorktreeActivationStore, WorktreeStartupPayload } from './activation-types'
import { applyDefaultTerminalTabs, resolveStartupAgent } from './default-tabs'
import { getRuntimeEnvironmentIdForWorktree } from './runtime-owner'
import { queueWorktreeSetupCommands } from './setup-commands'

export function ensureWorktreeHasInitialTerminal(
  store: WorktreeActivationStore,
  worktreeId: string,
  startup?: WorktreeStartupPayload,
  setup?: WorktreeSetupLaunch,
  defaultTabs?: WorktreeDefaultTabsLaunch,
  options?: { activateCreatedTabs?: boolean }
): string | null {
  const { renderableTabCount } = store.reconcileWorktreeTabModel(worktreeId)
  const ownerState =
    store.settings !== undefined || store.repos !== undefined || store.worktreesByRepo !== undefined
      ? store
      : useAppStore.getState()
  const sequenced = sequenceSetupBeforeAgent(startup, setup)
  const sequencedStartup = sequenced.startup

  // Why: paired clients mirror host tabs asynchronously. Setup fallback must
  // target an existing mirror or wait for the first one, never spawn locally.
  if (isRemoteRuntimeSessionActive(getRuntimeEnvironmentIdForWorktree(ownerState, worktreeId))) {
    const existingTerminalTabId = store.tabsByWorktree[worktreeId]?.[0]?.id
    if (existingTerminalTabId && setup) {
      queueWorktreeSetupCommands(
        store,
        worktreeId,
        existingTerminalTabId,
        setup,
        sequenced.setupCommand,
        options
      )
      return existingTerminalTabId
    }
    if (setup) {
      queueHookCommandsForFirstWorktreeTab({
        worktreeId,
        deliver: (state, firstTerminalTabId) =>
          queueWorktreeSetupCommands(
            state,
            worktreeId,
            firstTerminalTabId,
            setup,
            sequenced.setupCommand,
            options
          )
      })
    }
    return null
  }

  if (!shouldAutoCreateInitialTerminal(renderableTabCount)) {
    const existingTerminalTabId = store.tabsByWorktree[worktreeId]?.[0]?.id
    if (existingTerminalTabId && setup) {
      queueWorktreeSetupCommands(
        store,
        worktreeId,
        existingTerminalTabId,
        setup,
        sequenced.setupCommand,
        options
      )
      return existingTerminalTabId
    }
    return null
  }

  const templatedTabId = applyDefaultTerminalTabs(
    store,
    worktreeId,
    sequencedStartup,
    setup,
    defaultTabs,
    sequenced.setupCommand,
    options
  )
  if (templatedTabId) {
    return templatedTabId
  }

  const launchAgent = resolveStartupAgent(sequencedStartup)
  // Why: this tab is an activation fallback, so its spawn must not count as
  // user activity and reshuffle Recent ordering.
  const terminalTab = store.createTab(worktreeId, undefined, undefined, {
    pendingActivationSpawn: true,
    ...(launchAgent ? { launchAgent } : {}),
    ...(options?.activateCreatedTabs === false ? { activate: false } : {})
  })
  if (options?.activateCreatedTabs !== false) {
    store.setActiveTab(terminalTab.id)
  }
  if (sequencedStartup) {
    store.queueTabStartupCommand(terminalTab.id, sequencedStartup)
  }
  queueWorktreeSetupCommands(
    store,
    worktreeId,
    terminalTab.id,
    setup,
    sequenced.setupCommand,
    options
  )
  return terminalTab.id
}

function sequenceSetupBeforeAgent(
  startup: WorktreeStartupPayload | undefined,
  setup: WorktreeSetupLaunch | undefined
): { startup: WorktreeStartupPayload | undefined; setupCommand: string | undefined } {
  if (!startup || setup?.waitForAgentStartup !== true) {
    return { startup, setupCommand: undefined }
  }
  const platform = getSetupRunnerCommandPlatformForPath(
    setup.runnerScriptPath,
    navigator.userAgent.includes('Windows') ? 'windows' : 'posix'
  )
  const sequenced = createSequencedSetupAgentCommands({
    nonce: createBrowserUuid(),
    runnerScriptPath: setup.runnerScriptPath,
    startupCommand: startup.command,
    platform
  })
  return {
    startup: {
      ...startup,
      command: sequenced.startupCommand,
      ...(sequenced.startupEnv ? { env: { ...startup.env, ...sequenced.startupEnv } } : {})
    },
    setupCommand: sequenced.setupCommand
  }
}
