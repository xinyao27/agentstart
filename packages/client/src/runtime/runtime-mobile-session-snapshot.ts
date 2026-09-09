import type { TabGroup } from '@yiru/protocol/workspace/tabs'
import { createBrowserUuid } from '~renderer/browser/uuid'
import type { AppState } from '~renderer/store/types'
import { getSystemPrefersDark } from '~renderer/terminal/theme'

import type {
  RuntimeMobileSessionSnapshotTab,
  RuntimeMobileSessionTabGroup,
  RuntimeMobileSessionTabsSnapshot
} from './remote-session/session-model'
import { getBrowserTabsByWorktree } from './runtime-mobile-browser-state'
import { buildMobileBrowserTab } from './runtime-mobile-browser-tab'
import {
  buildMobileFileTab,
  buildMobileMarkdownTab,
  isMobilePublishableOpenFile
} from './runtime-mobile-editor-tab'
import {
  buildMobileSessionGroupProjection,
  getEditorUnifiedTabsForWorktree,
  pruneTabGroupLayout
} from './runtime-mobile-session-groups'
import { resolveMobileSessionSnapshotHost } from './runtime-mobile-session-host'
import { getEditorDraftVersionByFileId, getOpenFileIndexes } from './runtime-mobile-session-indexes'
import { buildMobileTerminalSurfaceTabs } from './runtime-mobile-terminal-tab'
import { isWebOnlyMirroredTerminalTab } from './runtime-terminal-visibility'

type FallbackEditorTabTarget = {
  tabId: string
  groupId: string | null
}

let mobileSessionSnapshotVersion = 0
const mobileSessionPublicationEpoch = `renderer:${createBrowserUuid()}`
const EMPTY_LAYOUT_BY_WORKTREE: AppState['layoutByWorktree'] = {}

export function buildMobileSessionTabSnapshots(
  state: AppState,
  systemPrefersDark = getSystemPrefersDark()
): RuntimeMobileSessionTabsSnapshot[] {
  // Why: mobile publication can run on high-frequency background agent title
  // ticks. Cache open-file indexes and draft hashes by immutable store-slice
  // reference so title-only syncs do not rescan or rehash editor state.
  const openFileIndexes = getOpenFileIndexes(state.openFiles)
  const editorDraftVersionByFileId = getEditorDraftVersionByFileId(state.editorDrafts)
  const worktreeIds = new Set<string>([
    ...Object.keys(state.tabsByWorktree),
    ...Object.keys(state.groupsByWorktree),
    ...Object.keys(state.unifiedTabsByWorktree),
    ...Object.keys(getBrowserTabsByWorktree(state)),
    ...state.openFiles.map((file) => file.worktreeId)
  ])

  const snapshots: RuntimeMobileSessionTabsSnapshot[] = []
  for (const worktreeId of worktreeIds) {
    const hostId = resolveMobileSessionSnapshotHost(state, worktreeId)
    const activeGroupId = state.activeGroupIdByWorktree[worktreeId] ?? null
    const terminalTabByIdForWorktree = new Map(
      (state.tabsByWorktree[worktreeId] ?? []).map((tab) => [tab.id, tab])
    )
    const browserWorkspaceByIdForWorktree = new Map(
      (getBrowserTabsByWorktree(state)[worktreeId] ?? []).map((workspace) => [
        workspace.id,
        workspace
      ])
    )
    const unifiedTabByIdForWorktree = new Map(
      (state.unifiedTabsByWorktree[worktreeId] ?? []).map((tab) => [tab.id, tab])
    )
    const openFilesForWorktree = openFileIndexes.byWorktreeAndId.get(worktreeId)
    const editorIds = (openFileIndexes.idsByWorktree.get(worktreeId) ?? []).filter((fileId) => {
      const file = openFilesForWorktree?.get(fileId)
      return file ? isMobilePublishableOpenFile(file) : false
    })
    const publishableTerminalIds = [...terminalTabByIdForWorktree.values()]
      .filter((terminal) => !isWebOnlyMirroredTerminalTab(state, terminal))
      .map((terminal) => terminal.id)
    const groupProjection = buildMobileSessionGroupProjection(state, worktreeId, {
      terminalIds: publishableTerminalIds,
      editorIds,
      browserIds: [...browserWorkspaceByIdForWorktree.keys()]
    })
    const tabs: RuntimeMobileSessionSnapshotTab[] = []
    const emittedEditorFileIds = new Set<string>()
    const emittedEditorTabIds = new Set<string>()

    for (const item of groupProjection.order) {
      if (item.type === 'terminal') {
        const terminal = terminalTabByIdForWorktree.get(item.id)
        if (!terminal) {
          continue
        }
        if (isWebOnlyMirroredTerminalTab(state, terminal)) {
          continue
        }
        tabs.push(
          ...buildMobileTerminalSurfaceTabs(
            state,
            terminal,
            worktreeId,
            systemPrefersDark,
            item.tabId
          )
        )
      } else if (item.type === 'editor') {
        const file = openFilesForWorktree?.get(item.id)
        if (!file || !isMobilePublishableOpenFile(file)) {
          continue
        }
        const markdown = buildMobileMarkdownTab(
          state,
          openFileIndexes.byWorktreeAndId,
          editorDraftVersionByFileId,
          file,
          item.tabId ? unifiedTabByIdForWorktree.get(item.tabId) : undefined
        )
        if (markdown) {
          tabs.push(markdown)
        } else {
          tabs.push(
            buildMobileFileTab(
              state,
              file,
              item.tabId ? unifiedTabByIdForWorktree.get(item.tabId) : undefined
            )
          )
        }
        emittedEditorFileIds.add(file.id)
        emittedEditorTabIds.add(item.tabId ?? item.id)
      } else if (item.type === 'browser') {
        const workspace = browserWorkspaceByIdForWorktree.get(item.id)
        if (!workspace) {
          continue
        }
        tabs.push(
          buildMobileBrowserTab(
            state,
            workspace,
            item.tabId ? unifiedTabByIdForWorktree.get(item.tabId) : undefined
          )
        )
      }
    }

    // Why: split-group projection can miss plain editor files during hydration.
    // Publish the missing file so paired mobile/web clients still mirror it.
    const fallbackEditorTabs: FallbackEditorTabTarget[] = []
    if (openFilesForWorktree) {
      const unifiedEditorTabs = getEditorUnifiedTabsForWorktree(state, worktreeId)
      const unifiedEditorFileIds = new Set(unifiedEditorTabs.map((tab) => tab.entityId))
      for (const unifiedTab of unifiedEditorTabs) {
        if (emittedEditorTabIds.has(unifiedTab.id)) {
          continue
        }
        const file = openFilesForWorktree.get(unifiedTab.entityId)
        if (!file || !isMobilePublishableOpenFile(file)) {
          continue
        }
        const markdown = buildMobileMarkdownTab(
          state,
          openFileIndexes.byWorktreeAndId,
          editorDraftVersionByFileId,
          file,
          unifiedTab
        )
        const fallbackTab = markdown ?? buildMobileFileTab(state, file, unifiedTab)
        tabs.push(fallbackTab)
        fallbackEditorTabs.push({
          tabId: fallbackTab.id,
          groupId: unifiedTab.groupId
        })
        emittedEditorTabIds.add(unifiedTab.id)
      }
      for (const file of openFilesForWorktree.values()) {
        if (!isMobilePublishableOpenFile(file)) {
          continue
        }
        if (emittedEditorFileIds.has(file.id)) {
          continue
        }
        if (unifiedEditorFileIds.has(file.id)) {
          emittedEditorFileIds.add(file.id)
          continue
        }
        const markdown = buildMobileMarkdownTab(
          state,
          openFileIndexes.byWorktreeAndId,
          editorDraftVersionByFileId,
          file
        )
        const fallbackTab = markdown ?? buildMobileFileTab(state, file)
        tabs.push(fallbackTab)
        fallbackEditorTabs.push({
          tabId: fallbackTab.id,
          groupId: null
        })
        emittedEditorFileIds.add(file.id)
      }
    }

    const active = tabs.find((tab) => tab.isActive) ?? null
    const tabGroups = appendFallbackEditorTabsToGroups(
      groupProjection.tabGroups,
      state.groupsByWorktree[worktreeId] ?? [],
      activeGroupId,
      fallbackEditorTabs,
      active?.id ?? null
    )
    const tabGroupLayout =
      tabGroups && tabGroups.length > 0
        ? pruneTabGroupLayout(
            (state.layoutByWorktree ?? EMPTY_LAYOUT_BY_WORKTREE)[worktreeId],
            new Set(tabGroups.map((group) => group.id))
          )
        : groupProjection.tabGroupLayout
    snapshots.push({
      worktree: worktreeId,
      ...(hostId ? { hostId } : {}),
      publicationEpoch: mobileSessionPublicationEpoch,
      snapshotVersion: ++mobileSessionSnapshotVersion,
      activeGroupId,
      activeTabId: active?.id ?? null,
      activeTabType: active?.type ?? null,
      ...(tabGroups && tabGroups.length > 0 ? { tabGroups } : {}),
      ...(tabGroupLayout ? { tabGroupLayout } : {}),
      tabs
    })
  }

  return snapshots
}

function appendFallbackEditorTabsToGroups(
  tabGroups: RuntimeMobileSessionTabGroup[] | undefined,
  sourceGroups: readonly TabGroup[],
  activeGroupId: string | null,
  fallbackTabs: readonly FallbackEditorTabTarget[],
  activeTabId: string | null
): RuntimeMobileSessionTabGroup[] | undefined {
  if (fallbackTabs.length === 0) {
    return tabGroups
  }
  const result = [...(tabGroups ?? [])]
  const sourceGroupsById = new Map(sourceGroups.map((group) => [group.id, group]))
  const groupIndexById = new Map(result.map((group, index) => [group.id, index]))
  const firstTargetGroupId =
    result[0]?.id ??
    (activeGroupId && sourceGroupsById.has(activeGroupId) ? activeGroupId : null) ??
    sourceGroups[0]?.id ??
    null
  const fallbackTabIdSet = new Set(fallbackTabs.map((tab) => tab.tabId))

  for (const fallback of fallbackTabs) {
    const targetGroupId =
      fallback.groupId ??
      (activeGroupId && (groupIndexById.has(activeGroupId) || sourceGroupsById.has(activeGroupId))
        ? activeGroupId
        : firstTargetGroupId)
    if (!targetGroupId) {
      continue
    }
    let targetIndex = groupIndexById.get(targetGroupId)
    if (targetIndex === undefined) {
      const sourceGroup = sourceGroupsById.get(targetGroupId)
      const group: RuntimeMobileSessionTabGroup = {
        id: targetGroupId,
        activeTabId: sourceGroup?.activeTabId ?? null,
        tabOrder: [],
        recentTabIds: sourceGroup?.recentTabIds ?? []
      }
      targetIndex = result.length
      groupIndexById.set(targetGroupId, targetIndex)
      result.push(group)
    }
    const group = result[targetIndex]!
    if (!group.tabOrder.includes(fallback.tabId)) {
      result[targetIndex] = {
        ...group,
        tabOrder: [...group.tabOrder, fallback.tabId]
      }
    }
  }

  if (result.length === 0) {
    return tabGroups
  }

  const activeFallbackTabId = activeTabId && fallbackTabIdSet.has(activeTabId) ? activeTabId : null

  return result.map((group) => {
    const tabOrder = [...group.tabOrder]
    const tabOrderSet = new Set(tabOrder)
    const activeFallbackTabIdForGroup =
      activeFallbackTabId && tabOrderSet.has(activeFallbackTabId) ? activeFallbackTabId : null
    const activeTabIdForGroup =
      activeFallbackTabIdForGroup ??
      (group.activeTabId && tabOrderSet.has(group.activeTabId) ? group.activeTabId : null)
    const recentTabIds = (group.recentTabIds ?? []).filter((tabId) => tabOrderSet.has(tabId))
    if (
      activeFallbackTabId &&
      tabOrderSet.has(activeFallbackTabId) &&
      !recentTabIds.includes(activeFallbackTabId)
    ) {
      recentTabIds.push(activeFallbackTabId)
    }
    return {
      ...group,
      activeTabId: activeTabIdForGroup,
      tabOrder,
      recentTabIds
    }
  })
}
