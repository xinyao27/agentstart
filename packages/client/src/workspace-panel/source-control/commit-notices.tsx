import type {
  SourceControlActionRecipe,
  SourceControlLaunchActionId
} from '@yiru/protocol/source-control/ai-actions'
import { translate } from '~renderer/i18n/i18n'
import type { SourceControlAiWriteTarget } from '~renderer/source-control/ai-recipe-save'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import type { CreatePrIntentNotice } from './panel-types'
import {
  PullPolicyRemoteActionNotice,
  isPullPolicyRemoteActionError
} from './pull-policy-error-notice'
import type { SourceControlPushRecovery } from './push-recovery'
import { SourceControlRecoveryNotice } from './recovery-notice'

export function SourceControlCommitNotices({
  commitError,
  commitFailureKindLabel,
  commitFailureRecoveryPrompt,
  commitFailureSummary,
  connectionId,
  createPrIntentNotice,
  fixCommitFailureRecipe,
  fixPushFailureRecipe,
  generateError,
  groupId,
  hasCommitFailureDetails,
  isFixingCommitFailureWithAI,
  isFixingPushFailureWithAI,
  launchPlatform,
  onFixCommitFailureWithAI,
  onFixPushFailureWithAI,
  onOpenSourceControlAiSettings,
  onSaveLaunchActionDefault,
  pushRecovery,
  remoteActionError,
  repoId,
  sourceControlAiActionsVisible,
  worktreeId
}: {
  commitError: string | null
  commitFailureKindLabel: string | null
  commitFailureRecoveryPrompt: string | null
  commitFailureSummary: string | null
  connectionId?: string | null
  createPrIntentNotice?: CreatePrIntentNotice | null
  fixCommitFailureRecipe?: SourceControlActionRecipe
  fixPushFailureRecipe?: SourceControlActionRecipe
  generateError: string | null
  groupId: string | null
  hasCommitFailureDetails: boolean
  isFixingCommitFailureWithAI: boolean
  isFixingPushFailureWithAI: boolean
  launchPlatform?: NodeJS.Platform
  onFixCommitFailureWithAI: (promptOverride?: string) => Promise<boolean> | boolean
  onFixPushFailureWithAI: (promptOverride?: string) => Promise<boolean> | boolean
  onOpenSourceControlAiSettings?: () => void
  onSaveLaunchActionDefault?: (
    target: SourceControlAiWriteTarget,
    actionId: SourceControlLaunchActionId,
    recipe: SourceControlActionRecipe
  ) => void | Promise<void>
  pushRecovery: SourceControlPushRecovery | null
  remoteActionError: string | null
  repoId?: string | null
  sourceControlAiActionsVisible: boolean
  worktreeId: string | null
}): React.JSX.Element {
  return (
    <>
      {commitError && commitFailureSummary ? (
        <SourceControlRecoveryNotice
          id="commit-area-error"
          recoveryKind="commit"
          title={translate(
            'auto.components.right.sidebar.SourceControl.011f9713fc',
            'Commit blocked'
          )}
          detailsTitle={translate(
            'auto.components.right.sidebar.SourceControl.a9bf7c171a',
            'Commit Failed'
          )}
          summary={commitFailureSummary}
          detailText={commitError}
          hasDetails={hasCommitFailureDetails}
          kindLabel={commitFailureKindLabel}
          prompt={commitFailureRecoveryPrompt}
          worktreeId={worktreeId}
          groupId={groupId}
          connectionId={connectionId}
          repoId={repoId}
          launchPlatform={launchPlatform}
          sourceControlAiActionsVisible={sourceControlAiActionsVisible}
          isLaunching={isFixingCommitFailureWithAI}
          recipe={fixCommitFailureRecipe}
          onSaveLaunchActionDefault={onSaveLaunchActionDefault}
          onOpenSourceControlAiSettings={onOpenSourceControlAiSettings}
          onFixWithAI={onFixCommitFailureWithAI}
        />
      ) : null}
      {pushRecovery ? (
        <SourceControlRecoveryNotice
          id="commit-area-push-error"
          recoveryKind="push"
          title={translate(
            'auto.components.right.sidebar.SourceControl.pushRecovery.011f9713fc',
            'Push blocked'
          )}
          detailsTitle={translate(
            'auto.components.right.sidebar.SourceControl.pushRecovery.a9bf7c171a',
            'Push Failed'
          )}
          summary={pushRecovery.summary}
          detailText={pushRecovery.detailText}
          hasDetails={pushRecovery.hasDetails}
          kindLabel={pushRecovery.kindLabel}
          prompt={pushRecovery.prompt}
          worktreeId={worktreeId}
          groupId={groupId}
          connectionId={connectionId}
          repoId={repoId}
          launchPlatform={launchPlatform}
          sourceControlAiActionsVisible={sourceControlAiActionsVisible}
          isLaunching={isFixingPushFailureWithAI}
          recipe={fixPushFailureRecipe}
          onSaveLaunchActionDefault={onSaveLaunchActionDefault}
          onOpenSourceControlAiSettings={onOpenSourceControlAiSettings}
          onFixWithAI={onFixPushFailureWithAI}
        />
      ) : null}
      {remoteActionError && isPullPolicyRemoteActionError(remoteActionError) ? (
        <PullPolicyRemoteActionNotice id="commit-area-remote-error" />
      ) : remoteActionError ? (
        <p
          id="commit-area-remote-error"
          role="alert"
          aria-live="polite"
          className="text-destructive mt-1 text-[11px]"
        >
          {remoteActionError}
        </p>
      ) : null}
      {createPrIntentNotice ? (
        <div
          id="commit-area-create-pr-intent"
          role={createPrIntentNotice.tone === 'destructive' ? 'alert' : 'status'}
          aria-live="polite"
          className={cn(
            'mt-1 flex min-w-0 items-center gap-1.5 text-[11px]',
            createPrIntentNotice.tone === 'destructive'
              ? 'text-destructive'
              : 'text-muted-foreground'
          )}
        >
          {/* Why: recovery steps must wrap in the narrow sidebar. */}
          <span className="min-w-0 flex-1 leading-4 [overflow-wrap:anywhere] break-words">
            {createPrIntentNotice.message}
          </span>
          {createPrIntentNotice.action === 'settings' && onOpenSourceControlAiSettings ? (
            <Button
              variant="outline"
              size="xs"
              type="button"
              className="decoration-border hover:decoration-foreground focus-visible:bg-accent h-auto p-0 underline underline-offset-2"
              onClick={onOpenSourceControlAiSettings}
            >
              {translate(
                'auto.components.right.sidebar.SourceControl.473f18758e',
                'Source Control AI settings'
              )}
            </Button>
          ) : null}
        </div>
      ) : null}
      {generateError ? (
        <p
          id="commit-area-generate-error"
          role="alert"
          aria-live="polite"
          className="text-destructive mt-1 text-[11px]"
        >
          {generateError}
        </p>
      ) : null}
    </>
  )
}
