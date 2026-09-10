import type { WorktreeSetupLaunch } from '@agentstart/protocol/worktree/create-result'

import { buildSetupRunnerCommand } from '../setup/runner'
import { useAppStore } from '../store/state'
import type { WorktreeActivationStore } from './activation-types'

export function queueWorktreeSetupCommands(
  store: WorktreeActivationStore,
  worktreeId: string,
  terminalTabId: string,
  setup: WorktreeSetupLaunch | undefined,
  wrappedSetupCommand: string | undefined,
  options: { activateCreatedTabs?: boolean } | undefined
): void {
  if (!setup) {
    return
  }
  const mode = useAppStore.getState().settings?.setupScriptLaunchMode ?? 'new-tab'
  const setupCommand = {
    command:
      wrappedSetupCommand ?? setup.command ?? buildSetupRunnerCommand(setup.runnerScriptPath),
    env: setup.envVars
  }
  if (mode === 'new-tab') {
    const setupTab = store.createTab(worktreeId, undefined, undefined, {
      recordInteraction: false,
      ...(options?.activateCreatedTabs === false ? { activate: false } : {})
    })
    // Why: createTab activates by default; setup is intentionally unattended
    // so restore focus to the primary terminal.
    if (options?.activateCreatedTabs !== false) {
      store.setActiveTab(terminalTabId)
    }
    store.setTabCustomTitle(setupTab.id, 'Setup', { recordInteraction: false })
    store.queueTabStartupCommand(setupTab.id, setupCommand)
    return
  }
  store.queueTabSetupSplit(terminalTabId, {
    ...setupCommand,
    direction: mode === 'split-horizontal' ? 'horizontal' : 'vertical'
  })
}
