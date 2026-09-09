import { parseWorkspaceKey } from '@yiru/protocol/workspace/identity'
import { useLayoutEffect, useState } from 'react'
import { useAppStore } from '~renderer/store/state'
import type { AppState } from '~renderer/store/types'
import { getIndexedWorktreeById } from '~renderer/worktree/repo-index'

import { createConnectionIdForFileSelector } from '../connection-owner-resolution'
import type { HttpLinkSourceOwner } from '../http-link-routing'
import { createRichMarkdownHtmlSuperscriptLinkContext } from './html-superscript-link-context'
import { createRichMarkdownEditorCodec } from './source-transport'

export function resolveRichMarkdownWorktreeRoot(
  state: Pick<AppState, 'folderWorkspaces' | 'worktreesByRepo'>,
  worktreeId: string
): string | null {
  const workspaceScope = parseWorkspaceKey(worktreeId)
  return workspaceScope?.type === 'folder'
    ? (state.folderWorkspaces.find((workspace) => workspace.id === workspaceScope.folderWorkspaceId)
        ?.folderPath ?? null)
    : (getIndexedWorktreeById(state.worktreesByRepo, worktreeId)?.path ?? null)
}

export function useRichMarkdownSuperscriptLinkSetup({
  filePath,
  runtimeEnvironmentId,
  worktreeId
}: {
  filePath: string
  runtimeEnvironmentId?: string | null
  worktreeId: string
}) {
  const worktreeRoot = useAppStore((state) => resolveRichMarkdownWorktreeRoot(state, worktreeId))
  const runtimeId = runtimeEnvironmentId?.trim()
  const connectionIdSelector = (() => {
    return createConnectionIdForFileSelector(worktreeId, filePath, { skip: Boolean(runtimeId) })
  })()
  const connectionId = useAppStore(connectionIdSelector)
  const sourceOwner: HttpLinkSourceOwner = (() => {
    if (runtimeId) {
      return { kind: 'runtime', runtimeEnvironmentId: runtimeId }
    }
    if (connectionId === undefined) {
      return { kind: 'unknown' }
    }
    return connectionId === null ? { kind: 'local' } : { kind: 'ssh', connectionId }
  })()
  const [codec] = useState(createRichMarkdownEditorCodec)
  const [context] = useState(() =>
    createRichMarkdownHtmlSuperscriptLinkContext({
      sourceFilePath: filePath,
      worktreeId,
      worktreeRoot,
      sourceOwner
    })
  )
  useLayoutEffect(() => {
    context.update({ sourceFilePath: filePath, worktreeId, worktreeRoot, sourceOwner })
  }, [context, filePath, sourceOwner, worktreeId, worktreeRoot])
  return { codec, htmlSuperscriptLinkContext: context, worktreeRoot }
}
