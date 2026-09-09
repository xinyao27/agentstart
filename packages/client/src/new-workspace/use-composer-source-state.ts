import type { GitPushTarget } from '@yiru/protocol/git/worktree-source'
import { useEffect, useRef, useState } from 'react'
import { CONTEXTUAL_TOUR_ENABLE_AUTO_WORKSPACE_NAME_EVENT } from '~renderer/contextual-tours/contextual-tour-composer-events'
import type { WorkspaceCreateErrorDisplay } from '~renderer/new-workspace-composer-card/workspace-create-error-format'
import { getWorkspaceSourceProvider as getLinkedWorkItemProvider } from '~renderer/new-workspace/naming/source'
import type { SmartNameMode } from '~renderer/new-workspace/smart-workspace-source-results'
import type { LinkedWorkItemSummary } from '~renderer/new-workspace/workspace-creation'
import type { AppState } from '~renderer/store/state'

import type { UseComposerStateOptions } from './composer-contract'
import {
  getInitialAutoManagedWorkspaceName,
  normalizeGitHubLinkedWorkItem
} from './composer-initial-state'
import type { SmartGitHubPrStartPointSelection } from './resolve-smart-github-submit'

type UseComposerSourceStateOptions = Pick<
  UseComposerStateOptions,
  'initialBaseBranch' | 'initialLinkedWorkItem' | 'initialName' | 'initialPrompt' | 'persistDraft'
> & {
  draft: AppState['newWorkspaceDraft']
}

export function useComposerSourceState(options: UseComposerSourceStateOptions) {
  const initialName = options.initialName ?? ''
  const initialPrompt = options.initialPrompt ?? ''
  const initialLinkedWorkItem = options.initialLinkedWorkItem ?? null
  const [name, setName] = useState(
    options.persistDraft ? (options.draft?.name ?? initialName) : initialName
  )
  const [agentPrompt, setAgentPrompt] = useState(
    options.persistDraft ? (options.draft?.prompt ?? initialPrompt) : initialPrompt
  )
  const [note, setNote] = useState(options.persistDraft ? (options.draft?.note ?? '') : '')
  const initialLinkedWorkItemSeed = normalizeGitHubLinkedWorkItem(initialLinkedWorkItem)
  const draftLinkedWorkItemSeed = options.persistDraft
    ? normalizeGitHubLinkedWorkItem(options.draft?.linkedWorkItem)
    : null
  const linkedWorkItemSeed = options.persistDraft
    ? (draftLinkedWorkItemSeed ?? initialLinkedWorkItemSeed)
    : initialLinkedWorkItemSeed
  const linkedWorkItemSeedIdentity =
    linkedWorkItemSeed?.type === 'pr' && getLinkedWorkItemProvider(linkedWorkItemSeed) === 'github'
      ? linkedWorkItemSeed
      : null
  const [linkedWorkItem, setLinkedWorkItem] = useState<LinkedWorkItemSummary | null>(
    linkedWorkItemSeed
  )
  const [linkedPR, setLinkedPR] = useState<number | null>(() => {
    if (linkedWorkItemSeedIdentity?.type === 'pr') {
      return linkedWorkItemSeedIdentity.number
    }
    if (options.persistDraft && options.draft?.linkedPR !== undefined) {
      return options.draft.linkedPR
    }
    return initialLinkedWorkItem?.type === 'pr' ? initialLinkedWorkItem.number : null
  })
  const [baseBranch, setBaseBranch] = useState<string | undefined>(
    options.persistDraft ? options.draft?.baseBranch : options.initialBaseBranch
  )
  const [compareBaseRef, setCompareBaseRef] = useState<string | undefined>(
    options.persistDraft ? options.draft?.compareBaseRef : undefined
  )
  const [branchNameOverride, setBranchNameOverride] = useState<string | undefined>()
  const [branchNameOverridePreservesNameEdits, setBranchNameOverridePreservesNameEdits] =
    useState(false)
  const [smartNameMode, setSmartNameMode] = useState<SmartNameMode>('smart')
  const [reuseEligibleBranch, setReuseEligibleBranch] = useState<string | null>(null)
  const [reuseSelectedBranch, setReuseSelectedBranch] = useState(false)
  const [pushTarget, setPushTarget] = useState<GitPushTarget | undefined>()
  const [startFromResetHint, setStartFromResetHint] = useState<string | null>(null)
  const [forkPushWarning, setForkPushWarning] = useState<string | null>(null)
  const [createError, setCreateError] = useState<WorkspaceCreateErrorDisplay | null>(null)
  const lastAutoNameRef = useRef(
    getInitialAutoManagedWorkspaceName({
      draftName: options.persistDraft ? options.draft?.name : null,
      draftLinkedWorkItem: options.persistDraft ? draftLinkedWorkItemSeed : null,
      initialName,
      initialLinkedWorkItem: initialLinkedWorkItemSeed
    })
  )
  const nameRef = useRef(name)
  const branchAutoNameRef = useRef('')
  const lastAutoNoteRef = useRef('')
  const noteRef = useRef(note)
  const startPointSelectionRef = useRef<SmartGitHubPrStartPointSelection | null>(null)

  useEffect(() => {
    nameRef.current = name
    noteRef.current = note
  }, [name, note])

  useEffect(() => {
    const clearAutoManagedName = (): void => {
      if (nameRef.current === lastAutoNameRef.current) {
        setName('')
        lastAutoNameRef.current = ''
        setCreateError(null)
      }
    }
    window.addEventListener(CONTEXTUAL_TOUR_ENABLE_AUTO_WORKSPACE_NAME_EVENT, clearAutoManagedName)
    return () => {
      window.removeEventListener(
        CONTEXTUAL_TOUR_ENABLE_AUTO_WORKSPACE_NAME_EVENT,
        clearAutoManagedName
      )
    }
  }, [])

  const resetAutoManagedName = (): void => {
    lastAutoNameRef.current = ''
  }

  return {
    agentPrompt,
    baseBranch,
    branchAutoNameRef,
    branchNameOverride,
    branchNameOverridePreservesNameEdits,
    compareBaseRef,
    createError,
    draftLinkedWorkItemSeed,
    forkPushWarning,
    lastAutoNameRef,
    lastAutoNoteRef,
    linkedPR,
    linkedWorkItem,
    name,
    note,
    noteRef,
    pushTarget,
    resetAutoManagedName,
    reuseEligibleBranch,
    reuseSelectedBranch,
    setAgentPrompt,
    setBaseBranch,
    setBranchNameOverride,
    setBranchNameOverridePreservesNameEdits,
    setCompareBaseRef,
    setCreateError,
    setForkPushWarning,
    setLinkedPR,
    setLinkedWorkItem,
    setName,
    setNote,
    setPushTarget,
    setReuseEligibleBranch,
    setReuseSelectedBranch,
    setSmartNameMode,
    setStartFromResetHint,
    smartNameMode,
    startFromResetHint,
    startPointSelectionRef
  }
}
