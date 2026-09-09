import type { GitBranchChangeEntry } from '@yiru/protocol/git/branch-compare-types'
import { detectLanguage } from '~renderer/file-presentation/language-detect'
import { joinPath } from '~renderer/path'
import { useAppStore } from '~renderer/store/state'

import type { DiffSection } from '../diff-section/types'
import type { OpenFile } from '../state'
import type { CombinedDiffModel } from './model'

type OpenCombinedDiffSectionOptions = Pick<
  CombinedDiffModel,
  'branchCompare' | 'commitCompare' | 'isAllMode' | 'isBranchMode' | 'isCommitMode'
> & {
  file: OpenFile
  section: DiffSection
}

export function openCombinedDiffSection({
  branchCompare,
  commitCompare,
  file,
  isAllMode,
  isBranchMode,
  isCommitMode,
  section
}: OpenCombinedDiffSectionOptions): void {
  const state = useAppStore.getState()
  const language = detectLanguage(section.path)
  const entry: GitBranchChangeEntry = {
    path: section.path,
    status: section.status as GitBranchChangeEntry['status'],
    oldPath: section.oldPath,
    added: section.added,
    removed: section.removed
  }
  const isBranchEntry = section.area === undefined

  if ((isBranchMode || (isAllMode && isBranchEntry)) && branchCompare) {
    state.openBranchDiff(file.worktreeId, file.filePath, entry, branchCompare, language)
    return
  }
  if (isCommitMode && commitCompare) {
    state.openCommitDiff(file.worktreeId, file.filePath, entry, commitCompare, language)
    return
  }
  state.openFile({
    filePath: joinPath(file.filePath, section.path),
    relativePath: section.path,
    worktreeId: file.worktreeId,
    runtimeEnvironmentId: file.runtimeEnvironmentId,
    language,
    mode: 'edit'
  })
}
