import type { StateCreator } from 'zustand'
import { getConnectionIdForFileFromState } from '~renderer/editor/connection-owner-resolution'
import { openHttpLink, type HttpLinkSourceOwner } from '~renderer/editor/http-link-routing'
import {
  isLocalPathOpenBlocked,
  showLocalPathOpenBlockedToast
} from '~renderer/editor/local-path-open-guard'
import { resolveMarkdownLinkTarget } from '~renderer/editor/markdown-internal-links'
import { detectLanguage } from '~renderer/file-presentation/language-detect'
import { statRuntimePath } from '~renderer/runtime/file-client'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import type { AppState } from '~renderer/store/types'

import { getOpenedEditFileIdAfterOpen } from './file-identity'
import type { EditorFileSlice } from './file-store'
import { scheduleEditorLineReveal } from './line-reveal'
import type { EditorSlice } from './store-contract'

type MarkdownLinkActions = Pick<EditorFileSlice, 'activateMarkdownLink'>

export function createMarkdownLinkActions(
  _set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): MarkdownLinkActions {
  return {
    activateMarkdownLink: async (rawHref, ctx) => {
      const initialState = get()
      let inferredRuntimeEnvironmentId: string | null | undefined
      if (!ctx.sourceOwner && ctx.runtimeEnvironmentId === undefined) {
        const inferredRuntimeOwners = new Set(
          initialState.openFiles
            .filter(
              (file) => file.filePath === ctx.sourceFilePath && file.worktreeId === ctx.worktreeId
            )
            .map((file) => file.runtimeEnvironmentId?.trim() || null)
        )
        if (inferredRuntimeOwners.size > 1) {
          return
        }
        inferredRuntimeEnvironmentId =
          inferredRuntimeOwners.size === 1 ? [...inferredRuntimeOwners][0] : undefined
      }
      const sourceRuntimeEnvironmentId =
        ctx.sourceOwner?.kind === 'runtime'
          ? ctx.sourceOwner.runtimeEnvironmentId
          : ctx.sourceOwner
            ? null
            : ctx.runtimeEnvironmentId !== undefined
              ? ctx.runtimeEnvironmentId
              : inferredRuntimeEnvironmentId
      const runtimeOwnerId = sourceRuntimeEnvironmentId?.trim() || null
      const sourceSettings = settingsForRuntimeOwner(initialState.settings, runtimeOwnerId)
      const resolvedConnectionId =
        ctx.sourceOwner || runtimeOwnerId
          ? undefined
          : getConnectionIdForFileFromState(initialState, ctx.worktreeId, ctx.sourceFilePath)
      const sourceOwner: HttpLinkSourceOwner =
        ctx.sourceOwner ??
        (runtimeOwnerId
          ? { kind: 'runtime', runtimeEnvironmentId: runtimeOwnerId }
          : resolvedConnectionId === undefined
            ? { kind: 'unknown' }
            : resolvedConnectionId === null
              ? { kind: 'local' }
              : { kind: 'ssh', connectionId: resolvedConnectionId })
      if (sourceOwner.kind === 'unknown') {
        return
      }
      const sourceConnectionId = sourceOwner.kind === 'ssh' ? sourceOwner.connectionId : undefined
      const fileContext = {
        settings: sourceSettings,
        worktreeId: ctx.worktreeId,
        worktreePath: ctx.worktreeRoot,
        connectionId: sourceConnectionId
      }
      const target = resolveMarkdownLinkTarget(rawHref, ctx.sourceFilePath, ctx.worktreeRoot)
      if (!target) {
        return
      }
      if (target.kind === 'anchor') {
        return
      }
      if (target.kind === 'external') {
        openHttpLink(target.url, {
          openInAgentStartBrowser: ctx.openInAgentStartBrowser,
          worktreeId: ctx.worktreeId,
          sourceOwner
        })
        return
      }
      if (target.kind === 'file') {
        const { line, column } = target
        if (target.relativePath === undefined) {
          if (isLocalPathOpenBlocked(sourceSettings, { connectionId: sourceConnectionId })) {
            // Why: a file:// link outside the worktree is a client-local escape
            // hatch. Remote runtime/SSH editors must not treat server paths as client paths.
            showLocalPathOpenBlockedToast()
            return
          }
          // Why: terminal file links already authorize clicked external paths
          // before opening them in AgentStart. Markdown file:// links need the same
          // user-gesture authorization so /tmp screenshots can use ImageViewer.
          await workspaceHostClient.fileHost.authorizeExternalPath({
            targetPath: target.absolutePath
          })
        } else {
          let stats: { isDirectory: boolean }
          try {
            stats = await statRuntimePath(fileContext, target.absolutePath)
          } catch {
            publishRendererCommandResult({
              type: 'editor-link-open-failed',
              reason: 'missing',
              path: target.relativePath
            })
            return
          }
          if (stats.isDirectory) {
            publishRendererCommandResult({
              type: 'editor-link-open-failed',
              reason: 'directory',
              path: target.relativePath
            })
            return
          }
        }

        get().openFile(
          {
            filePath: target.absolutePath,
            relativePath: target.relativePath ?? target.absolutePath,
            worktreeId: ctx.worktreeId,
            runtimeEnvironmentId: sourceRuntimeEnvironmentId,
            language: detectLanguage(target.absolutePath),
            mode: 'edit'
          },
          {
            preview: true,
            targetGroupId: get().activeGroupIdByWorktree?.[ctx.worktreeId],
            recordReplacedPreview: true
          }
        )
        if (line !== undefined) {
          const fileId = getOpenedEditFileIdAfterOpen(get(), target.absolutePath, ctx.worktreeId)
          scheduleEditorLineReveal(get, target.absolutePath, line, column, fileId)
        }
        return
      }

      // target.kind === 'markdown'
      const { absolutePath, relativePath, line, column } = target
      let stats: { isDirectory: boolean }
      try {
        stats = await statRuntimePath(fileContext, absolutePath)
      } catch {
        publishRendererCommandResult({
          type: 'editor-link-open-failed',
          reason: 'missing',
          path: relativePath
        })
        return
      }
      if (stats.isDirectory) {
        publishRendererCommandResult({
          type: 'editor-link-open-failed',
          reason: 'directory',
          path: relativePath
        })
        return
      }

      get().openFile(
        {
          filePath: absolutePath,
          relativePath,
          worktreeId: ctx.worktreeId,
          runtimeEnvironmentId: sourceRuntimeEnvironmentId,
          language: 'markdown',
          mode: 'edit'
        },
        {
          preview: true,
          targetGroupId: get().activeGroupIdByWorktree?.[ctx.worktreeId],
          recordReplacedPreview: true
        }
      )

      if (line !== undefined) {
        const fileId = getOpenedEditFileIdAfterOpen(get(), absolutePath, ctx.worktreeId)
        // Why: pendingEditorReveal is consumed by MonacoEditor on mount. If the
        // file stays in rich mode, the reveal is silently dropped; use the final
        // owner-qualified id after openFile has resolved the tab identity.
        get().setMarkdownViewMode(fileId, 'source')
        scheduleEditorLineReveal(get, absolutePath, line, column, fileId)
      }
    }
  }
}
