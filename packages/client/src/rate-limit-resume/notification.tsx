// The rate-limit notice as a toast. One surface for every pane: a blocked
// agent is worth seeing whether the user is in a raw terminal,
// or looking at a different workspace entirely.

import { toast } from 'sonner'
import { formatAgentTypeLabel } from '~renderer/agent/title/type-label'
import { translate } from '~renderer/i18n/i18n'
import { formatResetDuration } from '~renderer/status-bar/reset-time'
import { useWorktreeById } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'
import { activateTabAndFocusPane } from '~renderer/tab-bar/activate-and-focus-pane'
import { Button } from '~renderer/ui/button'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'

import {
  cancelRateLimitResume,
  retryRateLimitedPromptNow,
  runRateLimitResumeNow,
  scheduleRateLimitResume
} from './card-actions'
import type { RateLimitNotice } from './notice-selection'
import { notifyRateLimitToastDismissed } from './use-rate-limit-resume-notifications'

function rateLimitToastId(ptyId: string): string {
  return `rate-limit-resume:${ptyId}`
}

/** Bring the blocked pane on screen: its workspace, then its tab and leaf. */
function revealBlockedPane(notice: RateLimitNotice): void {
  const { worktreeId, tabId, paneKey } = notice.hit
  activateAndRevealWorktree(worktreeId)
  const leafId = paneKey.slice(tabId.length + 1)
  activateTabAndFocusPane(tabId, leafId.length > 0 ? leafId : null, { flashFocusedPane: true })
}

function windowLabel(notice: RateLimitNotice): string {
  if (notice.hit.window === 'weekly') {
    return translate('rateLimitResume.window.weekly', 'Weekly quota')
  }
  if (notice.hit.window === 'session') {
    return translate('rateLimitResume.window.session', '5-hour quota')
  }
  return translate('rateLimitResume.window.unknown', 'Provider quota')
}

function DetailRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  )
}

// Why (matches the local-base-ref suggestion toast): sonner packs its built-in
// action/cancel buttons into the same row as the title, which squashes them.
// Rendering the body as a custom node puts the actions in a full-width footer
// while still reusing sonner's frame, icon, close button, and swipe-to-dismiss.
function RateLimitToastBody({
  notice,
  renderedAt
}: {
  notice: RateLimitNotice
  renderedAt: number
}): React.JSX.Element {
  const { hit, schedule } = notice
  const countdown = hit.resetsAt === null ? null : formatResetDuration(hit.resetsAt - renderedAt)
  const workspace = useWorktreeById(hit.worktreeId)?.displayName ?? null

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex flex-col gap-1">
        {workspace ? (
          <DetailRow
            label={translate('rateLimitResume.workspace', 'Workspace')}
            value={workspace}
          />
        ) : null}
        <DetailRow
          label={translate('rateLimitResume.resumesAt', 'Resumes at')}
          value={
            hit.resetDescription ??
            (countdown
              ? translate('rateLimitResume.resumesIn', 'in about {{countdown}}', { countdown })
              : translate('rateLimitResume.resumesUnknown', 'unknown'))
          }
        />
        <DetailRow
          label={translate('rateLimitResume.quotaWindow', 'Quota window')}
          value={windowLabel(notice)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="link" size="row-trigger" onClick={() => revealBlockedPane(notice)}>
          {translate('rateLimitResume.action.reveal', 'Show me')}
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          {schedule ? (
            <>
              <Button
                variant="outline"
                size="xs"
                onClick={() => void cancelRateLimitResume(schedule)}
              >
                {translate('rateLimitResume.action.cancel', 'Cancel auto-continue')}
              </Button>
              <Button size="xs" onClick={() => void runRateLimitResumeNow(schedule)}>
                {translate('rateLimitResume.action.runNow', 'Run now')}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="xs"
                onClick={() => void retryRateLimitedPromptNow(hit)}
              >
                {translate('rateLimitResume.action.retry', 'Retry now')}
              </Button>
              {hit.resetsAt === null ? null : (
                <Button size="xs" onClick={() => void scheduleRateLimitResume(hit)}>
                  {translate('rateLimitResume.action.schedule', 'Continue in about {{countdown}}', {
                    countdown: countdown ?? ''
                  })}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Raise or update the toast for one pane. Same id, so state changes in place. */
export function showRateLimitResumeToast(notice: RateLimitNotice): void {
  const { hit, schedule } = notice
  const renderedAt = Date.now()
  const agentLabel = formatAgentTypeLabel(hit.agent)
  const countdown = hit.resetsAt === null ? null : formatResetDuration(hit.resetsAt - renderedAt)
  const title = schedule
    ? translate(
        'rateLimitResume.title.scheduled',
        '{{agent}} will continue in about {{countdown}}',
        { agent: agentLabel, countdown: countdown ?? '' }
      )
    : translate('rateLimitResume.title.blocked', '{{agent}} is temporarily unavailable', {
        agent: agentLabel
      })
  const options = {
    id: rateLimitToastId(hit.ptyId),
    description: <RateLimitToastBody notice={notice} renderedAt={renderedAt} />,
    // Why: an outage lasts hours. A toast that auto-expires would strand the
    // user with no way back to the decision.
    duration: Infinity,
    dismissible: true,
    // Why: closing the toast on a SCHEDULED resume must not cancel it — that is
    // what "Cancel auto-continue" is for. The subscriber suppresses the reshow;
    // the schedule keeps living in main. With no schedule yet, closing is the
    // user declining, so the hit is dropped outright.
    onDismiss: () => {
      notifyRateLimitToastDismissed(hit.ptyId)
      if (!schedule) {
        useAppStore.getState().dismissRateLimitHit(hit.ptyId)
      }
    }
  }
  if (schedule) {
    toast.info(title, options)
    return
  }
  toast.warning(title, options)
}

export function dismissRateLimitResumeToast(ptyId: string): void {
  toast.dismiss(rateLimitToastId(ptyId))
}
