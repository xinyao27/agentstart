import type { TuiAgent } from '@agentstart/protocol/agent/types'
import { runtimePtyEnvironmentId } from '@agentstart/protocol/terminal-identity'
import type { TerminalLayoutSnapshot } from '@agentstart/protocol/workspace/session'
import type { TerminalTab } from '@agentstart/protocol/workspace/tabs'
import { sanitizeTerminalLayoutPaneTitlesForLabels } from '~renderer/terminal-pane/title-sanitization'

import { resolveTerminalLayoutRoot } from '../remote-terminal-layout-resolution'
import {
  HOST_TERMINAL_SURFACE_SEPARATOR,
  toRemoteTerminalSurfaceTabId,
  REMOTE_TERMINAL_SURFACE_TAB_PREFIX
} from '../remote-terminal-surface-id'
import type { RuntimeMobileSessionTabsResult } from './session-model'
import type {
  ReadyBrowserSurface,
  ReadyEditorSurface,
  ReadyTerminalSurface,
  TerminalSurface
} from './tabs-state'

export function isReadyTerminalTab(
  tab: RuntimeMobileSessionTabsResult['tabs'][number]
): tab is ReadyTerminalSurface {
  return tab.type === 'terminal' && tab.status === 'ready' && tab.terminal.trim().length > 0
}

export function isTerminalSurfaceTab(
  tab: RuntimeMobileSessionTabsResult['tabs'][number]
): tab is TerminalSurface {
  return tab.type === 'terminal'
}

export function isReadyBrowserTab(
  tab: RuntimeMobileSessionTabsResult['tabs'][number]
): tab is ReadyBrowserSurface {
  return tab.type === 'browser' && typeof tab.browserPageId === 'string' && tab.browserPageId !== ''
}

export function isReadyEditorTab(
  tab: RuntimeMobileSessionTabsResult['tabs'][number]
): tab is ReadyEditorSurface {
  return tab.type === 'markdown' || tab.type === 'file'
}

export function localEditorFileId(tab: ReadyEditorSurface): string {
  if (tab.type === 'markdown' && tab.mode === 'markdown-preview') {
    return `markdown-preview::${tab.sourceFilePath}`
  }
  return tab.filePath
}

export function editorSourceFileId(tab: ReadyEditorSurface): string | undefined {
  return tab.type === 'markdown' && tab.mode === 'markdown-preview' ? tab.sourceFilePath : undefined
}

function isRuntimeTerminalTabForEnvironment(tab: TerminalTab, environmentId: string): boolean {
  if (!tab.ptyId) {
    return false
  }
  return runtimePtyEnvironmentId(tab.ptyId) === environmentId
}

function isMirroredTerminalSurfaceId(tabId: string): boolean {
  return (
    tabId.startsWith(REMOTE_TERMINAL_SURFACE_TAB_PREFIX) ||
    tabId.includes(HOST_TERMINAL_SURFACE_SEPARATOR)
  )
}

export function chooseRemoteTerminalLayout(
  surfaces: readonly TerminalSurface[],
  ptyIdsByLeafId: Record<string, string>,
  existingLayout?: TerminalLayoutSnapshot
): TerminalLayoutSnapshot {
  const leafIds = surfaces.map((surface) => surface.leafId)
  const knownLeafIds = new Set(leafIds)
  const parentLayoutSource = surfaces.find((surface) => surface.parentLayout)
  const parentLayout = parentLayoutSource?.parentLayout
    ? sanitizeTerminalLayoutPaneTitlesForLabels(parentLayoutSource.parentLayout, [
        parentLayoutSource.title
      ])
    : undefined
  const activeLeafId =
    // Why: host title/status snapshots may still mark an agent pane active
    // after this client selected a different split pane.
    (existingLayout?.activeLeafId && knownLeafIds.has(existingLayout.activeLeafId)
      ? existingLayout.activeLeafId
      : null) ??
    (parentLayout?.activeLeafId && knownLeafIds.has(parentLayout.activeLeafId)
      ? parentLayout.activeLeafId
      : null) ??
    surfaces.find((surface) => surface.isActive)?.leafId ??
    leafIds[0] ??
    null
  const expandedLeafId =
    parentLayout?.expandedLeafId && knownLeafIds.has(parentLayout.expandedLeafId)
      ? parentLayout.expandedLeafId
      : null
  return {
    // Why: the host's parentLayout is authoritative (carries the real split
    // direction); only if it doesn't cover the current leaves do we keep the
    // prior client tree, then degenerate — never re-guess a direction.
    root: resolveTerminalLayoutRoot({
      authoritativeRoot: parentLayout?.root,
      existingRoot: existingLayout?.root,
      leafIds,
      onSynthesize: (leafCount) =>
        console.warn(
          `[remote-session-tabs-sync] synthesized layout for ${leafCount} leaves; no authoritative or prior tree covered them`
        )
    }),
    activeLeafId,
    expandedLeafId,
    ptyIdsByLeafId,
    // Why: surface.title is the tab/PTY label ("Terminal 2", agent title,
    // etc.). Restoring it as a pane title makes the web client render a fake
    // title bar above xterm. Only host layout titles are real user pane titles.
    ...(parentLayout?.titlesByLeafId ? { titlesByLeafId: parentLayout.titlesByLeafId } : {})
  }
}

export function shouldReplaceTerminalTab(
  tab: TerminalTab,
  environmentId: string,
  nextRemotePtyIds: ReadonlySet<string>,
  nextMirroredTerminalIds: ReadonlySet<string>,
  nextMirroredLaunchAgents: ReadonlySet<TuiAgent>
): boolean {
  if (
    tab.launchAgent &&
    !isMirroredTerminalSurfaceId(tab.id) &&
    nextMirroredLaunchAgents.has(tab.launchAgent)
  ) {
    // Why: paired web agent quick-launch used to create local-only tabs before
    // the host snapshot landed. Retire only the matching agent's stale row.
    return true
  }
  if (isMirroredTerminalSurfaceId(tab.id)) {
    // Why: host session snapshots are authoritative for host-mirrored tabs.
    // Replace old mirrors even when the next surface is still waiting on a
    // stream handle, otherwise paired web keeps stale handles or drops parity.
    return true
  }
  if (tab.pendingActivationSpawn && tab.ptyId === null && nextRemotePtyIds.size > 0) {
    return true
  }
  if (!isRuntimeTerminalTabForEnvironment(tab, environmentId)) {
    return false
  }
  // Why: web-created remote tabs use local UUIDs until the host publishes the
  // corresponding session surface. Only retire them once their PTY is present
  // in the host snapshot, while always pruning prior mirrored surface IDs.
  return (
    tab.ptyId !== null &&
    (nextRemotePtyIds.has(tab.ptyId) ||
      nextMirroredTerminalIds.has(toRemoteTerminalSurfaceTabId(tab.id)))
  )
}

/**
 * Constructs mirrored terminal tabs from the mobile session status payload,
 * normalising Pi-compatible agent titles under launch ownership.
 */
