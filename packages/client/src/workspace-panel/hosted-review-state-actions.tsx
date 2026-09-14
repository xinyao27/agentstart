import { translate } from '~renderer/i18n/i18n'
import { Circle as CircleDot, Trash as Trash2 } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'

export function HostedReviewActionError({
  message
}: {
  message: string | null
}): React.JSX.Element | null {
  return message ? <div className="text-[10px] break-words text-rose-500">{message}</div> : null
}

export function ClosedReviewActions({
  shortLabel,
  stateUpdating,
  actionError,
  onReopenReview
}: {
  shortLabel: string
  stateUpdating: 'open' | 'closed' | null
  actionError: string | null
  onReopenReview: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="cursor-pointer text-[11px] hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onReopenReview}
        disabled={stateUpdating !== null}
      >
        {stateUpdating === 'open' ? (
          <LoadingIndicator className="size-3.5" />
        ) : (
          <CircleDot className="size-3.5" />
        )}
        {stateUpdating === 'open'
          ? translate(
              'auto.components.workspacePanel.HostedReviewActions.6645ac7dd1',
              'Reopening...'
            )
          : translate(
              'auto.components.workspacePanel.HostedReviewActions.3ce211ece6',
              'Reopen {{value0}}',
              { value0: shortLabel }
            )}
      </Button>
      <HostedReviewActionError message={actionError} />
    </div>
  )
}

export function MergedReviewActions({
  isDeletingWorktree,
  onDeleteWorktree
}: {
  isDeletingWorktree: boolean
  onDeleteWorktree: () => void
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      // Why: outline matches the sibling Reopen control; destructive text signals danger
      // without a solid red fill dominating the PR summary panel.
      className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
      onClick={onDeleteWorktree}
      disabled={isDeletingWorktree}
    >
      {isDeletingWorktree ? (
        <LoadingIndicator className="size-3.5" />
      ) : (
        <Trash2 className="size-3.5" />
      )}
      {isDeletingWorktree
        ? translate('auto.components.workspacePanel.HostedReviewActions.eefd50457e', 'Deleting...')
        : translate(
            'auto.components.workspacePanel.HostedReviewActions.e4aca40024',
            'Delete Workspace'
          )}
    </Button>
  )
}
