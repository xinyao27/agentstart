import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { Trash as Trash2 } from '~renderer/icons/hugeicons'
import { BaseRefPicker } from '~renderer/settings/base-ref-picker'
import { readSourceControlLaunchRecipeAgentId } from '~renderer/source-control/agent-selection'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'
import { SourceControlAgentActionDialog } from '~renderer/workspace-panel/source-control/agent-action/agent-action-dialog'
import { SourceControlTextGenerationDialog } from '~renderer/workspace-panel/source-control/ai/text-generation-dialog'
import { SourceControlDiscardDialog } from '~renderer/workspace-panel/source-control/commit/discard-dialog'

import type { SourceControlController } from './controller'

export function SourceControlPanelDialogs({
  controller
}: {
  controller: SourceControlController
}): React.JSX.Element {
  const {
    activeConnectionId,
    activeGroupId,
    activeRepo,
    activeSourceControlLaunchPlatform,
    activeWorktreeId,
    baseRefDialogOpen,
    baseRefOwnedByWorktree,
    commitGenerationDialogOpen,
    confirmPendingDiscard,
    getLaunchActionRecipe,
    handleConfirmDiffCommentsClear,
    handleGenerate,
    handleGeneratePullRequestFields,
    handleSaveCommitMessageGenerationDefaults,
    handleSavePullRequestGenerationDefaults,
    isClearingDiffComments,
    openSourceControlAiSettings,
    pendingDiffCommentsClearCount,
    pendingDiffCommentsClearDescription,
    pendingDiscard,
    pickerBaseRef,
    pullRequestGenerationDialogOpen,
    refreshBranchCompare,
    resolveConflictsComposerOpen,
    resolveConflictsPrompt,
    resolvedPendingDiffCommentsClear,
    saveLaunchActionDefault,
    setBaseRefDialogOpen,
    setCommitGenerationDialogOpen,
    setPendingDiffCommentsClear,
    setPendingDiscard,
    setPullRequestGenerationDialogOpen,
    setResolveConflictsComposerOpen,
    settings,
    sourceControlAiActionsVisible,
    sourceControlAiDiscoveryHostKey,
    updateRepo,
    updateWorktreeMeta
  } = controller

  return (
    <>
      <Dialog
        open={resolvedPendingDiffCommentsClear !== null}
        onOpenChange={(open) => {
          if (!open && !isClearingDiffComments) {
            setPendingDiffCommentsClear(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {translate('auto.components.workspacePanel.SourceControl.574d2f4413', 'Clear Notes')}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {pendingDiffCommentsClearDescription}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDiffCommentsClear(null)}
              disabled={isClearingDiffComments}
            >
              {translate('auto.components.workspacePanel.SourceControl.05bb8f4a48', 'Cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmDiffCommentsClear()}
              disabled={isClearingDiffComments || pendingDiffCommentsClearCount === 0}
            >
              <Trash2 className="size-4" />
              {translate('auto.components.workspacePanel.SourceControl.574d2f4413', 'Clear Notes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SourceControlDiscardDialog
        pendingDiscard={pendingDiscard}
        onCancel={() => setPendingDiscard(null)}
        onConfirm={confirmPendingDiscard}
      />

      <Dialog open={baseRefDialogOpen} onOpenChange={setBaseRefDialogOpen}>
        <DialogContent className="flex max-h-[min(85vh,36rem)] max-w-xl flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-sm">
              {translate(
                'auto.components.workspacePanel.SourceControl.476b77745b',
                'Change Base Ref'
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {translate(
                'auto.components.workspacePanel.SourceControl.c9ad22888e',
                'Pick the branch compare target for this repository.'
              )}
            </DialogDescription>
          </DialogHeader>
          {activeRepo ? (
            <div className="scrollbar-sleek min-h-0 overflow-y-auto">
              <BaseRefPicker
                repoId={activeRepo.id}
                currentBaseRef={pickerBaseRef}
                onSelect={(ref) => {
                  if (baseRefOwnedByWorktree && activeWorktreeId) {
                    void updateWorktreeMeta(activeWorktreeId, { baseRef: ref })
                  } else {
                    void updateRepo(activeRepo.id, { worktreeBaseRef: ref })
                  }
                  setBaseRefDialogOpen(false)
                  window.setTimeout(() => void refreshBranchCompare(), 0)
                }}
                onUsePrimary={() => {
                  if (baseRefOwnedByWorktree && activeWorktreeId) {
                    void updateWorktreeMeta(activeWorktreeId, { baseRef: undefined })
                  } else {
                    void updateRepo(activeRepo.id, { worktreeBaseRef: undefined })
                  }
                  setBaseRefDialogOpen(false)
                  window.setTimeout(() => void refreshBranchCompare(), 0)
                }}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <SourceControlAgentActionDialog
        open={sourceControlAiActionsVisible && resolveConflictsComposerOpen}
        onOpenChange={setResolveConflictsComposerOpen}
        actionId="resolveConflicts"
        title={translate(
          'auto.components.workspacePanel.SourceControl.19652ddd76',
          'Resolve Conflicts With AI'
        )}
        description={translate(
          'auto.components.workspacePanel.SourceControl.901140f47d',
          'Review and edit the full command input before starting an agent.'
        )}
        baseCommandInput={resolveConflictsPrompt}
        worktreeId={activeWorktreeId}
        groupId={activeGroupId ?? activeWorktreeId}
        connectionId={activeConnectionId}
        repoId={activeRepo?.id ?? null}
        promptDelivery="submit-after-ready"
        launchPlatform={activeSourceControlLaunchPlatform}
        launchSource="conflict_resolution"
        savedAgentId={readSourceControlLaunchRecipeAgentId(
          getLaunchActionRecipe('resolveConflicts')
        )}
        savedCommandInputTemplate={
          getLaunchActionRecipe('resolveConflicts').commandInputTemplate ?? null
        }
        savedAgentArgs={getLaunchActionRecipe('resolveConflicts').agentArgs ?? null}
        onSaveAgentDefault={saveLaunchActionDefault}
        onOpenSettings={openSourceControlAiSettings}
        onLaunched={() =>
          toast.success(
            translate(
              'auto.components.workspacePanel.SourceControl.e48caaf0dd',
              'Started an AI agent for the conflicts.'
            )
          )
        }
      />

      <SourceControlTextGenerationDialog
        open={sourceControlAiActionsVisible && commitGenerationDialogOpen}
        onOpenChange={setCommitGenerationDialogOpen}
        actionId="commitMessage"
        title={translate(
          'auto.components.workspacePanel.SourceControl.6b122529d4',
          'Generate Commit Message'
        )}
        description={translate(
          'auto.components.workspacePanel.SourceControl.f4c766f1ca',
          'Choose the agent and command template for this run.'
        )}
        generateLabel="Generate"
        settings={settings}
        repo={activeRepo ?? null}
        discoveryHostKey={sourceControlAiDiscoveryHostKey}
        onGenerate={(params) => void handleGenerate({ sourceControlAiResolvedParams: params })}
        onSaveDefaults={handleSaveCommitMessageGenerationDefaults}
      />
      <SourceControlTextGenerationDialog
        open={sourceControlAiActionsVisible && pullRequestGenerationDialogOpen}
        onOpenChange={setPullRequestGenerationDialogOpen}
        actionId="pullRequest"
        title={translate(
          'auto.components.workspacePanel.SourceControl.1a6a6e0bc5',
          'Generate Hosted Review Details'
        )}
        description={translate(
          'auto.components.workspacePanel.SourceControl.f4c766f1ca',
          'Choose the agent and command template for this run.'
        )}
        generateLabel="Generate"
        settings={settings}
        repo={activeRepo ?? null}
        discoveryHostKey={sourceControlAiDiscoveryHostKey}
        onGenerate={(params) =>
          void handleGeneratePullRequestFields({ sourceControlAiResolvedParams: params })
        }
        onSaveDefaults={handleSavePullRequestGenerationDefaults}
      />
    </>
  )
}
