import { cn } from '~renderer/ui/class-names'
import {
  hasExpandedCommitFailureDetails,
  summarizeCommitFailure
} from '~renderer/workspace-panel/commit-failure-summary'
import { SOURCE_CONTROL_PANEL_GUTTER_CLASS_NAME } from '~renderer/workspace-panel/source-control/panel-constants'
import { getSourceControlRecoveryFailureKindLabel } from '~renderer/workspace-panel/source-control/review/push-recovery'

import { SourceControlCommitActions } from './commit-actions'
import type { CommitAreaProps } from './commit-area-types'
import { SourceControlCommitComposer } from './commit-composer'
import { isCommitMessageFieldDisabled } from './commit-eligibility'
import { getCommitMessageTextareaRows } from './commit-message-rows'
import { SourceControlCommitNotices } from './commit-notices'

export type { CommitAreaProps } from './commit-area-types'

export function CommitArea({
  worktreeId,
  groupId,
  connectionId,
  repoId,
  launchPlatform,
  commitMessage,
  commitError,
  commitFailureRecoveryPrompt,
  pushRecovery,
  remoteActionError,
  createPrIntentNotice,
  isCommitting,
  isFixingCommitFailureWithAI,
  isFixingPushFailureWithAI,
  isCreatingPr = false,
  isCreatePrIntentInFlight = false,
  showComposer = true,
  sourceControlAiActionsVisible,
  aiEnabled,
  aiAgentConfigured,
  isGenerating,
  generateError,
  stagedCount,
  hasPartiallyStagedChanges,
  hasUnresolvedConflicts,
  isRemoteOperationActive,
  inFlightRemoteOpKind,
  primaryAction,
  dropdownItems,
  fixCommitFailureRecipe,
  fixPushFailureRecipe,
  onCommitMessageChange,
  onGenerate,
  onCancelGenerate,
  onSaveLaunchActionDefault,
  onOpenSourceControlAiSettings,
  onFixCommitFailureWithAI,
  onFixPushFailureWithAI,
  onPrimaryAction,
  onDropdownAction
}: CommitAreaProps): React.JSX.Element {
  const rows = getCommitMessageTextareaRows(commitMessage)
  const primaryHostsRemoteOperation =
    primaryAction.kind === inFlightRemoteOpKind ||
    (primaryAction.kind === 'push' && inFlightRemoteOpKind === 'force_push')
  const showSpinner =
    primaryAction.kind === 'create_pr' || primaryAction.kind === 'create_pr_intent'
      ? isCreatingPr
      : primaryAction.kind === 'commit'
        ? isCommitting
        : isRemoteOperationActive && primaryHostsRemoteOperation
  const showChevronSpinner =
    (isCommitting || isCreatingPr || isRemoteOperationActive) && !showSpinner
  const commitFailureSummary = (() => (commitError ? summarizeCommitFailure(commitError) : null))()
  const commitFailureKindLabel = (() =>
    commitFailureSummary ? getSourceControlRecoveryFailureKindLabel(commitFailureSummary) : null)()
  const hasCommitFailureDetails = (() =>
    commitError && commitFailureSummary
      ? hasExpandedCommitFailureDetails(commitError, commitFailureSummary)
      : false)()
  const hasMessage = commitMessage.trim().length > 0
  const isCommitMessageDisabled = isCommitMessageFieldDisabled({
    stagedCount,
    hasPartiallyStagedChanges,
    hasMessage,
    hasUnresolvedConflicts,
    isCommitting,
    isRemoteOperationActive,
    isPullRequestOperationActive: isCreatingPr
  })
  const describedBy = [
    commitError ? 'commit-area-error' : null,
    pushRecovery ? 'commit-area-push-error' : null,
    remoteActionError ? 'commit-area-remote-error' : null,
    createPrIntentNotice ? 'commit-area-create-pr-intent' : null,
    generateError ? 'commit-area-generate-error' : null
  ]
    .filter(Boolean)
    .join(' ')
  const showGenerate =
    showComposer && aiEnabled && !isCreatePrIntentInFlight && (aiAgentConfigured || isGenerating)
  let generateDisabledReason: string | undefined
  if (isGenerating) {
    generateDisabledReason = 'Generating commit message…'
  } else if (isCommitting) {
    generateDisabledReason = 'Commit in progress…'
  } else if (!aiAgentConfigured) {
    generateDisabledReason = 'Pick an agent in Settings -> Git -> Source Control AI.'
  } else if (stagedCount === 0) {
    generateDisabledReason = 'Stage at least one file to generate a message.'
  } else if (hasMessage) {
    generateDisabledReason = 'Clear the message to regenerate.'
  }
  const isGenerateDisabled =
    !aiAgentConfigured ||
    isGenerating ||
    isCommitting ||
    stagedCount === 0 ||
    hasMessage ||
    hasUnresolvedConflicts

  return (
    <div className={cn('pb-2', SOURCE_CONTROL_PANEL_GUTTER_CLASS_NAME)}>
      {showComposer ? (
        <SourceControlCommitComposer
          rows={rows}
          commitMessage={commitMessage}
          isDisabled={isCommitMessageDisabled}
          describedBy={describedBy || undefined}
          showGenerate={showGenerate}
          isGenerating={isGenerating}
          isGenerateDisabled={isGenerateDisabled}
          generateDisabledReason={generateDisabledReason}
          onCommitMessageChange={onCommitMessageChange}
          onGenerate={onGenerate}
          onCancelGenerate={onCancelGenerate}
        />
      ) : null}
      <SourceControlCommitActions
        showComposer={showComposer}
        primaryAction={primaryAction}
        dropdownItems={dropdownItems}
        showSpinner={showSpinner}
        showChevronSpinner={showChevronSpinner}
        onPrimaryAction={onPrimaryAction}
        onDropdownAction={onDropdownAction}
      />
      <SourceControlCommitNotices
        commitError={commitError}
        commitFailureSummary={commitFailureSummary}
        commitFailureKindLabel={commitFailureKindLabel}
        hasCommitFailureDetails={hasCommitFailureDetails}
        commitFailureRecoveryPrompt={commitFailureRecoveryPrompt}
        pushRecovery={pushRecovery}
        remoteActionError={remoteActionError}
        createPrIntentNotice={createPrIntentNotice}
        generateError={generateError}
        worktreeId={worktreeId}
        groupId={groupId}
        connectionId={connectionId}
        repoId={repoId}
        launchPlatform={launchPlatform}
        sourceControlAiActionsVisible={sourceControlAiActionsVisible}
        isFixingCommitFailureWithAI={isFixingCommitFailureWithAI}
        isFixingPushFailureWithAI={isFixingPushFailureWithAI}
        fixCommitFailureRecipe={fixCommitFailureRecipe}
        fixPushFailureRecipe={fixPushFailureRecipe}
        onSaveLaunchActionDefault={onSaveLaunchActionDefault}
        onOpenSourceControlAiSettings={onOpenSourceControlAiSettings}
        onFixCommitFailureWithAI={onFixCommitFailureWithAI}
        onFixPushFailureWithAI={onFixPushFailureWithAI}
      />
    </div>
  )
}
