import { translate } from '~renderer/i18n/i18n'
import { GitFork } from '~renderer/icons/hugeicons'

import { CreateHostedReviewComposer } from '../create-hosted-review-composer'
import { describeForkPushTarget } from '../fork-push-target-label'
import { CommitArea } from './commit-area'
import type { SourceControlController } from './controller'
import { shouldRenderCommitArea, writeCommitDraftForWorktree } from './panel-state'

export function SourceControlPanelCommit({
  controller,
  showGenericEmptyState
}: {
  controller: SourceControlController
  showGenericEmptyState: boolean
}): React.JSX.Element | null {
  const {
    activeConnectionId,
    activeGroupId,
    activeRepo,
    activeSourceControlLaunchPlatform,
    activeWorktree,
    activeWorktreeId,
    branchName,
    commitError,
    commitFailureRecoveryPrompt,
    commitMessage,
    conflictOperation,
    createPrIntentNotice,
    directCreatePrAction,
    dropdownItems,
    generateError,
    getLaunchActionRecipe,
    grouped,
    handleActionInvoke,
    handleCancelGenerate,
    handleCancelGeneratePullRequestFields,
    handleCreatePullRequest,
    handleFixCommitFailureWithAI,
    handleFixPushFailureWithAI,
    handleGenerateCommitMessageClick,
    handleGeneratePullRequestFieldsClick,
    handlePrimaryClick,
    hasPartiallyStagedChanges,
    inFlightRemoteOpKind,
    isAbortingOperation,
    isCommitting,
    isCreatePrIntentInFlight,
    isCreatingPr,
    isGenerating,
    isLaunchingCommitFailureAgent,
    isLaunchingPushFailureAgent,
    isRemoteOperationActive,
    openSourceControlAiSettings,
    prAiGenerationEnabled,
    prBase,
    prBaseQuery,
    prBaseResults,
    prBaseSearchError,
    prBody,
    prDraft,
    prGenerateDisabled,
    prGenerateDisabledReason,
    prGenerateError,
    prGenerating,
    prTitle,
    primaryAction,
    pushRecovery,
    remoteActionError,
    resolvedCommitMessageAi,
    saveLaunchActionDefault,
    setPrBase,
    setPrBaseQuery,
    setPrBaseResults,
    setPrBody,
    setPrDraft,
    setPrTitle,
    sourceControlAiActionsVisible,
    unresolvedConflicts,
    updateCommitDrafts
  } = controller

  if (!shouldRenderCommitArea(unresolvedConflicts.length, conflictOperation)) {
    return null
  }

  return (
    <>
      {activeWorktree?.pushTarget && activeWorktree.pushTarget.remoteName !== 'origin' ? (
        <div
          className="text-muted-foreground flex items-center gap-1.5 px-1 text-[11px]"
          title={translate(
            'auto.components.right.sidebar.SourceControl.c05fe04839',
            'Pushes to the fork at {{value0}} (not origin)',
            { value0: activeWorktree.pushTarget.remoteName }
          )}
        >
          <GitFork className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {translate('auto.components.right.sidebar.SourceControl.78ce2d37ac', 'Pushes to fork')}
            {describeForkPushTarget(activeWorktree.pushTarget)}
          </span>
        </div>
      ) : null}

      {directCreatePrAction ? (
        <CreateHostedReviewComposer
          branch={branchName}
          base={prBase}
          setBase={setPrBase}
          title={prTitle}
          setTitle={setPrTitle}
          body={prBody}
          setBody={setPrBody}
          draft={prDraft}
          setDraft={setPrDraft}
          baseQuery={prBaseQuery}
          setBaseQuery={setPrBaseQuery}
          baseResults={prBaseResults}
          setBaseResults={setPrBaseResults}
          baseSearchError={prBaseSearchError}
          aiGenerationEnabled={sourceControlAiActionsVisible && prAiGenerationEnabled}
          generating={prGenerating}
          generateDisabled={prGenerateDisabled}
          generateDisabledReason={prGenerateDisabledReason}
          generateError={prGenerateError}
          createError={
            createPrIntentNotice?.tone === 'destructive' ? createPrIntentNotice.message : null
          }
          isCreating={isCreatingPr}
          primaryAction={directCreatePrAction}
          dropdownItems={dropdownItems}
          onGenerate={handleGeneratePullRequestFieldsClick}
          onCancelGenerate={handleCancelGeneratePullRequestFields}
          onPrimaryAction={() => void handleCreatePullRequest()}
          onDropdownAction={handleActionInvoke}
        />
      ) : (
        <CommitArea
          worktreeId={activeWorktreeId}
          connectionId={activeConnectionId}
          repoId={activeRepo?.id ?? null}
          launchPlatform={activeSourceControlLaunchPlatform}
          commitMessage={commitMessage}
          commitError={commitError}
          commitFailureRecoveryPrompt={commitFailureRecoveryPrompt}
          pushRecovery={pushRecovery}
          remoteActionError={pushRecovery ? null : (remoteActionError?.message ?? null)}
          createPrIntentNotice={createPrIntentNotice}
          isCommitting={isCommitting}
          isFixingCommitFailureWithAI={isLaunchingCommitFailureAgent}
          isFixingPushFailureWithAI={isLaunchingPushFailureAgent}
          isCreatingPr={isCreatingPr || isCreatePrIntentInFlight}
          isCreatePrIntentInFlight={isCreatePrIntentInFlight}
          groupId={activeGroupId ?? activeWorktreeId}
          showComposer={!showGenericEmptyState}
          sourceControlAiActionsVisible={sourceControlAiActionsVisible}
          aiEnabled={sourceControlAiActionsVisible && resolvedCommitMessageAi?.ok === true}
          aiAgentConfigured={resolvedCommitMessageAi?.ok === true}
          isGenerating={isGenerating}
          generateError={generateError}
          stagedCount={grouped.staged.length}
          hasPartiallyStagedChanges={hasPartiallyStagedChanges}
          hasUnresolvedConflicts={unresolvedConflicts.length > 0}
          isRemoteOperationActive={isRemoteOperationActive || isAbortingOperation}
          inFlightRemoteOpKind={inFlightRemoteOpKind}
          primaryAction={primaryAction}
          dropdownItems={dropdownItems}
          fixCommitFailureRecipe={getLaunchActionRecipe('fixCommitFailure')}
          fixPushFailureRecipe={getLaunchActionRecipe('fixPushFailure')}
          onCommitMessageChange={(value) => {
            if (activeWorktreeId) {
              updateCommitDrafts((previous) =>
                writeCommitDraftForWorktree(previous, activeWorktreeId, value)
              )
            }
          }}
          onGenerate={handleGenerateCommitMessageClick}
          onCancelGenerate={handleCancelGenerate}
          onSaveLaunchActionDefault={saveLaunchActionDefault}
          onOpenSourceControlAiSettings={openSourceControlAiSettings}
          onFixCommitFailureWithAI={handleFixCommitFailureWithAI}
          onFixPushFailureWithAI={handleFixPushFailureWithAI}
          onPrimaryAction={handlePrimaryClick}
          onDropdownAction={handleActionInvoke}
        />
      )}
    </>
  )
}
