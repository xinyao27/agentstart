import { folderWorkspaceKey } from '@yiru/protocol/workspace/identity'
import type { WorkspaceVisibleTabType } from '@yiru/protocol/workspace/tabs'
import type { StateCreator } from 'zustand'
import { detectLanguage } from '~renderer/file-presentation/language-detect'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import type { AppState } from '~renderer/store/types'
import { addAdditionalValidWorkspaceKeys } from '~renderer/workspace/session-hydration-keys'

import { buildOwnedEditorFileId } from './file-identity'
import type { OpenFile } from './file-model'
import type { EditorSearchSlice } from './search-store'
import {
  addEditorFileIdMigration,
  migrateEditorFileId,
  migrateHydratedEditorTabsAndGroups,
  resolveLegacyHydratedEditorFileId,
  shouldHydrateWithOwnedEditorFileId,
  type LegacyHydratedEditorFile
} from './session-hydration-migration'
import type { EditorSlice } from './store-contract'

type EditorSessionHydrationActions = Pick<EditorSearchSlice, 'hydrateEditorSession'>

export function createEditorSessionHydrationActions(
  set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  _get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorSessionHydrationActions {
  return {
    // Why: only edit-mode files are restored — diffs and conflict views depend on
    // transient git state that may have changed between sessions. Restoring them
    // would show stale data or fail to load entirely.
    hydrateEditorSession: (session, options) => {
      const catalogState = readProjectCatalogRuntimeState()
      set((s) => {
        const openFilesByWorktree = session.openFilesByWorktree ?? {}
        const persistedActiveFileIdByWorktree = session.activeFileIdByWorktree ?? {}
        const persistedActiveTabTypeByWorktree = session.activeTabTypeByWorktree ?? {}
        const persistedMarkdownFrontmatterVisible = session.markdownFrontmatterVisible ?? {}

        // Why: worktrees may have been deleted between sessions. Filter out
        // files for worktrees that no longer exist, mirroring the validation
        // that hydrateWorkspaceSession performs for terminal tabs.
        const validWorktreeIds = new Set(
          Object.values(catalogState.worktreesByRepo)
            .flat()
            .map((w) => w.id)
        )
        for (const workspace of catalogState.folderWorkspaces) {
          validWorktreeIds.add(folderWorkspaceKey(workspace.id))
        }
        addAdditionalValidWorkspaceKeys(validWorktreeIds, options)

        const openFiles: OpenFile[] = []
        const editorDrafts: Record<string, string> = {}
        const usedOpenFileIds = new Set<string>()
        const legacyHydratedOpenFiles: LegacyHydratedEditorFile[] = []
        const editorFileIdMigrationsByWorktree: Record<string, Map<string, string>> = {}
        for (const [worktreeId, files] of Object.entries(openFilesByWorktree)) {
          if (!validWorktreeIds.has(worktreeId)) {
            continue
          }
          for (const pf of files) {
            const legacyId = resolveLegacyHydratedEditorFileId(
              legacyHydratedOpenFiles,
              pf,
              worktreeId
            )
            // Why: floating/runtime-owned files need IDs that survive peers
            // disappearing between restarts; collision-based IDs drift when the
            // same path is no longer open in another owner.
            const ownedId = buildOwnedEditorFileId(pf.filePath, worktreeId, pf.runtimeEnvironmentId)
            const id =
              shouldHydrateWithOwnedEditorFileId(pf.runtimeEnvironmentId) ||
              usedOpenFileIds.has(pf.filePath)
                ? ownedId
                : pf.filePath
            usedOpenFileIds.add(id)
            // Why: legacy sessions used the collision-derived id for each
            // persisted entry. Mapping every filePath would collapse same-path
            // local/runtime tabs onto whichever owner hydrates last.
            addEditorFileIdMigration(editorFileIdMigrationsByWorktree, worktreeId, legacyId, id)
            legacyHydratedOpenFiles.push({
              id: legacyId,
              filePath: pf.filePath,
              worktreeId,
              runtimeEnvironmentId: pf.runtimeEnvironmentId
            })
            // Why: read-only tabs (AI Vault View Log) must restore clean. Ignore
            // any persisted dirty draft / baseline so a restored agent log can
            // never come back writable or as a hot-exit draft to be saved.
            const isReadOnly = pf.readOnly === true
            if (!isReadOnly && pf.dirtyDraftContent !== undefined) {
              editorDrafts[id] = pf.dirtyDraftContent
            }
            openFiles.push({
              id,
              filePath: pf.filePath,
              relativePath: pf.relativePath,
              worktreeId,
              // Why: sessions can contain language ids from older Yiru builds.
              // Re-detect on hydrate so newly-supported extensions like .ipynb
              // stop reopening as raw JSON/plain text after the upgrade.
              language: detectLanguage(pf.relativePath || pf.filePath),
              isDirty: !isReadOnly && pf.dirtyDraftContent !== undefined,
              isPreview: pf.isPreview,
              runtimeEnvironmentId: pf.runtimeEnvironmentId,
              ...(isReadOnly ? { readOnly: true } : {}),
              ...(isReadOnly && pf.liveTail === true ? { liveTail: true } : {}),
              lastKnownDiskSignature: isReadOnly ? undefined : pf.lastKnownDiskSignature,
              // Why: hard-suspends autosave until the restored-tab conflict scan
              // verifies disk against the baseline — an async race would let a
              // slow remote read lose to the autosave timer and clobber an
              // offline agent write.
              pendingDiskBaselineVerification:
                !isReadOnly &&
                pf.dirtyDraftContent !== undefined &&
                pf.lastKnownDiskSignature !== undefined
                  ? true
                  : undefined,
              mode: 'edit'
            })
          }
        }

        // Why: use the store's activeWorktreeId (set by hydrateWorkspaceSession)
        // rather than the raw session value. hydrateWorkspaceSession may have
        // nulled out an invalid worktree ID, and we must respect that decision.
        const activeWorktreeId = s.activeWorktreeId
        const fallbackActiveFileId = activeWorktreeId
          ? (openFiles.find((f) => f.worktreeId === activeWorktreeId)?.id ?? null)
          : null
        const persistedActiveFileId = activeWorktreeId
          ? migrateEditorFileId(
              editorFileIdMigrationsByWorktree,
              activeWorktreeId,
              persistedActiveFileIdByWorktree[activeWorktreeId]
            )
          : null
        // Why: verify the persisted active file still exists in the restored set.
        // The file may have been removed due to worktree validation or the
        // persisted data may reference a stale path.
        const activeFileExists = persistedActiveFileId
          ? openFiles.some(
              (f) => f.id === persistedActiveFileId && f.worktreeId === activeWorktreeId
            )
          : false
        // Why: if the previously active editor surface pointed at a transient
        // diff/conflict tab, restart still restores any normal edit tabs for the
        // worktree. Promote the first restored edit file so the UI comes back on
        // a concrete file tab instead of an unselected editor surface.
        const nextActiveFileId = activeFileExists ? persistedActiveFileId : fallbackActiveFileId
        const activeTabType: WorkspaceVisibleTabType =
          activeWorktreeId && persistedActiveTabTypeByWorktree[activeWorktreeId]
            ? persistedActiveTabTypeByWorktree[activeWorktreeId]
            : 'terminal'

        // Filter per-worktree maps to only valid worktrees with valid file references
        const filteredActiveFileIdByWorktree = Object.fromEntries(
          [...validWorktreeIds].flatMap((wId) => {
            const persistedFileId = migrateEditorFileId(
              editorFileIdMigrationsByWorktree,
              wId,
              persistedActiveFileIdByWorktree[wId]
            )
            if (
              persistedFileId &&
              openFiles.some((f) => f.id === persistedFileId && f.worktreeId === wId)
            ) {
              return [[wId, persistedFileId]]
            }
            const fallbackFileId = openFiles.find((f) => f.worktreeId === wId)?.id
            return fallbackFileId ? [[wId, fallbackFileId]] : []
          })
        )
        const filteredActiveTabTypeByWorktree = Object.fromEntries(
          Object.entries(persistedActiveTabTypeByWorktree).filter(([wId, tabType]) => {
            if (!validWorktreeIds.has(wId)) {
              return false
            }
            if (tabType !== 'editor') {
              return true
            }
            // Why: a persisted "editor" surface only makes sense if that
            // worktree still restored a concrete active editor file. Otherwise we
            // preserve a stale last-active marker that conflicts with browser or
            // terminal restore logic for the same worktree.
            return Boolean(filteredActiveFileIdByWorktree[wId])
          })
        )

        // Why: restart only restores edit-mode files. If the previous active
        // surface for the current worktree was a transient diff/conflict view,
        // we must clear the stale "editor" marker here so startup falls back to
        // browser or terminal instead of showing an empty editor surface.
        const nextActiveTabType =
          nextActiveFileId || activeTabType !== 'editor' ? activeTabType : 'terminal'
        const openFileIds = new Set(openFiles.map((file) => file.id))
        // Why: visible is the default, so only restore per-file hide overrides
        // (`false`); legacy `true` entries collapse back to the default.
        const hiddenFrontmatterEntries = new Map<string, boolean>()
        for (const [persistedFileId, visible] of Object.entries(
          persistedMarkdownFrontmatterVisible
        )) {
          if (visible) {
            continue
          }
          if (openFileIds.has(persistedFileId)) {
            hiddenFrontmatterEntries.set(persistedFileId, false)
          }
          for (const migrations of Object.values(editorFileIdMigrationsByWorktree)) {
            const migratedFileId = migrations.get(persistedFileId)
            if (migratedFileId && openFileIds.has(migratedFileId)) {
              hiddenFrontmatterEntries.set(migratedFileId, false)
            }
          }
        }
        const markdownFrontmatterVisible = Object.fromEntries(hiddenFrontmatterEntries)

        return {
          openFiles,
          editorDrafts,
          markdownFrontmatterVisible,
          activeFileId: nextActiveFileId,
          activeFileIdByWorktree: filteredActiveFileIdByWorktree,
          activeTabType: nextActiveTabType,
          activeTabTypeByWorktree: filteredActiveTabTypeByWorktree,
          ...migrateHydratedEditorTabsAndGroups(s, editorFileIdMigrationsByWorktree)
        }
      })
    }
  }
}
