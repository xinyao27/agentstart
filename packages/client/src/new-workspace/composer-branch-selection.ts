import type { GitPushTarget } from '@yiru/protocol/git/worktree-source'

export type ComposerBranchSelection = {
  baseBranch: string
  branchNameOverride: string | undefined
  branchAutoName: string
  name: string | undefined
  lastAutoName: string | undefined
}

export function resolveComposerBranchSelection(args: {
  refName: string
  localBranchName: string
  currentName: string
  lastAutoName: string
}): ComposerBranchSelection {
  const trimmedCurrentName = args.currentName.trim()
  const shouldAutoName =
    !trimmedCurrentName ||
    args.currentName === args.lastAutoName ||
    args.localBranchName.startsWith(trimmedCurrentName) ||
    args.refName.startsWith(trimmedCurrentName)
  if (!shouldAutoName) {
    return {
      baseBranch: args.refName,
      branchNameOverride: undefined,
      branchAutoName: '',
      name: undefined,
      lastAutoName: undefined
    }
  }
  if (args.refName !== args.localBranchName) {
    // Why: a remote row is a checkout start point, not a request to recreate
    // its local leaf name. Leaving Branch name blank keeps the random-name flow.
    return {
      baseBranch: args.refName,
      branchNameOverride: undefined,
      branchAutoName: '',
      name: '',
      lastAutoName: ''
    }
  }
  return {
    baseBranch: args.refName,
    branchNameOverride: args.localBranchName,
    branchAutoName: args.localBranchName,
    name: args.localBranchName,
    lastAutoName: args.localBranchName
  }
}

/**
 * True when `branchName` is already checked out in one of the given worktree
 * branch refs (which may be `refs/heads/foo` or short `foo`). Git refuses to
 * check out a branch in two worktrees, so such a branch cannot be reused.
 */
export function isBranchCheckedOutInWorktrees(
  branchName: string,
  worktreeBranches: readonly string[]
): boolean {
  return worktreeBranches.some((ref) => ref.replace(/^refs\/heads\//, '') === branchName)
}

export function getComposerRepoWorktreeBranches(
  worktrees: readonly { repoId: string; branch: string }[],
  repoId: string | null
): string[] {
  return repoId
    ? worktrees.filter((worktree) => worktree.repoId === repoId).map((worktree) => worktree.branch)
    : []
}

/**
 * Issue #5181: decide whether a picked branch row is an existing LOCAL branch
 * that can be reused (checked out) instead of branched off, and whether reuse
 * should default ON.
 *
 * Reuse is only possible for a LOCAL branch (ref === local name; remote-only
 * refs carry an `origin/`-style prefix) that is NOT already checked out in
 * another worktree — git allows a branch in only one worktree at a time. Reuse
 * defaults ON only when the worktree name was auto-derived from the branch (the
 * selection produced a branch-name override); a user who typed a custom
 * worktree name first is branching off the ref, so reuse stays OFF unless they
 * opt in.
 */
export function resolveComposerBranchReuse(args: {
  refName: string
  localBranchName: string
  selectionProducedOverride: boolean
  branchCheckedOutElsewhere: boolean
}): { reuseEligibleBranch: string | null; defaultReuse: boolean } {
  const reuseEligibleBranch =
    args.refName === args.localBranchName && !args.branchCheckedOutElsewhere
      ? args.localBranchName
      : null
  return {
    reuseEligibleBranch,
    defaultReuse: reuseEligibleBranch !== null && args.selectionProducedOverride
  }
}

/**
 * Issue #5181: the branch-name override to apply for a picked branch. Only a
 * reusable local row may pin its existing branch. Remote rows are start points,
 * and busy local rows cannot be reused; pinning either local leaf would collide
 * and silently produce a numbered sibling.
 */
export function resolveComposerReuseOverride(args: {
  refName: string
  localBranchName: string
  branchNameOverride: string | undefined
  branchCheckedOutElsewhere: boolean
}): string | undefined {
  if (args.branchCheckedOutElsewhere || args.refName !== args.localBranchName) {
    return undefined
  }
  return args.branchNameOverride
}

export type ComposerBranchPick = ComposerBranchSelection & {
  reuseEligibleBranch: string | null
  defaultReuse: boolean
}

export function resolveComposerBranchPick(args: {
  refName: string
  localBranchName: string
  currentName: string
  lastAutoName: string
  worktreeBranches: readonly string[]
}): ComposerBranchPick {
  const selection = resolveComposerBranchSelection(args)
  const branchCheckedOutElsewhere = isBranchCheckedOutInWorktrees(
    args.localBranchName,
    args.worktreeBranches
  )
  const reuse = resolveComposerBranchReuse({
    refName: args.refName,
    localBranchName: args.localBranchName,
    selectionProducedOverride: selection.branchNameOverride !== undefined,
    branchCheckedOutElsewhere
  })
  const branchNameOverride = resolveComposerReuseOverride({
    refName: args.refName,
    localBranchName: args.localBranchName,
    branchNameOverride: selection.branchNameOverride,
    branchCheckedOutElsewhere
  })
  const shouldResetAutoNameForBusyBranch =
    branchCheckedOutElsewhere &&
    selection.branchNameOverride !== undefined &&
    branchNameOverride === undefined
  return {
    ...selection,
    // Why: the selected branch is only the starting point. Leaving its auto-filled
    // name behind turns a busy `main` into `main-2`; blank restores the temporary-name flow.
    ...(shouldResetAutoNameForBusyBranch ? { branchAutoName: '', name: '', lastAutoName: '' } : {}),
    branchNameOverride,
    ...reuse
  }
}

/**
 * The branch-name override to apply when creating a worktree from the composer.
 *
 * With no resolver-provided override, branch mode keeps a slash-containing
 * typed name as an explicit git branch. Other blank Branch name paths use the
 * composer's random workspace seed. With an override, keep it verbatim when
 * the workspace name is user-edited (`preserveWorkspaceNameEdits`) or still
 * matches the auto-name.
 */
export function resolveComposerBranchNameOverrideForCreate(args: {
  branchNameOverride: string | undefined
  branchAutoName: string
  workspaceName: string
  preserveWorkspaceNameEdits: boolean
  createBranchFromWorkspaceName?: boolean
}): string | undefined {
  if (!args.branchNameOverride) {
    return args.createBranchFromWorkspaceName && args.workspaceName.includes('/')
      ? args.workspaceName
      : undefined
  }
  if (args.preserveWorkspaceNameEdits) {
    return args.branchNameOverride
  }
  return args.workspaceName === args.branchAutoName ? args.branchNameOverride : undefined
}

export function resolveComposerManualBranchNameChange(args: {
  value: string | undefined
  pushTarget: GitPushTarget | undefined
  forkPushWarning: string | null
}): {
  branchNameOverride: string | undefined
  pushTarget: GitPushTarget | undefined
  forkPushWarning: string | null
} {
  const branchNameOverride = args.value?.trim() || undefined
  if (args.pushTarget && args.pushTarget.branchName !== branchNameOverride) {
    return {
      branchNameOverride,
      pushTarget: undefined,
      forkPushWarning: null
    }
  }
  return {
    branchNameOverride,
    pushTarget: args.pushTarget,
    forkPushWarning: args.forkPushWarning
  }
}
