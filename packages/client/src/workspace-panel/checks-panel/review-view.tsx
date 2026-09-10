import { resolveSourceControlActionRecipe } from '@agentstart/protocol/source-control/resolution'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { Check, Pencil, X } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { readSourceControlLaunchRecipeAgentId } from '~renderer/source-control/agent-selection'
import { getBrokenChecks } from '~renderer/source-control/checks-fix-prompt'
import { DetachedHeadBadge } from '~renderer/source-control/detached-head-badge'
import { Button } from '~renderer/ui/button'
import { Input } from '~renderer/ui/input'
import { ScrollArea } from '~renderer/ui/scroll-area'

import HostedReviewActions from '../hosted-review-actions'
import { SourceControlAgentActionDialog } from '../source-control/agent-action-dialog'
import {
  ConflictingFilesSection,
  MergeConflictNotice,
  ChecksList,
  PRCommentsList,
  PRTriageStrip
} from './content'
import type { useChecksPanelCreateReviewState } from './create-review'
import { ChecksPanelReviewHeader } from './review-header'

type ChecksPanelReviewViewProps = {
  context: useChecksPanelCreateReviewState
  workspacePanelTabId?: string
}

export function ChecksPanelReviewView({
  context,
  workspacePanelTabId
}: ChecksPanelReviewViewProps): React.JSX.Element | null {
  const {
    activeConflictReview,
    activeConnectionId,
    activeReview,
    activeSourceControlLaunchPlatform,
    activeWorktree,
    activeWorktreeId,
    agentComposerState,
    aiActionDisabledReason,
    canTargetPRComments,
    checks,
    checksLoading,
    comments,
    commentsDisabledReason,
    commentsLoading,
    commentsSelectionClearRequest,
    conflictDetailsRefreshing,
    detachedHeadDisplay,
    editingTitle,
    handleAddPRComment,
    handleCancelEdit,
    handleFixChecksWithAI,
    handleLinkAnotherPullRequest,
    handleLoadCheckDetails,
    handleOpenPR,
    handleRefresh,
    handleReplyToComment,
    handleResolve,
    handleResolveCommentsWithAI,
    handleResolveConflictsWithAI,
    handleSaveTitle,
    handleStartEdit,
    handleTitleKeyDown,
    handleUnlinkPullRequest,
    isFixingChecksWithAI,
    isRefreshing,
    isResolvingConflictsWithAI,
    linkedPR,
    pr,
    refreshHostedReviewAfterMutation,
    repo,
    resolveCommentsWithAIDisabledReason,
    resolveSelectedThreadsAfterLaunch,
    saveLaunchActionDefault,
    setAgentComposerState,
    setChecksPanelContentRef,
    setTitleDraft,
    settings,
    sourceControlAiActionsVisible,
    stateRequestKey,
    titleDraft,
    titleInputRef,
    titleSaving
  } = context

  if (!activeReview) {
    return null
  }
  const reviewShortLabel = 'PR'
  const shouldShowReviewTriageStrip =
    activeConflictReview !== null || getBrokenChecks(checks).length > 0
  const shouldShowReviewActions =
    activeReview.state === 'open' ||
    activeReview.state === 'closed' ||
    activeReview.state === 'merged'
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Hosted review header */}
      <div className="border-border border-b px-3 pt-1.5 pb-1">
        {/* Review number + state badge + refresh + open link */}
        <ChecksPanelReviewHeader
          review={activeReview}
          isRefreshing={isRefreshing}
          canUnlinkPullRequest={linkedPR !== null}
          onRefresh={() => void handleRefresh()}
          onOpenReview={handleOpenPR}
          onUnlinkPullRequest={handleUnlinkPullRequest}
          onLinkAnotherPullRequest={handleLinkAnotherPullRequest}
        />

        {/* Review title */}
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          {editingTitle ? (
            <>
              <Input
                ref={titleInputRef}
                size="xs"
                className="min-w-0 flex-1"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                disabled={titleSaving}
              />
              <Button
                variant="ghost"
                size="xs"
                className="focus-visible:bg-accent h-auto border-0 p-1 text-emerald-500 transition-colors hover:text-emerald-400 focus-visible:text-emerald-400 disabled:cursor-default"
                title={translate('auto.components.right.sidebar.ChecksPanel.2ab7fd4b6d', 'Save')}
                onClick={() => void handleSaveTitle()}
                disabled={titleSaving}
              >
                {titleSaving ? (
                  <LoadingIndicator className="size-3.5" />
                ) : (
                  <Check className="size-3.5" />
                )}
              </Button>
              <Button
                variant="quiet"
                size="xs"
                className="h-auto border-0 p-1 disabled:cursor-default"
                title={translate('auto.components.right.sidebar.ChecksPanel.058039787c', 'Cancel')}
                onClick={handleCancelEdit}
                disabled={titleSaving}
              >
                <X className="size-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="row-trigger"
                className="group/title min-w-0 flex-1 justify-start gap-1.5"
                title={activeReview.title}
                onClick={handleStartEdit}
              >
                <span
                  className="text-foreground min-w-0 flex-1 truncate text-[11px] leading-4"
                  title={activeReview.title}
                >
                  {activeReview.title}
                </span>
                <Pencil className="text-muted-foreground/40 can-hover:opacity-0 size-3 shrink-0 transition-opacity group-hover/title:opacity-100" />
              </Button>
              {activeReview.updatedAt && (
                <span className="text-muted-foreground/60 max-w-[45%] min-w-0 truncate text-right text-[11px]">
                  {reviewShortLabel}{' '}
                  {translate('auto.components.right.sidebar.ChecksPanel.34464d00b9', 'updated')}{' '}
                  {new Date(activeReview.updatedAt).toLocaleString()}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportRef={setChecksPanelContentRef}>
        {detachedHeadDisplay && (
          <div className="border-border border-b px-3 py-2">
            <DetachedHeadBadge display={detachedHeadDisplay} side="bottom" />
          </div>
        )}

        {shouldShowReviewActions && activeWorktree && repo && (
          <div className="border-border border-b px-3 py-2">
            <HostedReviewActions
              review={activeReview}
              githubPR={pr}
              repo={repo}
              worktree={activeWorktree}
              onRefreshReview={refreshHostedReviewAfterMutation}
            />
          </div>
        )}

        {shouldShowReviewTriageStrip && sourceControlAiActionsVisible && (
          <PRTriageStrip
            review={activeConflictReview ?? activeReview}
            checks={checks}
            isResolvingConflictsWithAI={isResolvingConflictsWithAI}
            onResolveConflictsWithAI={() => void handleResolveConflictsWithAI()}
            resolveConflictsDisabled={Boolean(aiActionDisabledReason)}
            resolveConflictsDisabledReason={aiActionDisabledReason}
            isFixingChecksWithAI={isFixingChecksWithAI}
            onFixChecksWithAI={() => void handleFixChecksWithAI()}
            fixChecksDisabled={Boolean(aiActionDisabledReason)}
            fixChecksDisabledReason={aiActionDisabledReason}
          />
        )}
        {activeConflictReview && (
          <>
            {/* Why: the triage strip owns the single Resolve action for PR
              conflicts; the file list and fallback notice are informational. */}
            <ConflictingFilesSection pr={activeConflictReview} />
            <MergeConflictNotice
              pr={activeConflictReview}
              isRefreshingConflictDetails={isRefreshing || conflictDetailsRefreshing}
            />
          </>
        )}
        {/* Why: when the hosted review has merge conflicts and no checks have been fetched,
          showing "No checks configured" is misleading — checks may exist but
          simply cannot run until conflicts are resolved. Hide the empty state. */}
        {!(activeConflictReview && checks.length === 0 && !checksLoading) && (
          <ChecksList
            checks={checks}
            checksLoading={checksLoading}
            checkDetailsContextKey={stateRequestKey}
            onLoadCheckDetails={handleLoadCheckDetails}
            workspacePanelTabId={workspacePanelTabId}
          />
        )}
        <PRCommentsList
          comments={comments}
          commentsLoading={commentsLoading}
          commentsDisabled={!canTargetPRComments}
          commentsDisabledReason={commentsDisabledReason}
          selectionContextKey={stateRequestKey}
          selectionClearRequest={commentsSelectionClearRequest}
          resolveCommentsWithAIDisabled={Boolean(resolveCommentsWithAIDisabledReason)}
          resolveCommentsWithAIDisabledReason={resolveCommentsWithAIDisabledReason}
          onAddComment={pr ? handleAddPRComment : undefined}
          onResolveSelectedCommentsWithAI={
            sourceControlAiActionsVisible ? handleResolveCommentsWithAI : undefined
          }
          onReply={pr ? handleReplyToComment : undefined}
          onResolve={pr ? handleResolve : undefined}
        />
        <SourceControlAgentActionDialog
          open={sourceControlAiActionsVisible && agentComposerState !== null}
          onOpenChange={(open) => {
            if (!open) {
              setAgentComposerState(null)
            }
          }}
          actionId={agentComposerState?.actionId ?? 'fixChecks'}
          title={
            agentComposerState?.title ??
            translate('auto.components.right.sidebar.ChecksPanel.7fad8509fe', 'Fix With AI')
          }
          description={agentComposerState?.description ?? ''}
          baseCommandInput={agentComposerState?.prompt ?? ''}
          worktreeId={activeWorktreeId}
          groupId={activeWorktreeId}
          connectionId={activeConnectionId}
          repoId={repo?.id ?? null}
          promptDelivery="submit-after-ready"
          launchPlatform={activeSourceControlLaunchPlatform}
          launchSource={agentComposerState?.launchSource ?? 'task_page'}
          savedAgentId={
            agentComposerState
              ? readSourceControlLaunchRecipeAgentId(
                  resolveSourceControlActionRecipe({
                    settings,
                    repo,
                    actionId: agentComposerState.actionId
                  })
                )
              : null
          }
          savedCommandInputTemplate={
            agentComposerState
              ? (resolveSourceControlActionRecipe({
                  settings,
                  repo,
                  actionId: agentComposerState.actionId
                }).commandInputTemplate ?? null)
              : null
          }
          savedAgentArgs={
            agentComposerState
              ? (resolveSourceControlActionRecipe({
                  settings,
                  repo,
                  actionId: agentComposerState.actionId
                }).agentArgs ?? null)
              : null
          }
          onSaveAgentDefault={saveLaunchActionDefault}
          onLaunched={() => {
            const launchedState = agentComposerState
            if (launchedState?.actionId === 'resolveComments' && launchedState.commentResolution) {
              void resolveSelectedThreadsAfterLaunch(launchedState.commentResolution).catch(
                (err) => {
                  console.warn('Failed to resolve selected review comments after AI launch:', err)
                  toast.error(
                    translate(
                      'auto.components.right.sidebar.ChecksPanel.495b2f8c4b',
                      'Started the agent, but could not mark the selected comments resolved.'
                    )
                  )
                }
              )
            } else if (launchedState?.actionId === 'resolveConflicts') {
              toast.success(
                translate(
                  'auto.components.right.sidebar.ChecksPanel.a0181a8d76',
                  'Started an AI agent for the conflicts.'
                )
              )
            } else {
              toast.success(
                translate(
                  'auto.components.right.sidebar.ChecksPanel.2ef90c9819',
                  'Started an AI agent for the broken checks.'
                )
              )
            }
          }}
        />
      </ScrollArea>
    </div>
  )
}
