import { getLargeDiffRenderLimit } from '@agentstart/protocol/git/render-limit'
import { joinPath } from '~renderer/path'
import { getConnectionIdForFile } from '~renderer/runtime/connection-context'
import { writeRuntimeFile } from '~renderer/runtime/file-client'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import { useAppStore } from '~renderer/store/state'
import { findWorktreeById } from '~renderer/worktree/state/types'

import type { DiffSection } from '../diff-section/types'
import { getStoredTextDiffContent, getStoredTextDiffResult } from '../large-diff-section-content'
import type { OpenFile } from '../state'

export async function writeCombinedDiffSection(
  file: OpenFile,
  section: DiffSection,
  content: string
): Promise<void> {
  const absolutePath = joinPath(file.filePath, section.path)
  const connectionId = getConnectionIdForFile(file.worktreeId, absolutePath) ?? undefined
  const state = useAppStore.getState()
  const worktree = file.worktreeId ? findWorktreeById(state.worktreesByRepo, file.worktreeId) : null
  await writeRuntimeFile(
    {
      settings: settingsForRuntimeOwner(state.settings, file.runtimeEnvironmentId),
      worktreeId: file.worktreeId,
      worktreePath: worktree?.path ?? null,
      connectionId
    },
    absolutePath,
    content
  )
}

export function applyCombinedDiffSectionContent(
  section: DiffSection,
  content: string
): DiffSection {
  if (section.diffResult?.kind !== 'text') {
    return {
      ...section,
      modifiedContent: content,
      dirty: false
    }
  }
  const nextDiffResult = { ...section.diffResult, modifiedContent: content }
  const largeDiffRenderLimit = getLargeDiffRenderLimit({
    originalContent: section.originalContent,
    modifiedContent: content
  })
  const storedContent = getStoredTextDiffContent(nextDiffResult, largeDiffRenderLimit)
  return {
    ...section,
    modifiedContent: storedContent.modifiedContent,
    originalContent: storedContent.originalContent,
    dirty: false,
    diffResult: getStoredTextDiffResult(nextDiffResult, largeDiffRenderLimit),
    largeDiffRenderLimit
  }
}
