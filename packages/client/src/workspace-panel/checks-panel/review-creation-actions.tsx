import { showWorkspaceSidebar } from '../show-sidebar'
import type { useChecksPanelReviewMutationsState } from './review-mutations'

export function useChecksPanelReviewCreation(context: useChecksPanelReviewMutationsState) {
  const {
    activeConnectionId,
    activeWorktree,
    activeWorktreeId,
    branch,
    fetchUpstreamStatus,
    isPublishingBranch,
    isRemoteOperationActive,
    ownerSettings,
    pushBranch,
    refreshLinkedGitHubPullRequest,
    repo,
    setGitStatusRefreshNonce,
    setIsPublishingBranch,
    updateWorktreeMeta
  } = context

  const pushBeforeCreatePullRequest = async (): Promise<boolean> => {
    if (!activeWorktreeId || !activeWorktree?.path) {
      return false
    }
    const connectionId = activeConnectionId ?? undefined
    try {
      await pushBranch(
        activeWorktreeId,
        activeWorktree.path,
        false,
        connectionId,
        activeWorktree.pushTarget,
        { runtimeTargetSettings: ownerSettings }
      )
      await fetchUpstreamStatus(activeWorktreeId, activeWorktree.path, connectionId, undefined, {
        runtimeTargetSettings: ownerSettings
      })
      return true
    } catch {
      return false
    }
  }

  const handlePublishBranch = async (): Promise<void> => {
    if (
      !activeWorktreeId ||
      !activeWorktree?.path ||
      isPublishingBranch ||
      isRemoteOperationActive
    ) {
      return
    }
    const connectionId = activeConnectionId ?? undefined
    setIsPublishingBranch(true)
    try {
      await pushBranch(
        activeWorktreeId,
        activeWorktree.path,
        true,
        connectionId,
        activeWorktree.pushTarget,
        { runtimeTargetSettings: ownerSettings }
      )
      await fetchUpstreamStatus(
        activeWorktreeId,
        activeWorktree.path,
        connectionId,
        activeWorktree.pushTarget,
        { runtimeTargetSettings: ownerSettings }
      )
    } catch {
      // Store remote actions already surface the publish failure toast.
    } finally {
      // Why: publishing changes the upstream boundary the Checks panel uses to
      // decide between Publish, Create PR, and Push & Create PR.
      setGitStatusRefreshNonce((value) => value + 1)
      setIsPublishingBranch(false)
    }
  }

  const handlePullRequestCreated = async (result: { number: number }): Promise<void> => {
    if (!repo || !branch) {
      return
    }
    showWorkspaceSidebar({
      view: 'source-control',
      worktreeId: activeWorktreeId,
      sourceControlView: 'review'
    })
    try {
      if (activeWorktreeId) {
        await updateWorktreeMeta(activeWorktreeId, { linkedPR: result.number })
      }
      await refreshLinkedGitHubPullRequest(result.number)
    } catch {
      // The success toast keeps the hosted URL available; Checks can be refreshed manually.
    }
  }

  return { ...context, pushBeforeCreatePullRequest, handlePublishBranch, handlePullRequestCreated }
}

export type useChecksPanelReviewCreationState = ReturnType<typeof useChecksPanelReviewCreation>
