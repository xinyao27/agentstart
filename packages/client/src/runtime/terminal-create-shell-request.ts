import {
  activateTerminalInitiatedWorktree,
  focusTerminalInitiatedTab,
  isRuntimeEnvironmentActive
} from '~renderer/application-shell/use-ipc-events'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'
import type { AppState } from '~renderer/store/types'
import { requestBackgroundTerminalWorktreeMount } from '~renderer/terminal/background-terminal-worktree-mount'

import type { TerminalCreateRequest, TerminalCreateResult } from './shell-host/terminal-request'
import { resolveTerminalPresentation } from './terminal-create-presentation'

function reorderCreatedTabAfterAnchor(worktreeId: string, tabId: string, afterTabId: string): void {
  const state: AppState = useAppStore.getState()
  const createdUnifiedTab = state.unifiedTabsByWorktree[worktreeId]?.find(
    (item) => item.entityId === tabId
  )
  const anchorUnifiedTab = state.unifiedTabsByWorktree[worktreeId]?.find(
    (item) => item.id === afterTabId
  )
  if (
    !createdUnifiedTab ||
    !anchorUnifiedTab ||
    createdUnifiedTab.groupId !== anchorUnifiedTab.groupId
  ) {
    return
  }
  const group = state.groupsByWorktree[worktreeId]?.find(
    (item) => item.id === createdUnifiedTab.groupId
  )
  const order = (group?.tabOrder ?? []).filter((id) => id !== createdUnifiedTab.id)
  const anchorIndex = order.indexOf(anchorUnifiedTab.id)
  order.splice(anchorIndex === -1 ? order.length : anchorIndex + 1, 0, createdUnifiedTab.id)
  state.reorderUnifiedTabs(createdUnifiedTab.groupId, order, { recordInteraction: false })
}

// Why: create mints the surface and queues PTY startup; reveal adopts a PTY
// that the daemon already spawned, so the two lifecycles stay separate.
export function createTerminalTabViaShell(input: TerminalCreateRequest): TerminalCreateResult {
  // Why: runtime-session requests are host-owned tabs materialized by this
  // renderer, not ordinary local creates that bypass remote runtime mode.
  if (isRuntimeEnvironmentActive() && input.source !== 'runtime-session') {
    throw new Error(
      translate(
        'auto.hooks.useIpcEvents.7a64b31991',
        'Local terminal creation is unavailable while a remote runtime is active'
      )
    )
  }
  const store = useAppStore.getState()
  const worktreeId = input.worktreeId ?? store.activeWorktreeId
  if (!worktreeId) {
    throw new Error(translate('auto.hooks.useIpcEvents.f000b2ff76', 'No active worktree'))
  }
  const terminalPresentation = resolveTerminalPresentation(input)
  const shouldActivate = terminalPresentation === 'focused'
  const shouldSurfaceOwner = terminalPresentation !== 'background'
  if (shouldActivate) {
    activateTerminalInitiatedWorktree(store, worktreeId)
  }
  // Why: the paired launch client already resolved the initial mode, so its
  // explicit choice must win over this host renderer's local default.
  const tabOptions = input.launchAgent
    ? {
        ...(shouldActivate ? {} : { activate: false, recordInteraction: false }),
        launchAgent: input.launchAgent,
        ...(input.cwd ? { startupCwd: input.cwd } : {})
      }
    : shouldActivate
      ? input.cwd
        ? { startupCwd: input.cwd }
        : undefined
      : {
          activate: false,
          recordInteraction: false,
          ...(input.cwd ? { startupCwd: input.cwd } : {})
        }
  const tab = store.createTab(worktreeId, input.targetGroupId, undefined, tabOptions)
  if (!shouldActivate) {
    // Why: renderer-backed Codex startup must mount its new TerminalPane
    // without switching UI or connecting every saved tab in the worktree.
    requestBackgroundTerminalWorktreeMount({ worktreeId, tabIds: [tab.id] })
  }
  if (input.afterTabId) {
    reorderCreatedTabAfterAnchor(worktreeId, tab.id, input.afterTabId)
  }
  if (shouldActivate) {
    store.setActiveTabType('terminal')
    store.setActiveTab(tab.id)
  }
  if (shouldSurfaceOwner) {
    store.revealWorktreeInSidebar(worktreeId)
    focusTerminalInitiatedTab(tab.id)
  }
  if (input.title) {
    store.setTabCustomTitle(tab.id, input.title, { recordInteraction: false })
  }
  if (input.command) {
    store.queueTabStartupCommand(tab.id, {
      command: input.command,
      ...(input.env ? { env: input.env } : {}),
      ...(input.envToDelete ? { envToDelete: input.envToDelete } : {}),
      ...(input.launchConfig ? { launchConfig: input.launchConfig } : {}),
      ...(input.launchToken ? { launchToken: input.launchToken } : {}),
      ...(input.launchAgent ? { launchAgent: input.launchAgent } : {}),
      ...(input.startupCommandDelivery
        ? { startupCommandDelivery: input.startupCommandDelivery }
        : {})
    })
  }
  return { tabId: tab.id, title: input.title ?? tab.title }
}
