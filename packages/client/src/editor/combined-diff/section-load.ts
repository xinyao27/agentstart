import type { GitDiffResult } from '@yiru/protocol/git/diff-values'
import { getLargeDiffRenderLimit } from '@yiru/protocol/git/render-limit'
import {
  getRuntimeGitBranchDiff,
  getRuntimeGitCommitDiff,
  getRuntimeGitDiff
} from '~renderer/runtime/git-client'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import { useAppStore } from '~renderer/store/state'

import type { DiffSection } from '../diff-section/types'
import { getStoredTextDiffContent, getStoredTextDiffResult } from '../large-diff-section-content'
import type { OpenFile } from '../state'
import type { CombinedDiffModel } from './model'
import { getCombinedDiffSectionConnectionId } from './section-connection'
import type { CombinedDiffEntry } from './section-model'
import { getDiffSectionLoadErrorMessage, withDiffSectionLoadTimeout } from './view-state'

export type LoadedCombinedDiffSection = {
  diffResult: GitDiffResult
  error?: string
  largeDiffRenderLimit: DiffSection['largeDiffRenderLimit']
  modifiedContent: string
  originalContent: string
}

type LoadCombinedDiffSectionOptions = Pick<
  CombinedDiffModel,
  'branchCompare' | 'commitCompare' | 'isAllMode' | 'isBranchMode' | 'isCommitMode'
> & {
  entry: CombinedDiffEntry
  file: OpenFile
}

export async function loadCombinedDiffSection({
  branchCompare,
  commitCompare,
  entry,
  file,
  isAllMode,
  isBranchMode,
  isCommitMode
}: LoadCombinedDiffSectionOptions): Promise<LoadedCombinedDiffSection> {
  let result: GitDiffResult
  let error: string | undefined
  try {
    result = await requestCombinedDiffSection({
      branchCompare,
      commitCompare,
      entry,
      file,
      isAllMode,
      isBranchMode,
      isCommitMode
    })
  } catch (caughtError) {
    error = getDiffSectionLoadErrorMessage(caughtError)
    result = {
      kind: 'text',
      originalContent: '',
      modifiedContent: '',
      originalIsBinary: false,
      modifiedIsBinary: false
    }
  }

  const largeDiffRenderLimit =
    !error && result.kind === 'text'
      ? (result.largeDiffRenderLimit ??
        getLargeDiffRenderLimit({
          originalContent: result.originalContent,
          modifiedContent: result.modifiedContent
        }))
      : null
  const storedContent = getStoredTextDiffContent(result, largeDiffRenderLimit)

  return {
    diffResult: getStoredTextDiffResult(result, largeDiffRenderLimit),
    error,
    largeDiffRenderLimit,
    modifiedContent: storedContent.modifiedContent,
    originalContent: storedContent.originalContent
  }
}

async function requestCombinedDiffSection({
  branchCompare,
  commitCompare,
  entry,
  file,
  isAllMode,
  isBranchMode,
  isCommitMode
}: LoadCombinedDiffSectionOptions): Promise<GitDiffResult> {
  const connectionId = getCombinedDiffSectionConnectionId(
    file.worktreeId,
    file.filePath,
    entry.path
  )
  const state = useAppStore.getState()
  const settings = settingsForRuntimeOwner(state.settings, file.runtimeEnvironmentId)
  const owner = {
    settings,
    worktreeId: file.worktreeId,
    worktreePath: file.filePath,
    connectionId
  }

  if ((isBranchMode || (isAllMode && !('area' in entry))) && branchCompare) {
    return withDiffSectionLoadTimeout(
      getRuntimeGitBranchDiff(owner, {
        compare: {
          baseRef: branchCompare.baseRef,
          baseOid: branchCompare.baseOid!,
          headOid: branchCompare.headOid!,
          mergeBase: branchCompare.mergeBase!
        },
        filePath: entry.path,
        oldPath: entry.oldPath
      })
    )
  }
  if (isCommitMode && commitCompare) {
    return withDiffSectionLoadTimeout(
      getRuntimeGitCommitDiff(owner, {
        commitOid: commitCompare.commitOid,
        parentOid: commitCompare.parentOid,
        filePath: entry.path,
        oldPath: entry.oldPath
      })
    )
  }
  return withDiffSectionLoadTimeout(
    getRuntimeGitDiff(owner, {
      filePath: entry.path,
      staged: 'area' in entry && entry.area === 'staged'
    })
  )
}
