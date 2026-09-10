import type { GitPushTarget } from '@agentstart/protocol/git/worktree-source'
import type { GitHubWorkItem } from '@agentstart/protocol/hosted-review/review-types'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import type { Dispatch, RefObject, SetStateAction } from 'react'

import {
  getComposerRepoWorktreeBranches,
  resolveComposerBranchPick
} from './composer-branch-selection'
import type { ComposerLinkedSourceActions } from './composer-linked-source'
import type { SmartGitHubPrStartPointSelection } from './resolve-smart-github-submit'
import type { LinkedWorkItemSummary } from './workspace-creation'

type ComposerBranchSourceOptions = {
  applyLinkedWorkItem: ComposerLinkedSourceActions['applyLinkedWorkItem']
  branchAutoNameRef: RefObject<string>
  lastAutoNameRef: RefObject<string>
  lastAutoNoteRef: RefObject<string>
  name: string
  noteRef: RefObject<string>
  repoId: string
  repoWorktrees: Worktree[]
  reuseEligibleBranch: string | null
  setBaseBranch: Dispatch<SetStateAction<string | undefined>>
  setBranchNameOverride: Dispatch<SetStateAction<string | undefined>>
  setBranchNameOverridePreservesNameEdits: Dispatch<SetStateAction<boolean>>
  setCompareBaseRef: Dispatch<SetStateAction<string | undefined>>
  setForkPushWarning: Dispatch<SetStateAction<string | null>>
  setLinkedPR: Dispatch<SetStateAction<number | null>>
  setLinkedWorkItem: Dispatch<SetStateAction<LinkedWorkItemSummary | null>>
  setName: Dispatch<SetStateAction<string>>
  setNote: Dispatch<SetStateAction<string>>
  setPushTarget: Dispatch<SetStateAction<GitPushTarget | undefined>>
  setReuseEligibleBranch: Dispatch<SetStateAction<string | null>>
  setReuseSelectedBranch: Dispatch<SetStateAction<boolean>>
  setStartFromResetHint: Dispatch<SetStateAction<string | null>>
  startPointSelectionRef: RefObject<SmartGitHubPrStartPointSelection | null>
}

export function createComposerBranchSourceActions(options: ComposerBranchSourceOptions) {
  const clearBranchRouting = (): void => {
    options.setCompareBaseRef(undefined)
    options.setPushTarget(undefined)
    options.setBranchNameOverride(undefined)
    options.setBranchNameOverridePreservesNameEdits(false)
    options.setReuseEligibleBranch(null)
    options.setReuseSelectedBranch(false)
    options.setForkPushWarning(null)
    options.branchAutoNameRef.current = ''
    options.setStartFromResetHint(null)
  }

  const handleBaseBranchChange = (next: string | undefined): void => {
    options.startPointSelectionRef.current = null
    options.setBaseBranch(next)
    clearBranchRouting()
  }

  const handleBaseBranchPrSelect = (
    nextBaseBranch: string,
    item: GitHubWorkItem,
    nextPushTarget?: GitPushTarget,
    nextBranchNameOverride?: string,
    nextCompareBaseRef?: string
  ): void => {
    options.setBaseBranch(nextBaseBranch)
    options.setCompareBaseRef(nextCompareBaseRef)
    options.setPushTarget(nextPushTarget)
    options.setBranchNameOverride(nextBranchNameOverride)
    options.setBranchNameOverridePreservesNameEdits(Boolean(nextBranchNameOverride))
    options.branchAutoNameRef.current = ''
    options.setStartFromResetHint(null)
    options.applyLinkedWorkItem(item, {
      preserveBranchNameOverride: Boolean(nextBranchNameOverride)
    })
    const suggestedNote = `PR #${item.number} — ${item.title}`
    const currentNote = options.noteRef.current
    if (!currentNote.trim() || currentNote === options.lastAutoNoteRef.current) {
      options.setNote(suggestedNote)
      options.lastAutoNoteRef.current = suggestedNote
    }
  }

  const handleSmartBranchSelect = (refName: string, localBranchName: string): void => {
    options.startPointSelectionRef.current = null
    const selection = resolveComposerBranchPick({
      refName,
      localBranchName,
      currentName: options.name,
      lastAutoName: options.lastAutoNameRef.current,
      worktreeBranches: getComposerRepoWorktreeBranches(options.repoWorktrees, options.repoId)
    })
    options.setBaseBranch(selection.baseBranch)
    options.setCompareBaseRef(undefined)
    options.setPushTarget(undefined)
    options.setStartFromResetHint(null)
    options.setForkPushWarning(null)
    const { reuseEligibleBranch, defaultReuse } = selection
    options.setReuseEligibleBranch(reuseEligibleBranch)
    options.setReuseSelectedBranch(defaultReuse)
    options.setBranchNameOverridePreservesNameEdits(defaultReuse)
    if (selection.name !== undefined && selection.lastAutoName !== undefined) {
      options.setName(selection.name)
      options.lastAutoNameRef.current = selection.lastAutoName
    }
    options.branchAutoNameRef.current = selection.branchNameOverride ? selection.branchAutoName : ''
    options.setBranchNameOverride(selection.branchNameOverride)
  }

  const handleReuseSelectedBranchChange = (next: boolean): void => {
    if (!options.reuseEligibleBranch) {
      return
    }
    options.setReuseSelectedBranch(next)
    options.setBranchNameOverridePreservesNameEdits(next)
    options.setBranchNameOverride(next ? options.reuseEligibleBranch : undefined)
    if (next) {
      options.branchAutoNameRef.current = options.reuseEligibleBranch
    }
  }

  const handleClearSmartNameSelection = (): void => {
    options.startPointSelectionRef.current = null
    options.setLinkedPR(null)
    options.setLinkedWorkItem(null)
    options.setBaseBranch(undefined)
    clearBranchRouting()
    if (options.name === options.lastAutoNameRef.current) {
      options.setName('')
      options.lastAutoNameRef.current = ''
    }
    if (options.noteRef.current === options.lastAutoNoteRef.current) {
      options.setNote('')
      options.lastAutoNoteRef.current = ''
    }
  }

  return {
    handleBaseBranchChange,
    handleBaseBranchPrSelect,
    handleClearSmartNameSelection,
    handleReuseSelectedBranchChange,
    handleSmartBranchSelect
  }
}
