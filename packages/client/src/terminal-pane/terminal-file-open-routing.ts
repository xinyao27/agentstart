import { absolutePathToFileUri } from '~renderer/editor/markdown-internal-links'
import { detectLanguage } from '~renderer/file-presentation/language-detect'
import { getConnectionId } from '~renderer/runtime/connection-context'
import {
  isRemoteRuntimeFileOperation,
  statRuntimePath,
  type RuntimeFileOperationArgs
} from '~renderer/runtime/file-client'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { useAppStore } from '~renderer/store/state'
import { isPathInsideWorktree, toWorktreeRelativePath } from '~renderer/terminal/links/provider'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'

import { resolveKnownWorktreeRootPathLink } from './terminal-worktree-path-link'

type TerminalFileOpenDeps = {
  worktreeId: string
  worktreePath: string
  runtimeEnvironmentId?: string | null
  openWithSystemDefault?: boolean
}

export function isHtmlFilePath(filePath: string): boolean {
  return /\.html?$/i.test(filePath)
}

function openHtmlFileInBrowser(filePath: string, worktreeId: string): void {
  const store = useAppStore.getState()
  if (worktreeId) {
    // Why: following an HTML file link changes which worktree is foregrounded,
    // so it must record a history visit before opening the browser tab.
    activateAndRevealWorktree(worktreeId)
  }
  const fileUrl = absolutePathToFileUri(filePath)
  const title = filePath.split(/[/\\]/).pop() ?? filePath
  store.createBrowserTab(worktreeId, fileUrl, { title, activate: true })
}

export function getTerminalFileContext(
  worktreeId: string,
  worktreePath: string,
  runtimeEnvironmentId?: string | null
): RuntimeFileOperationArgs {
  const settings = useAppStore.getState().settings
  return {
    settings: settingsForRuntimeOwner(settings, runtimeEnvironmentId),
    worktreeId: worktreeId || null,
    worktreePath,
    connectionId: getConnectionId(worktreeId || null) ?? undefined
  }
}

export function shouldOpenTerminalFileWithSystemDefault(
  fileContext: RuntimeFileOperationArgs,
  filePath: string
): boolean {
  return !fileContext.connectionId && !isRemoteRuntimeFileOperation(fileContext, filePath)
}

let latestOpenDetectedFilePathRequestId = 0
let pendingEditorRevealFrameIds: number[] = []

function cancelPendingEditorRevealFrames(): void {
  if (typeof cancelAnimationFrame === 'function') {
    for (const frameId of pendingEditorRevealFrameIds) {
      cancelAnimationFrame(frameId)
    }
  }
  pendingEditorRevealFrameIds = []
}

function schedulePendingEditorReveal(callback: () => void): void {
  cancelPendingEditorRevealFrames()
  const firstFrameId = requestAnimationFrame(() => {
    pendingEditorRevealFrameIds = pendingEditorRevealFrameIds.filter(
      (frameId) => frameId !== firstFrameId
    )
    const secondFrameId = requestAnimationFrame(() => {
      pendingEditorRevealFrameIds = pendingEditorRevealFrameIds.filter(
        (frameId) => frameId !== secondFrameId
      )
      callback()
    })
    pendingEditorRevealFrameIds.push(secondFrameId)
  })
  pendingEditorRevealFrameIds.push(firstFrameId)
}

export function openDetectedFilePath(
  filePath: string,
  line: number | null,
  column: number | null,
  deps: TerminalFileOpenDeps
): void {
  const { openWithSystemDefault = false, runtimeEnvironmentId, worktreeId, worktreePath } = deps
  const requestId = ++latestOpenDetectedFilePathRequestId
  cancelPendingEditorRevealFrames()

  void (async () => {
    let statResult
    const fileContext = getTerminalFileContext(worktreeId, worktreePath, runtimeEnvironmentId)
    const canOpenWithSystemDefault = shouldOpenTerminalFileWithSystemDefault(fileContext, filePath)

    if (!openWithSystemDefault) {
      const worktreeRootLink = resolveKnownWorktreeRootPathLink(filePath)
      if (worktreeRootLink) {
        // Why: root workspace switching must work for SSH/runtime paths without
        // local auth/stat, while still coalescing provider + fallback clicks.
        await Promise.resolve()
        if (requestId !== latestOpenDetectedFilePathRequestId) {
          return
        }
        activateAndRevealWorktree(worktreeRootLink.id)
        return
      }
    }

    try {
      // Why: remote paths don't need local auth — the relay/runtime is the security boundary.
      if (canOpenWithSystemDefault) {
        await workspaceHostClient.fileHost.authorizeExternalPath({ targetPath: filePath })
      }
      statResult = await statRuntimePath(fileContext, filePath)
    } catch {
      return
    }

    if (requestId !== latestOpenDetectedFilePathRequestId) {
      return
    }

    if (openWithSystemDefault && canOpenWithSystemDefault) {
      // Why: Shift+Cmd/Ctrl mirrors URL links by escaping AgentStart and honoring the
      // user's OS file associations without adding editor-specific settings.
      const openedWithSystemDefault = await shellClient.shell.openFilePath(filePath)
      if (openedWithSystemDefault || statResult.isDirectory) {
        return
      }
    }

    if (statResult.isDirectory) {
      if (canOpenWithSystemDefault) {
        await shellClient.shell.openFilePath(filePath)
      }
      return
    }

    // Why: local HTML files render in AgentStart's browser for ordinary Cmd/Ctrl-click,
    // and remain the fallback if Shift+Cmd/Ctrl cannot launch the OS default.
    if (
      isHtmlFilePath(filePath) &&
      shouldOpenTerminalFileWithSystemDefault(fileContext, filePath)
    ) {
      openHtmlFileInBrowser(filePath, worktreeId)
      return
    }

    let relativePath = filePath
    if (worktreePath && isPathInsideWorktree(filePath, worktreePath)) {
      const maybeRelative = toWorktreeRelativePath(filePath, worktreePath)
      if (maybeRelative !== null && maybeRelative.length > 0) {
        relativePath = maybeRelative
      }
    }

    const store = useAppStore.getState()
    if (worktreeId) {
      // Why: terminal file links can jump across worktrees. Reusing the shared
      // activation path keeps those jumps in the same history stack as sidebar
      // and palette navigation before the editor opens the destination file.
      activateAndRevealWorktree(worktreeId)
    }

    const language = detectLanguage(filePath)
    store.openFile(
      {
        filePath,
        relativePath,
        worktreeId: worktreeId || '',
        language,
        mode: 'edit',
        runtimeEnvironmentId
      },
      { forceContentReload: true }
    )

    if (line !== null) {
      const openedStore = useAppStore.getState()
      // Why: the active editor id carries local/WSL/SSH ownership while the
      // path alone can identify multiple open tabs on different hosts.
      const fileId = openedStore.activeFileIdByWorktree[worktreeId] ?? filePath
      if (language === 'markdown') {
        // Why: rendered Markdown has no line-reveal consumer; source mode does.
        openedStore.setMarkdownViewMode(fileId, 'source')
      }
      const targetColumn = column ?? 1
      store.setPendingEditorReveal(null)
      schedulePendingEditorReveal(() => {
        if (requestId !== latestOpenDetectedFilePathRequestId) {
          return
        }
        store.setPendingEditorReveal({
          filePath,
          fileId,
          line,
          column: targetColumn,
          matchLength: 0
        })
      })
    }
  })()
}
