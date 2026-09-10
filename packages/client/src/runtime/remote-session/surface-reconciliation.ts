import type { TuiAgent } from '@agentstart/protocol/agent/types'
import { encodeRuntimePtyId } from '@agentstart/protocol/terminal-identity'

import { toRemoteTerminalSurfaceTabId } from '../remote-terminal-surface-id'
import { buildHostGroupIdByTabId, chooseTargetGroupId } from './group-mirror'
import type { RuntimeMobileSessionTabsResult } from './session-model'
import { sameOpenFiles } from './store-equality'
import {
  browserWorkspaceHasRemoteEnvironmentPage,
  buildMirroredBrowserTabs,
  buildMirroredEditorTabs,
  buildTerminalUnifiedTab
} from './surface-mirror'
import type { RemoteSessionTabsSyncState } from './tabs-state'
import {
  isReadyBrowserTab,
  isReadyEditorTab,
  isReadyTerminalTab,
  isTerminalSurfaceTab,
  shouldReplaceTerminalTab
} from './terminal-layout'
import { buildMirroredTerminalTabs } from './terminal-mirror'

export function buildRemoteSessionSurfaceMirror(input: {
  state: RemoteSessionTabsSyncState
  snapshot: RuntimeMobileSessionTabsResult
  environmentId: string
  now: number
  worktreeId: string
}) {
  const { state, snapshot, environmentId, now, worktreeId } = input
  const currentTerminalTabs = state.tabsByWorktree[worktreeId] ?? []
  const existingTerminalById = new Map(currentTerminalTabs.map((tab) => [tab.id, tab]))
  const terminalSurfaceTabs = snapshot.tabs.filter(isTerminalSurfaceTab)
  const readyTerminalTabs = terminalSurfaceTabs.filter(isReadyTerminalTab)
  const nextRemotePtyIds = new Set(
    readyTerminalTabs.map((tab) => encodeRuntimePtyId(tab.terminal, environmentId))
  )
  const nextMirroredTerminalIds = new Set(
    terminalSurfaceTabs.map((tab) => toRemoteTerminalSurfaceTabId(tab.parentTabId))
  )
  const nextMirroredLaunchAgents = new Set(
    terminalSurfaceTabs
      .map((tab) => tab.launchAgent)
      .filter((agent): agent is TuiAgent => Boolean(agent))
  )
  const retainedTerminalTabs = currentTerminalTabs.filter(
    (tab) =>
      !shouldReplaceTerminalTab(
        tab,
        environmentId,
        nextRemotePtyIds,
        nextMirroredTerminalIds,
        nextMirroredLaunchAgents
      )
  )
  const mirroredTerminalTabs = buildMirroredTerminalTabs(
    snapshot,
    environmentId,
    existingTerminalById,
    state.terminalLayoutsByTabId,
    retainedTerminalTabs.length,
    now
  )
  const mirroredTerminalTabEntries = mirroredTerminalTabs.map((entry) => entry.tab)
  const retainedTerminalIds = new Set(retainedTerminalTabs.map((tab) => tab.id))
  const nextTerminalTabs =
    retainedTerminalTabs.length + mirroredTerminalTabEntries.length > 0
      ? [...retainedTerminalTabs, ...mirroredTerminalTabEntries]
      : null
  const mirroredTerminalIds = new Set(mirroredTerminalTabEntries.map((tab) => tab.id))
  const removedTerminalIds = new Set(
    currentTerminalTabs.filter((tab) => !retainedTerminalIds.has(tab.id)).map((tab) => tab.id)
  )
  const targetGroupId = chooseTargetGroupId(state, snapshot)
  const hostGroupIdByTabId = buildHostGroupIdByTabId(snapshot.tabGroups)
  const readyBrowserTabs = snapshot.tabs.filter(isReadyBrowserTab)
  const nextRemoteBrowserPageIds = new Set(readyBrowserTabs.map((tab) => tab.browserPageId))
  const mirroredBrowserTabs = buildMirroredBrowserTabs(
    snapshot,
    environmentId,
    state,
    hostGroupIdByTabId,
    targetGroupId,
    mirroredTerminalTabEntries.length,
    now
  )
  const mirroredBrowserWorkspaceIds = new Set(
    mirroredBrowserTabs.map((entry) => entry.workspace.id)
  )
  const currentBrowserTabs = state.browserTabsByWorktree[worktreeId] ?? []
  const removedBrowserWorkspaceIds = new Set(
    currentBrowserTabs
      .filter((tab) => {
        if (mirroredBrowserWorkspaceIds.has(tab.id)) {
          return true
        }
        if (!browserWorkspaceHasRemoteEnvironmentPage(state, tab, environmentId)) {
          return false
        }
        return !(state.browserPagesByWorkspace[tab.id] ?? []).some((page) => {
          const handle = state.remoteBrowserPageHandlesByPageId[page.id]
          return (
            handle?.environmentId === environmentId &&
            nextRemoteBrowserPageIds.has(handle.remotePageId)
          )
        })
      })
      .map((tab) => tab.id)
  )
  const retainedBrowserTabs = currentBrowserTabs.filter(
    (tab) => !removedBrowserWorkspaceIds.has(tab.id)
  )
  const nextBrowserTabs =
    retainedBrowserTabs.length + mirroredBrowserTabs.length > 0
      ? [...retainedBrowserTabs, ...mirroredBrowserTabs.map((entry) => entry.workspace)]
      : null
  const readyEditorTabs = snapshot.tabs.filter(isReadyEditorTab)
  const mirroredEditorTabs = buildMirroredEditorTabs(
    snapshot,
    environmentId,
    state,
    hostGroupIdByTabId,
    targetGroupId,
    mirroredTerminalTabEntries.length + mirroredBrowserTabs.length,
    now
  )
  const mirroredEditorFileIds = new Set(mirroredEditorTabs.map((entry) => entry.file.id))
  const mirroredEditorHostTabIds = new Set(mirroredEditorTabs.map((entry) => entry.hostTabId))
  const removedEditorFileIds = new Set(
    state.openFiles
      .filter(
        (file) =>
          file.worktreeId === worktreeId &&
          file.runtimeEnvironmentId === environmentId &&
          (file.mode === 'edit' || file.mode === 'markdown-preview') &&
          // Why: only cull tabs that came from the host mirror. Files the web
          // user opened locally have no host counterpart, so a snapshot that
          // omits them is not a signal to close them.
          file.mirroredFromRuntimeSession === true &&
          !mirroredEditorFileIds.has(file.id)
      )
      .map((file) => file.id)
  )
  const nextOpenFiles = (() => {
    const retained = state.openFiles.filter(
      (file) =>
        !(
          file.worktreeId === worktreeId &&
          file.runtimeEnvironmentId === environmentId &&
          (removedEditorFileIds.has(file.id) || mirroredEditorFileIds.has(file.id))
        )
    )
    const next = [...retained, ...mirroredEditorTabs.map((entry) => entry.file)]
    return sameOpenFiles(state.openFiles, next) ? state.openFiles : next
  })()
  const currentUnifiedTabs = state.unifiedTabsByWorktree[worktreeId] ?? []
  const retainedUnifiedTabs = currentUnifiedTabs.filter((tab) => {
    if (tab.contentType === 'browser') {
      return (
        !removedBrowserWorkspaceIds.has(tab.entityId) &&
        !mirroredBrowserWorkspaceIds.has(tab.entityId)
      )
    }
    if (tab.contentType === 'editor') {
      return (
        !removedEditorFileIds.has(tab.entityId) &&
        !mirroredEditorFileIds.has(tab.entityId) &&
        !mirroredEditorHostTabIds.has(tab.id)
      )
    }
    if (tab.contentType !== 'terminal') {
      return true
    }
    if (removedTerminalIds.has(tab.entityId) || removedTerminalIds.has(tab.id)) {
      return false
    }
    return !mirroredTerminalIds.has(tab.entityId) && !mirroredTerminalIds.has(tab.id)
  })
  const mirroredTerminalUnifiedTabs = mirroredTerminalTabs.map((entry) =>
    buildTerminalUnifiedTab(entry.tab, hostGroupIdByTabId.get(entry.hostTabId) ?? targetGroupId)
  )
  const mirroredBrowserUnifiedTabs = mirroredBrowserTabs.map((entry) => entry.unifiedTab)
  const mirroredEditorUnifiedTabs = mirroredEditorTabs.map((entry) => entry.unifiedTab)
  const mirroredUnifiedTabs = [
    ...mirroredTerminalUnifiedTabs,
    ...mirroredBrowserUnifiedTabs,
    ...mirroredEditorUnifiedTabs
  ]
  const nextUnifiedTabs =
    retainedUnifiedTabs.length + mirroredUnifiedTabs.length > 0
      ? [...retainedUnifiedTabs, ...mirroredUnifiedTabs]
      : null
  return {
    currentTerminalTabs,
    existingTerminalById,
    terminalSurfaceTabs,
    readyTerminalTabs,
    nextRemotePtyIds,
    nextMirroredTerminalIds,
    nextMirroredLaunchAgents,
    retainedTerminalTabs,
    mirroredTerminalTabs,
    mirroredTerminalTabEntries,
    retainedTerminalIds,
    nextTerminalTabs,
    mirroredTerminalIds,
    removedTerminalIds,
    targetGroupId,
    hostGroupIdByTabId,
    readyBrowserTabs,
    nextRemoteBrowserPageIds,
    mirroredBrowserTabs,
    mirroredBrowserWorkspaceIds,
    currentBrowserTabs,
    removedBrowserWorkspaceIds,
    retainedBrowserTabs,
    nextBrowserTabs,
    readyEditorTabs,
    mirroredEditorTabs,
    mirroredEditorFileIds,
    mirroredEditorHostTabIds,
    removedEditorFileIds,
    nextOpenFiles,
    currentUnifiedTabs,
    retainedUnifiedTabs,
    mirroredTerminalUnifiedTabs,
    mirroredBrowserUnifiedTabs,
    mirroredEditorUnifiedTabs,
    mirroredUnifiedTabs,
    nextUnifiedTabs
  }
}
