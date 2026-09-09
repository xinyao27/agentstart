import type { FsChangedPayload } from '@yiru/protocol/files/watch-values'
import {
  isPathInsideOrEqual,
  normalizeRuntimePathForComparison,
  relativePathInsideRoot
} from '@yiru/protocol/host/path'
import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { joinPath, normalizeRelativePath, dirname } from '~renderer/path'
import { subscribeRuntimeFileChanges } from '~renderer/runtime/file-client'
import { useAppStore } from '~renderer/store/state'
import type { AppState } from '~renderer/store/types'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import type { InlineInput } from './row'
import type { DirCache } from './types'
import {
  purgeDirCacheSubtree,
  purgeExpandedDirsSubtree,
  clearStalePendingReveal
} from './watcher-reconcile'

type UseFileExplorerWatchParams = {
  worktreePath: string | null
  activeWorktreeId: string | null
  dirCache: Record<string, DirCache>
  setDirCache: Dispatch<SetStateAction<Record<string, DirCache>>>
  expanded: Set<string>
  setSelectedPath: Dispatch<SetStateAction<string | null>>
  refreshDir: (dirPath: string) => Promise<void>
  refreshTree: () => Promise<void>
  inlineInput: InlineInput | null
  dragSourcePath: string | null
}

export function getExternalFileChangeRelativePath(
  worktreePath: string,
  absolutePath: string,
  isDirectory: boolean | undefined
): string | null {
  if (isDirectory === true) {
    return null
  }

  const relativePath = relativePathInsideRoot(worktreePath, absolutePath)
  if (relativePath === null || relativePath === '') {
    return null
  }

  // Why: EditorPanel only reloads open tabs after the renderer emits
  // `yiru:editor-external-file-change` with a worktree-relative path. The
  // filesystem watcher reports absolute paths, so normalize them here before
  // the explorer refresh path returns; otherwise terminal edits refresh the
  // tree but leave the editor's cached file contents stale.
  return normalizeRelativePath(relativePath)
}

export function canonicalizeFileExplorerWatchPath(
  worktreePath: string,
  absolutePath: string
): string | null {
  const relativePath = relativePathInsideRoot(worktreePath, absolutePath)
  if (relativePath === null) {
    return null
  }

  const rootPath = normalizeExplorerAbsolutePath(worktreePath)
  return relativePath === '' ? rootPath : joinPath(rootPath, relativePath)
}

function normalizeExplorerAbsolutePath(path: string): string {
  if (path === '/' || /^[A-Za-z]:[\\/]$/.test(path)) {
    return path
  }
  return path.replace(/[\\/]+$/, '')
}

export function getFileExplorerWatchRuntimeEnvironmentId(
  state: Pick<AppState, 'repos' | 'settings' | 'worktreesByRepo'>,
  activeWorktreeId: string | null
): string | null {
  return getRuntimeEnvironmentIdForWorktree(state, activeWorktreeId)
}

/**
 * Reconciles File Explorer state on filesystem events for the active worktree.
 *
 * Why: this hook owns its own `subscribeRuntimeFileChanges` subscription for
 * the active worktree and filters events for tree-cache reconciliation.
 * `useEditorExternalWatch` (invoked once from application-shell.tsx) keeps
 * editor reloads firing independently, even when the Explorer panel is
 * unmounted (user switched to Source Control, Checks, or Search) — both
 * hooks' subscriptions share one underlying `files.watch` stream per
 * worktree via `sharedRuntimeFileWatches` (`renderer/runtime/file-
 * client.ts`), so neither pays for a duplicate watcher.
 */
export function useFileExplorerWatch({
  worktreePath,
  activeWorktreeId,
  dirCache,
  setDirCache,
  expanded,
  setSelectedPath,
  refreshDir,
  refreshTree,
  inlineInput,
  dragSourcePath
}: UseFileExplorerWatchParams): void {
  // Why: Explorer subscriptions are for the selected worktree. Host focus is
  // only a default for legacy untagged worktrees, not an ownership signal.
  const activeRuntimeEnvironmentId = useAppStore((s) =>
    getFileExplorerWatchRuntimeEnvironmentId(s, activeWorktreeId)
  )

  // Keep refs for values accessed inside the event handler to avoid
  // re-subscribing the IPC listener on every render.
  const dirCacheRef = useRef(dirCache)
  const expandedRef = useRef(expanded)
  const worktreeIdRef = useRef(activeWorktreeId)
  const inlineInputRef = useRef(inlineInput)
  const dragSourceRef = useRef(dragSourcePath)

  // Why: refreshDir and refreshTree are stored as refs so the merged
  // subscribe+event effect does not re-subscribe the IPC listener when
  // `expanded` changes (which gives refreshTree a new identity). Without
  // refs, every expand/collapse would tear down and re-create the watcher
  // subscription and IPC listener unnecessarily (review issue §1).
  const refreshDirRef = useRef(refreshDir)
  const refreshTreeRef = useRef(refreshTree)

  useEffect(() => {
    dirCacheRef.current = dirCache
    expandedRef.current = expanded
    worktreeIdRef.current = activeWorktreeId
    inlineInputRef.current = inlineInput
    dragSourceRef.current = dragSourcePath
    refreshDirRef.current = refreshDir
    refreshTreeRef.current = refreshTree
  }, [activeWorktreeId, dirCache, dragSourcePath, expanded, inlineInput, refreshDir, refreshTree])

  // Deferred events queue: events that arrive during inline input or drag
  const deferredRef = useRef<FsChangedPayload[]>([])

  // Why: the flush effect (below) lives outside the subscribe effect that
  // owns `processPayload`, but it needs to replay deferred payloads so the
  // tree-cache reconciliation (design §6.2) converges on disk reality even
  // when events arrived during inline input or drag. A ref bridges the two
  // effects without tearing the subscription down on every render.
  const processPayloadRef = useRef<((payload: FsChangedPayload) => void) | null>(null)

  // ── Subscribe, process events, and unsubscribe in one atomic effect ──
  // Why: merging the subscribe/unsubscribe effect and the event-processing
  // effect into a single useEffect eliminates a race where events from a
  // new watcher could be lost during rapid worktree switches. When they were
  // separate effects with the same `worktreePath` dependency, React could
  // run the event-listener cleanup before the unsubscribe cleanup, creating
  // a window where events arrive with no handler (review issue §3).
  useEffect(() => {
    if (!worktreePath) {
      return
    }

    const currentWorktreePath = worktreePath

    function processPayload(payload: FsChangedPayload): void {
      // Why: during rapid worktree switches, in-flight batched events from
      // the old worktree can arrive after the switch. Processing them against
      // the new worktree's tree state would corrupt dirCache (design §3).
      if (
        normalizeRuntimePathForComparison(payload.worktreePath) !==
        normalizeRuntimePathForComparison(currentWorktreePath)
      ) {
        return
      }

      const wtId = worktreeIdRef.current
      if (!wtId) {
        return
      }

      const cache = dirCacheRef.current
      const exp = expandedRef.current

      // Collect directories that need refreshing
      const dirsToRefresh = new Set<string>()
      let needsFullRefresh = false

      for (const evt of payload.events) {
        if (evt.kind === 'overflow') {
          needsFullRefresh = true
          break
        }

        const normalizedPath = canonicalizeFileExplorerWatchPath(
          currentWorktreePath,
          evt.absolutePath
        )
        if (!normalizedPath) {
          continue
        }

        if (evt.kind === 'delete') {
          // Why: for delete events, isDirectory is undefined from the watcher
          // (the path no longer exists). Infer from dirCache: if the deleted
          // path is a dirCache key, it was an expanded directory (design §4.4).
          const wasDirectory = normalizedPath in cache

          if (wasDirectory) {
            purgeDirCacheSubtree(setDirCache, normalizedPath)
            purgeExpandedDirsSubtree(wtId, normalizedPath)
          }

          // Clear pendingExplorerReveal if it targets the deleted path or any
          // descendant (for directory deletes). File deletes clear on exact match.
          clearStalePendingReveal(normalizedPath)

          // Clear selectedPath if it points into the deleted subtree
          setSelectedPath((prev) => {
            if (
              prev &&
              normalizeRuntimePathForComparison(prev) ===
                normalizeRuntimePathForComparison(normalizedPath)
            ) {
              return null
            }
            if (prev && wasDirectory && isPathInsideOrEqual(normalizedPath, prev)) {
              return null
            }
            return prev
          })

          // Invalidate the parent directory
          const parent = normalizeExplorerAbsolutePath(dirname(normalizedPath))
          if (parent in cache) {
            dirsToRefresh.add(parent)
          }
        } else if (evt.kind === 'create') {
          // Invalidate the parent directory
          const parent = normalizeExplorerAbsolutePath(dirname(normalizedPath))
          if (parent in cache) {
            dirsToRefresh.add(parent)
          }
        } else if (evt.kind === 'update') {
          // Why: directory update events invalidate that directory. File-content
          // update events are ignored in v1 (design §6.1).
          if (evt.isDirectory === true) {
            if (normalizedPath in cache) {
              dirsToRefresh.add(normalizedPath)
            }
          }
        }
      }

      if (needsFullRefresh) {
        void refreshTreeRef.current()
        return
      }

      // Only refresh directories that are already loaded (in cache) and are
      // either the root, expanded, or already have cached children.
      for (const dirPath of dirsToRefresh) {
        // Check the dir is the root or an expanded directory or already in cache
        if (
          dirPath === normalizeExplorerAbsolutePath(currentWorktreePath) ||
          exp.has(dirPath) ||
          dirPath in dirCacheRef.current
        ) {
          void refreshDirRef.current(dirPath)
        }
      }
    }

    // Why: expose `processPayload` to the flush effect so it can replay
    // deferred payloads without re-subscribing the IPC listener.
    processPayloadRef.current = processPayload

    const handleFsChanged = (payload: FsChangedPayload): void => {
      // Why: defer watcher refreshes while inline input or internal drag-drop
      // is active so rows do not shift beneath the interaction.
      if (inlineInputRef.current !== null || dragSourceRef.current !== null) {
        deferredRef.current.push(payload)
        return
      }

      processPayload(payload)
    }

    let disposed = false
    let unsubscribeListener: (() => void) | null = null
    // Why: `files.watch` (contract) targets `{ kind: 'local' }` for a
    // worktree with no runtime owner the same way it targets a remote
    // environment for one that has one (`getActiveRuntimeTarget`), and shares
    // the underlying subscription with `useEditorExternalWatch` via
    // `sharedRuntimeFileWatches` — so the Explorer subscribes the same way
    // for every target instead of falling back to the (now-retired) local
    // legacy global filesystem IPC bus. Verified against a real local target by
    // CDP-driven boot (slice 122).
    if (activeWorktreeId) {
      void subscribeRuntimeFileChanges(
        {
          settings: { activeRuntimeEnvironmentId },
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId: undefined
        },
        handleFsChanged,
        (err) => {
          console.warn('[filesystem-watch] failed to subscribe to runtime file changes', {
            worktreeId: activeWorktreeId,
            worktreePath,
            error: err.message
          })
        }
      )
        .then((unsubscribe) => {
          if (disposed) {
            unsubscribe()
            return
          }
          unsubscribeListener = unsubscribe
        })
        .catch((err) => {
          console.warn('[filesystem-watch] failed to subscribe to runtime file changes', {
            worktreeId: activeWorktreeId,
            worktreePath,
            error: err instanceof Error ? err.message : String(err)
          })
        })
    }

    return () => {
      disposed = true
      unsubscribeListener?.()
      deferredRef.current = []
      processPayloadRef.current = null
    }
  }, [worktreePath, activeWorktreeId, activeRuntimeEnvironmentId, setDirCache, setSelectedPath])

  // ── Flush deferred events when interaction ends ────────────────────
  useEffect(() => {
    if (inlineInput === null && dragSourcePath === null && deferredRef.current.length > 0) {
      const deferred = deferredRef.current.splice(0)
      // Why: replay every deferred payload through `processPayload` so the
      // tree cache reconciles to disk state after inline input or drag ends
      // (design §6.2). Editor-tab reloads are handled independently by
      // `useEditorExternalWatch`, which listens to the same file-watch
      // stream at App-level and is not affected by Explorer deferral.
      if (processPayloadRef.current) {
        for (const payload of deferred) {
          processPayloadRef.current(payload)
        }
      }
    }
  }, [inlineInput, dragSourcePath])
}
