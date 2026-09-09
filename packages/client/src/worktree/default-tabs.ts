import type { TuiAgent } from '@yiru/protocol/agent/types'
import { agentKindToTuiAgent } from '@yiru/protocol/telemetry/agent-kind'
import type {
  WorktreeDefaultTabsLaunch,
  WorktreeSetupLaunch
} from '@yiru/protocol/worktree/create-result'

import type { WorktreeActivationStore, WorktreeStartupPayload } from './activation-types'
import { queueWorktreeSetupCommands } from './setup-commands'

export function applyDefaultTerminalTabs(
  store: WorktreeActivationStore,
  worktreeId: string,
  startup: WorktreeStartupPayload | undefined,
  setup: WorktreeSetupLaunch | undefined,
  defaultTabs: WorktreeDefaultTabsLaunch | undefined,
  wrappedSetupCommand: string | undefined,
  options: { activateCreatedTabs?: boolean } | undefined
): string | null {
  if (!defaultTabs || store.defaultTerminalTabsAppliedByWorktreeId[worktreeId]) {
    return null
  }
  store.markDefaultTerminalTabsApplied(worktreeId)
  if (defaultTabs.tabs.length === 0) {
    return null
  }
  let firstTabId: string | null = null
  for (const [index, template] of defaultTabs.tabs.entries()) {
    const isStartupTab = index === 0 && startup !== undefined
    const launchAgent = isStartupTab ? resolveStartupAgent(startup) : undefined
    const tab = store.createTab(worktreeId, undefined, undefined, {
      pendingActivationSpawn: true,
      recordInteraction: false,
      ...(launchAgent ? { launchAgent } : {}),
      ...(options?.activateCreatedTabs === false ? { activate: false } : {})
    })
    firstTabId ??= tab.id
    if (template.title) {
      store.setTabCustomTitle(tab.id, template.title, { recordInteraction: false })
    }
    if (template.color) {
      store.setTabColor(tab.id, template.color)
    }
    const templateCommand = template.command?.trim()
    if (templateCommand && defaultTabs.runCommands && !(index === 0 && startup)) {
      store.queueTabStartupCommand(tab.id, { command: templateCommand })
    }
  }
  if (!firstTabId) {
    return null
  }
  if (options?.activateCreatedTabs !== false) {
    store.setActiveTab(firstTabId)
  }
  if (startup) {
    store.queueTabStartupCommand(firstTabId, startup)
  }
  queueWorktreeSetupCommands(store, worktreeId, firstTabId, setup, wrappedSetupCommand, options)
  return firstTabId
}

export function resolveStartupAgent(
  startup: WorktreeStartupPayload | undefined
): TuiAgent | undefined {
  return (
    startup?.launchAgent ??
    (startup?.telemetry
      ? (agentKindToTuiAgent(startup.telemetry.agent_kind) ?? undefined)
      : undefined)
  )
}
