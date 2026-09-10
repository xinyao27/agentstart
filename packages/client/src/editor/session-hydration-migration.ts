import type { PersistedOpenFile } from '@agentstart/protocol/workspace/session'
import type { Tab, TabGroup } from '@agentstart/protocol/workspace/tabs'
import type { AppState } from '~renderer/store/types'

import {
  buildOwnedEditorFileId,
  isEditorFileIdOccupiedByOtherOwner,
  isSameEditorOwner,
  runtimeOwnerKey
} from './file-identity'
import type { OpenFile } from './file-model'

export function shouldHydrateWithOwnedEditorFileId(
  runtimeEnvironmentId: string | null | undefined
): boolean {
  return runtimeOwnerKey(runtimeEnvironmentId) !== null
}

export function addEditorFileIdMigration(
  migrationsByWorktree: Record<string, Map<string, string>>,
  worktreeId: string,
  from: string,
  to: string
): void {
  if (from === to) {
    return
  }
  const migrations =
    migrationsByWorktree[worktreeId] ?? (migrationsByWorktree[worktreeId] = new Map())
  migrations.set(from, to)
}

export type LegacyHydratedEditorFile = Pick<
  OpenFile,
  'id' | 'filePath' | 'worktreeId' | 'runtimeEnvironmentId' | 'markdownPreviewSourceFileId'
>

export function resolveLegacyHydratedEditorFileId(
  files: readonly LegacyHydratedEditorFile[],
  persistedFile: PersistedOpenFile,
  worktreeId: string
): string {
  const existing = files.find(
    (file) =>
      file.filePath === persistedFile.filePath &&
      isSameEditorOwner(file, worktreeId, persistedFile.runtimeEnvironmentId)
  )
  if (existing) {
    return existing.id
  }
  return files.some((file) =>
    isEditorFileIdOccupiedByOtherOwner(
      file,
      persistedFile.filePath,
      worktreeId,
      persistedFile.runtimeEnvironmentId
    )
  )
    ? buildOwnedEditorFileId(persistedFile.filePath, worktreeId, persistedFile.runtimeEnvironmentId)
    : persistedFile.filePath
}

export function migrateEditorFileId(
  migrationsByWorktree: Record<string, Map<string, string>>,
  worktreeId: string,
  fileId: string | null | undefined
): string | null {
  if (!fileId) {
    return null
  }
  return migrationsByWorktree[worktreeId]?.get(fileId) ?? fileId
}

function dedupeEditorTabOrder(tabIds: string[], validTabIds: Set<string>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const tabId of tabIds) {
    if (!validTabIds.has(tabId) || seen.has(tabId)) {
      continue
    }
    seen.add(tabId)
    result.push(tabId)
  }
  return result
}

function areStringArraysEqual(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined
): boolean {
  if (a === b) {
    return true
  }
  if (!a || !b || a.length !== b.length) {
    return false
  }
  return a.every((value, index) => value === b[index])
}

export function migrateHydratedEditorTabsAndGroups(
  state: Pick<AppState, 'unifiedTabsByWorktree' | 'groupsByWorktree'>,
  migrationsByWorktree: Record<string, Map<string, string>>
): Partial<Pick<AppState, 'unifiedTabsByWorktree' | 'groupsByWorktree'>> {
  let tabsChanged = false
  let groupsChanged = false
  const nextUnifiedTabsByWorktree: Record<string, Tab[]> = { ...state.unifiedTabsByWorktree }
  const tabIdMigrationsByWorktree: Record<string, Map<string, string>> = {}

  for (const [worktreeId, idMigrations] of Object.entries(migrationsByWorktree)) {
    const tabs = state.unifiedTabsByWorktree[worktreeId]
    if (!tabs) {
      continue
    }
    const tabIdMigrations = new Map<string, string>()
    const nextTabs = tabs.map((tab) => {
      if (tab.contentType !== 'editor') {
        return tab
      }
      const nextId = idMigrations.get(tab.id) ?? tab.id
      const nextEntityId = idMigrations.get(tab.entityId) ?? tab.entityId
      if (nextId === tab.id && nextEntityId === tab.entityId) {
        return tab
      }
      tabsChanged = true
      if (nextId !== tab.id) {
        tabIdMigrations.set(tab.id, nextId)
      }
      return { ...tab, id: nextId, entityId: nextEntityId }
    })
    if (tabIdMigrations.size > 0) {
      tabIdMigrationsByWorktree[worktreeId] = tabIdMigrations
    }
    nextUnifiedTabsByWorktree[worktreeId] = nextTabs
  }

  const nextGroupsByWorktree: Record<string, TabGroup[]> = { ...state.groupsByWorktree }
  for (const [worktreeId, tabIdMigrations] of Object.entries(tabIdMigrationsByWorktree)) {
    const groups = state.groupsByWorktree[worktreeId]
    if (!groups) {
      continue
    }
    const validTabIds = new Set((nextUnifiedTabsByWorktree[worktreeId] ?? []).map((tab) => tab.id))
    nextGroupsByWorktree[worktreeId] = groups.map((group) => {
      const tabOrder = dedupeEditorTabOrder(
        group.tabOrder.map((tabId) => tabIdMigrations.get(tabId) ?? tabId),
        validTabIds
      )
      const activeTabId = group.activeTabId
        ? (tabIdMigrations.get(group.activeTabId) ?? group.activeTabId)
        : null
      const validActiveTabId = activeTabId && validTabIds.has(activeTabId) ? activeTabId : null
      const recentTabIds = group.recentTabIds
        ? dedupeEditorTabOrder(
            group.recentTabIds.map((tabId) => tabIdMigrations.get(tabId) ?? tabId),
            validTabIds
          )
        : group.recentTabIds
      if (
        validActiveTabId === group.activeTabId &&
        areStringArraysEqual(tabOrder, group.tabOrder) &&
        areStringArraysEqual(recentTabIds, group.recentTabIds)
      ) {
        return group
      }
      groupsChanged = true
      return {
        ...group,
        activeTabId: validActiveTabId,
        tabOrder,
        recentTabIds
      }
    })
  }

  return {
    ...(tabsChanged ? { unifiedTabsByWorktree: nextUnifiedTabsByWorktree } : {}),
    ...(groupsChanged ? { groupsByWorktree: nextGroupsByWorktree } : {})
  }
}
