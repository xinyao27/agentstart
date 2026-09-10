import { parseRuntimePtyId } from '@agentstart/protocol/terminal-identity'
import { makePaneKey } from '@agentstart/protocol/terminal/pane-identity'
import {
  activateTerminalInitiatedWorktree,
  focusTerminalInitiatedTab,
  isRuntimeEnvironmentActive
} from '~renderer/application-shell/use-ipc-events'
import { SPLIT_TERMINAL_PANE_EVENT } from '~renderer/constants/terminal'
import type { SplitTerminalPaneDetail } from '~renderer/constants/terminal'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'
import { singlePaneLayoutSnapshot } from '~renderer/terminal/state/layout-state'

import type { TerminalRevealRequest, TerminalRevealResult } from './shell-host/terminal-request'
import { resolveTerminalPresentation } from './terminal-create-presentation'
import { activateExistingLeafInLayout, addSplitLeafToLayout } from './terminal-reveal-split-layout'

function tryMakePaneKey(tabId: string, leafId: string): string | null {
  try {
    return makePaneKey(tabId, leafId)
  } catch {
    return null
  }
}

// Why: reveal adopts a PTY already spawned by the daemon; create owns a new
// renderer surface and therefore has a different lifecycle.
export function revealTerminalSessionViaShell(input: TerminalRevealRequest): TerminalRevealResult {
  if (isRuntimeEnvironmentActive() && input.source !== 'runtime-session') {
    throw new Error(
      translate(
        'auto.hooks.useIpcEvents.60428567b4',
        'Local terminal reveal is unavailable while a remote runtime is active'
      )
    )
  }
  const {
    worktreeId,
    ptyId,
    durablePtyId,
    title,
    cwd,
    launchConfig,
    launchToken,
    launchAgent,
    activate,
    presentation,
    tabId,
    leafId,
    splitFromLeafId,
    splitDirection,
    splitTelemetrySource
  } = input
  const store = useAppStore.getState()
  const runtimePtyId = parseRuntimePtyId(ptyId)
  if (runtimePtyId && durablePtyId) {
    store.rememberTerminalSessionId(runtimePtyId.handle, durablePtyId, runtimePtyId.environmentId)
  }
  const terminalPresentation = resolveTerminalPresentation({ presentation, activate })
  const shouldActivate = terminalPresentation === 'focused'
  const shouldSurfaceOwner = terminalPresentation !== 'background'
  if (shouldActivate) {
    activateTerminalInitiatedWorktree(store, worktreeId)
  }
  const worktreeTabs = store.tabsByWorktree[worktreeId] ?? []
  const existingTab = worktreeTabs.find(
    (candidate) =>
      candidate.ptyId === ptyId || (store.ptyIdsByTabId[candidate.id] ?? []).includes(ptyId)
  )
  const isSplitReveal = Boolean(tabId && leafId && splitFromLeafId)
  const splitTargetTab = isSplitReveal
    ? worktreeTabs.find((candidate) => candidate.id === tabId)
    : undefined
  if (isSplitReveal && !splitTargetTab) {
    throw new Error(`Terminal tab ${tabId} not found`)
  }
  const hintedPendingTab =
    tabId && !isSplitReveal
      ? worktreeTabs.find((candidate) => {
          if (candidate.id !== tabId) {
            return false
          }
          const candidatePtyIds = store.ptyIdsByTabId[candidate.id] ?? []
          return candidate.ptyId == null && candidatePtyIds.length === 0
        })
      : undefined
  // Why: runtime fallback can reveal a PTY for a renderer-created pending
  // tab; that id collision is adoption only until another PTY is already
  // associated with the hinted tab.
  const reusedTab = existingTab ?? splitTargetTab ?? hintedPendingTab
  const tab =
    reusedTab ??
    store.createTab(worktreeId, undefined, undefined, {
      initialPtyId: ptyId,
      activate: shouldActivate,
      ...(launchAgent
        ? {
            launchAgent
          }
        : {}),
      ...(cwd ? { startupCwd: cwd } : {}),
      // Why: tabId hint comes from CLI-spawned PTYs whose env already has the
      // pane key baked in. Adopting the tab under the same id keeps
      // hook-event attribution working.
      ...(tabId !== undefined ? { id: tabId } : {})
    })
  // Why: when an existing tab already owns this ptyId, we reuse it instead of
  // minting a new one — but the PTY env already carries a paneKey from main.
  // If the existing tab id doesn't match the hint, hook attribution degrades
  // for that PTY's lifetime. Warn so this is visible during development.
  if (tabId !== undefined && tab.id !== tabId) {
    console.warn(
      `[revealTerminalSessionViaShell] tabId hint ${tabId} ignored for ptyId ${ptyId}; existing tab ${tab.id} adopted instead (hook attribution will degrade for this terminal)`
    )
  }
  if (shouldActivate) {
    store.setActiveTabType('terminal')
    store.setActiveTab(tab.id)
  }
  if (shouldSurfaceOwner) {
    store.revealWorktreeInSidebar(worktreeId)
    focusTerminalInitiatedTab(tab.id, leafId)
  }
  // Why: only stamp the runtime-supplied title on freshly created tabs.
  // Existing tabs may have a user customTitle (set via UI rename) that the
  // runtime's stored title would otherwise silently overwrite on every focus.
  if (title && !reusedTab) {
    store.setTabCustomTitle(tab.id, title, { recordInteraction: false })
  }
  if (leafId) {
    const launchPaneKey = tryMakePaneKey(tab.id, leafId)
    if (launchConfig) {
      if (launchPaneKey) {
        store.registerAgentLaunchConfig(launchPaneKey, launchConfig, {
          ...(launchAgent ? { agentType: launchAgent } : {}),
          ...(launchToken ? { launchToken } : {}),
          tabId: tab.id,
          leafId
        })
      }
    } else if (!splitFromLeafId && launchPaneKey) {
      store.clearAgentLaunchConfig(launchPaneKey)
    }
    if (splitFromLeafId) {
      // Why: runtime-spawned split PTYs already carry the parent tab's
      // paneKey. Reusing the existing tab preserves native split-pane
      // behavior instead of letting createTab mint a collision tab.
      store.updateTabPtyId(tab.id, ptyId)
      const existingLayout = store.terminalLayoutsByTabId?.[tab.id]
      const sourcePtyId = existingLayout?.ptyIdsByLeafId?.[splitFromLeafId]
      store.setTabLayout(
        tab.id,
        addSplitLeafToLayout(
          existingLayout,
          splitFromLeafId,
          leafId,
          ptyId,
          splitDirection ?? 'horizontal',
          title,
          shouldActivate
        )
      )
      window.dispatchEvent(
        new CustomEvent<SplitTerminalPaneDetail>(SPLIT_TERMINAL_PANE_EVENT, {
          detail: {
            tabId: tab.id,
            paneRuntimeId: -1,
            direction: splitDirection ?? 'horizontal',
            sourceLeafId: splitFromLeafId,
            sourcePtyId,
            telemetrySource: splitTelemetrySource,
            newLeafId: leafId,
            ptyId
          }
        })
      )
    } else {
      // Why: CLI/runtime-spawned PTYs emit hook events before a hidden tab
      // mounts TerminalPane, so the adopted UUID leaf must exist in layout
      // state for paneKey validation to accept them.
      const existingLayout = reusedTab
        ? activateExistingLeafInLayout(store.terminalLayoutsByTabId?.[tab.id], leafId, ptyId, title)
        : null
      if (existingLayout) {
        store.updateTabPtyId(tab.id, ptyId)
        store.setTabLayout(tab.id, existingLayout)
      } else {
        store.setTabLayout(tab.id, singlePaneLayoutSnapshot(leafId, ptyId, title))
      }
    }
  }
  return { tabId: tab.id, title: title ?? tab.title }
}
