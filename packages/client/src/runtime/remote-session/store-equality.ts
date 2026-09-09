import type {
  BrowserCertificateFailure,
  BrowserPage,
  BrowserWorkspace
} from '@yiru/protocol/workspace/browser-session'
import type { Tab, TabGroup, TerminalTab } from '@yiru/protocol/workspace/tabs'

import type { OpenFile } from '../../editor/state'
import { sameStringArray } from './agent-status-equality'
import type { RemoteSessionTabsSyncState } from './tabs-state'

export function sanitizeRecentTabIds(recent: string[] | undefined, tabOrder: string[]): string[] {
  if (!recent || recent.length === 0) {
    return []
  }
  const valid = new Set(tabOrder)
  const seen = new Set<string>()
  const reversed: string[] = []
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const id = recent[i]
    if (!valid.has(id) || seen.has(id)) {
      continue
    }
    seen.add(id)
    reversed.push(id)
  }
  return reversed.toReversed()
}

export function pushRecentTabId(recent: string[] | undefined, tabId: string): string[] {
  const base = recent ?? []
  if (base.length > 0 && base.at(-1) === tabId) {
    return base
  }
  return [...base.filter((id) => id !== tabId), tabId]
}

export function withWorktreeEntry<T>(
  record: Record<string, T>,
  key: string,
  value: T | null,
  equal: (a: T | undefined, b: T | null) => boolean
): Record<string, T> {
  if (equal(record[key], value)) {
    return record
  }
  const next = { ...record }
  if (value === null) {
    delete next[key]
  } else {
    next[key] = value
  }
  return next
}

export function terminalTabEqual(a: TerminalTab, b: TerminalTab): boolean {
  return (
    a.id === b.id &&
    a.ptyId === b.ptyId &&
    a.worktreeId === b.worktreeId &&
    a.title === b.title &&
    a.defaultTitle === b.defaultTitle &&
    a.quickCommandLabel === b.quickCommandLabel &&
    a.startupCwd === b.startupCwd &&
    a.generatedTitle === b.generatedTitle &&
    a.customTitle === b.customTitle &&
    a.color === b.color &&
    a.sortOrder === b.sortOrder &&
    a.createdAt === b.createdAt &&
    a.generation === b.generation &&
    a.shellOverride === b.shellOverride &&
    a.launchAgent === b.launchAgent &&
    a.pendingActivationSpawn === b.pendingActivationSpawn
  )
}

export function sameTerminalTabs(
  a: readonly TerminalTab[] | undefined,
  b: readonly TerminalTab[] | null
): boolean {
  const left = a ?? []
  const right = b ?? []
  if (left.length !== right.length) {
    return false
  }
  return left.every((tab, index) => terminalTabEqual(tab, right[index]!))
}

export function browserPageEqual(a: BrowserPage, b: BrowserPage): boolean {
  return (
    a.id === b.id &&
    a.workspaceId === b.workspaceId &&
    a.worktreeId === b.worktreeId &&
    a.url === b.url &&
    a.title === b.title &&
    a.loading === b.loading &&
    a.faviconUrl === b.faviconUrl &&
    a.canGoBack === b.canGoBack &&
    a.canGoForward === b.canGoForward &&
    a.loadError?.code === b.loadError?.code &&
    a.loadError?.description === b.loadError?.description &&
    a.loadError?.validatedUrl === b.loadError?.validatedUrl &&
    a.createdAt === b.createdAt &&
    a.browserRuntimeEnvironmentId === b.browserRuntimeEnvironmentId &&
    a.viewportPresetId === b.viewportPresetId
  )
}

export function browserCertificateFailureEqual(
  a: BrowserCertificateFailure | null | undefined,
  b: BrowserCertificateFailure | null | undefined
): boolean {
  const left = a ?? null
  const right = b ?? null
  if (left === right) {
    return true
  }
  return Boolean(
    left &&
    right &&
    left.challengeId === right.challengeId &&
    left.browserPageId === right.browserPageId &&
    left.errorCode === right.errorCode &&
    left.error === right.error &&
    left.origin === right.origin &&
    left.displayHost === right.displayHost &&
    left.canProceed === right.canProceed &&
    left.observedAt === right.observedAt
  )
}

export function sameBrowserPages(
  a: readonly BrowserPage[] | undefined,
  b: readonly BrowserPage[] | null
): boolean {
  const left = a ?? []
  const right = b ?? []
  if (left.length !== right.length) {
    return false
  }
  return left.every((page, index) => browserPageEqual(page, right[index]!))
}

export function browserWorkspaceEqual(a: BrowserWorkspace, b: BrowserWorkspace): boolean {
  return (
    a.id === b.id &&
    a.worktreeId === b.worktreeId &&
    a.label === b.label &&
    a.sessionProfileId === b.sessionProfileId &&
    a.activePageId === b.activePageId &&
    sameStringArray(a.pageIds ?? [], b.pageIds ?? []) &&
    a.url === b.url &&
    a.title === b.title &&
    a.loading === b.loading &&
    a.faviconUrl === b.faviconUrl &&
    a.canGoBack === b.canGoBack &&
    a.canGoForward === b.canGoForward &&
    a.loadError?.code === b.loadError?.code &&
    a.loadError?.description === b.loadError?.description &&
    a.loadError?.validatedUrl === b.loadError?.validatedUrl &&
    a.createdAt === b.createdAt
  )
}

export function sameBrowserTabs(
  a: readonly BrowserWorkspace[] | undefined,
  b: readonly BrowserWorkspace[] | null
): boolean {
  const left = a ?? []
  const right = b ?? []
  if (left.length !== right.length) {
    return false
  }
  return left.every((tab, index) => browserWorkspaceEqual(tab, right[index]!))
}

export function openFileEqual(a: OpenFile, b: OpenFile): boolean {
  return (
    a.id === b.id &&
    a.filePath === b.filePath &&
    a.relativePath === b.relativePath &&
    a.worktreeId === b.worktreeId &&
    a.language === b.language &&
    a.isDirty === b.isDirty &&
    a.runtimeEnvironmentId === b.runtimeEnvironmentId &&
    a.markdownPreviewSourceFileId === b.markdownPreviewSourceFileId &&
    a.markdownPreviewAnchor === b.markdownPreviewAnchor &&
    a.isPreview === b.isPreview &&
    a.isUntitled === b.isUntitled &&
    a.deleteUntouchedOnClose === b.deleteUntouchedOnClose &&
    a.externalMutation === b.externalMutation &&
    a.mirroredFromRuntimeSession === b.mirroredFromRuntimeSession &&
    a.mode === b.mode
  )
}

export function sameOpenFiles(a: readonly OpenFile[], b: readonly OpenFile[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  return a.every((file, index) => openFileEqual(file, b[index]!))
}

export function tabEqual(a: Tab, b: Tab): boolean {
  return (
    a.id === b.id &&
    a.entityId === b.entityId &&
    a.groupId === b.groupId &&
    a.worktreeId === b.worktreeId &&
    a.contentType === b.contentType &&
    a.label === b.label &&
    a.customLabel === b.customLabel &&
    a.color === b.color &&
    a.sortOrder === b.sortOrder &&
    a.createdAt === b.createdAt &&
    a.isPreview === b.isPreview &&
    a.isPinned === b.isPinned
  )
}

export function sameUnifiedTabs(a: readonly Tab[] | undefined, b: readonly Tab[] | null): boolean {
  const left = a ?? []
  const right = b ?? []
  if (left.length !== right.length) {
    return false
  }
  return left.every((tab, index) => tabEqual(tab, right[index]!))
}

export function groupEqual(a: TabGroup, b: TabGroup): boolean {
  return (
    a.id === b.id &&
    a.worktreeId === b.worktreeId &&
    a.activeTabId === b.activeTabId &&
    sameStringArray(a.tabOrder, b.tabOrder) &&
    sameStringArray(a.recentTabIds ?? [], b.recentTabIds ?? [])
  )
}

export function sameGroups(
  a: readonly TabGroup[] | undefined,
  b: readonly TabGroup[] | null
): boolean {
  const left = a ?? []
  const right = b ?? []
  if (left.length !== right.length) {
    return false
  }
  return left.every((group, index) => groupEqual(group, right[index]!))
}

export function toVisibleTabType(tab: Tab): RemoteSessionTabsSyncState['activeTabType'] {
  if (tab.contentType === 'browser' || tab.contentType === 'terminal') {
    return tab.contentType
  }
  return 'editor'
}

export function findCurrentVisibleUnifiedTabId(args: {
  state: RemoteSessionTabsSyncState
  worktreeId: string
  nextUnifiedTabs: readonly Tab[] | null
}): string | null {
  const { state, worktreeId, nextUnifiedTabs } = args
  if (!nextUnifiedTabs) {
    return null
  }
  const currentVisibleType =
    state.activeTabTypeByWorktree[worktreeId] ??
    (state.activeWorktreeId === worktreeId ? state.activeTabType : null)
  if (currentVisibleType === 'terminal') {
    const terminalTabId = state.activeTabIdByWorktree[worktreeId]
    return terminalTabId && nextUnifiedTabs.some((tab) => tab.id === terminalTabId)
      ? terminalTabId
      : null
  }
  if (currentVisibleType === 'browser') {
    const browserWorkspaceId = state.activeBrowserTabIdByWorktree[worktreeId]
    return (
      nextUnifiedTabs.find(
        (tab) => tab.contentType === 'browser' && tab.entityId === browserWorkspaceId
      )?.id ?? null
    )
  }
  if (currentVisibleType === 'editor') {
    const fileId = state.activeFileIdByWorktree[worktreeId]
    return (
      nextUnifiedTabs.find((tab) => tab.contentType === 'editor' && tab.entityId === fileId)?.id ??
      null
    )
  }
  return null
}
