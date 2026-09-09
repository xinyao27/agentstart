import type { KeybindingContext } from '@yiru/protocol/keybindings'
import type { Tab } from '@yiru/protocol/workspace/tabs'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import type { useAppStore } from '~renderer/store/state'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

export type TerminalStoreSnapshot = ReturnType<typeof useAppStore.getState>

export function haveSameWorktreeIds(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>
): boolean {
  if (left.size !== right.size) {
    return false
  }
  for (const id of left) {
    if (!right.has(id)) {
      return false
    }
  }
  return true
}

export function findUnifiedTabByVisibleId(
  state: TerminalStoreSnapshot,
  worktreeId: string,
  visibleId: string
): Tab | null {
  return (
    (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
      (tab) => tab.id === visibleId || tab.entityId === visibleId
    ) ?? null
  )
}

export function findActiveUnifiedTab(state: TerminalStoreSnapshot, worktreeId: string): Tab | null {
  const activeGroupId = state.activeGroupIdByWorktree[worktreeId]
  const group =
    (state.groupsByWorktree[worktreeId] ?? []).find(
      (candidate) => candidate.id === activeGroupId
    ) ?? null
  if (!group?.activeTabId) {
    return null
  }
  return (
    (state.unifiedTabsByWorktree[worktreeId] ?? []).find((tab) => tab.id === group.activeTabId) ??
    null
  )
}

export function isPinnedVisibleTab(
  state: TerminalStoreSnapshot,
  worktreeId: string,
  visibleId: string
): boolean {
  return findUnifiedTabByVisibleId(state, worktreeId, visibleId)?.isPinned === true
}

const EDITOR_TAB_CONTENT_TYPES = new Set<Tab['contentType']>([
  'editor',
  'diff',
  'conflict-review',
  'check-details'
])

export function getActiveWorktreeRuntimeEnvironmentId(worktreeId: string | null): string | null {
  return getRuntimeEnvironmentIdForWorktree(readProjectCatalogRuntimeState(), worktreeId)
}

export function isPinnedActiveEditorTab(
  state: TerminalStoreSnapshot,
  worktreeId: string,
  fileId: string
): boolean {
  const activeTab = findActiveUnifiedTab(state, worktreeId)
  if (activeTab) {
    return (
      activeTab.entityId === fileId &&
      EDITOR_TAB_CONTENT_TYPES.has(activeTab.contentType) &&
      activeTab.isPinned === true
    )
  }
  return (
    (state.unifiedTabsByWorktree[worktreeId] ?? []).some(
      (tab) =>
        tab.entityId === fileId &&
        EDITOR_TAB_CONTENT_TYPES.has(tab.contentType) &&
        tab.isPinned === true
    ) ?? false
  )
}

export function isPinnedEditorFileTab(
  state: TerminalStoreSnapshot,
  worktreeId: string,
  fileId: string
): boolean {
  return (state.unifiedTabsByWorktree[worktreeId] ?? []).some(
    (tab) =>
      tab.entityId === fileId && EDITOR_TAB_CONTENT_TYPES.has(tab.contentType) && tab.isPinned
  )
}

export function getKeybindingContext(target: EventTarget | null): KeybindingContext {
  return target instanceof HTMLElement && target.classList.contains('xterm-helper-textarea')
    ? 'terminal'
    : 'app'
}
