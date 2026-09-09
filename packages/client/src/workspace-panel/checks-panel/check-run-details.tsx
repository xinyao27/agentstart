import type { PRCheckDetail } from '@yiru/protocol/hosted-review/review-types'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Sidebar as PanelRight } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import CommentMarkdown from '~renderer/sidebar/comment-markdown'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import {
  formatCheckTimestamp,
  getCheckConclusion,
  getCheckDetailsStickySurfaceClass,
  getCheckStatusLabel,
  isFailureState,
  type CheckDetailsLoadState,
  type CheckDetailsStickySurface
} from './check-status'

function ViewFullCheckDetailsButton({
  onClick,
  label
}: {
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  label: string
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="quiet"
      size="xs"
      className="h-6 min-w-[7.25rem] shrink-0 gap-1 px-1.5 text-[11px]"
      onClick={onClick}
    >
      <PanelRight className="size-3" />
      {label}
    </Button>
  )
}

export function CheckRunDetails({
  check,
  state,
  checkDetailsContextKey,
  worktreeId,
  detailsStickySurface = 'sidebar',
  workspacePanelTabId
}: {
  check: PRCheckDetail
  state: CheckDetailsLoadState | undefined
  checkDetailsContextKey: string
  worktreeId: string | null
  detailsStickySurface?: CheckDetailsStickySurface
  workspacePanelTabId?: string
}): React.JSX.Element {
  const openCheckRunDetails = useAppStore((s) => s.openCheckRunDetails)
  const details = state?.details
  const startedAt = formatCheckTimestamp(details?.startedAt)
  const completedAt = formatCheckTimestamp(details?.completedAt)
  const detailsStatusCheck: PRCheckDetail = {
    ...check,
    status: (details?.status as PRCheckDetail['status'] | undefined) ?? check.status,
    conclusion: (details?.conclusion as PRCheckDetail['conclusion'] | undefined) ?? check.conclusion
  }
  const failedJobs =
    details?.jobs.filter((job) => {
      const state = job.conclusion ?? job.status
      return isFailureState(state)
    }) ?? []
  const jobs = failedJobs.length > 0 ? failedJobs : (details?.jobs ?? [])
  const hasOutput = Boolean(details?.title || details?.summary || details?.text)
  const hasAnnotations = (details?.annotations.length ?? 0) > 0
  const hasJobs = jobs.length > 0
  const hasLogTail = jobs.some((job) => Boolean(job.logTail))

  // Why: wait until inline details finish loading before switching to the logs label
  // so the sticky button does not resize mid-fetch.
  const fullDetailsLabel =
    !state?.loading && hasLogTail
      ? translate('auto.components.right.sidebar.checks.panel.content.b8c4e2a1f7', 'View full logs')
      : translate(
          'auto.components.right.sidebar.checks.panel.content.e4e3af15ee',
          'View full details'
        )

  const openFullDetailsView = (): void => {
    if (!worktreeId) {
      return
    }
    openCheckRunDetails(
      worktreeId,
      checkDetailsContextKey,
      check,
      {
        details: state?.details ?? null,
        loading: state?.loading ?? false,
        error: state?.error ?? null
      },
      {
        workspacePanelTabId,
        preview: Boolean(workspacePanelTabId)
      }
    )
  }

  const handleOpenFullDetails = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    openFullDetailsView()
  }

  return (
    <div className="border-border mr-3 mb-1 ml-[26px] min-w-0 border-l pl-3">
      {worktreeId && (
        // Why: inline check details can be long; pinning the affordance keeps it
        // visible while scrolling through annotations and job output.
        <div
          className={cn(
            'sticky top-0 z-10 -ml-3 flex min-w-0 items-center gap-2 border-b border-border/60 py-1 pl-3',
            getCheckDetailsStickySurfaceClass(detailsStickySurface)
          )}
        >
          <span className="text-foreground min-w-0 flex-1 truncate text-[11px] font-medium">
            {check.name}
          </span>
          <ViewFullCheckDetailsButton label={fullDetailsLabel} onClick={handleOpenFullDetails} />
        </div>
      )}
      {state?.loading ? (
        <div className="flex min-w-0 flex-col gap-2 py-1.5">
          <div className="text-muted-foreground flex items-center gap-2 text-[12px]">
            <LoadingIndicator className="size-3.5" />
            {translate(
              'auto.components.right.sidebar.checks.panel.content.1f2b980522',
              'Loading check details…'
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2.5 py-1.5">
          <div className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
            <span>
              {translate(
                'auto.components.right.sidebar.checks.panel.content.a54ae21c6f',
                'Status:'
              )}{' '}
              {details ? getCheckStatusLabel(detailsStatusCheck) : getCheckStatusLabel(check)}
            </span>
            {startedAt && (
              <span>
                {translate(
                  'auto.components.right.sidebar.checks.panel.content.fd46a70f1a',
                  'Started'
                )}
                {startedAt}
              </span>
            )}
            {completedAt && (
              <span>
                {translate(
                  'auto.components.right.sidebar.checks.panel.content.00e1c1658a',
                  'Completed'
                )}
                {completedAt}
              </span>
            )}
            {check.checkRunId && (
              <span className="font-mono">
                {translate(
                  'auto.components.right.sidebar.checks.panel.content.aa8494ae3c',
                  'check #'
                )}
                {check.checkRunId}
              </span>
            )}
            {check.workflowRunId && (
              <span className="font-mono">
                {translate(
                  'auto.components.right.sidebar.checks.panel.content.2dd5ddabc4',
                  'workflow #'
                )}
                {check.workflowRunId}
              </span>
            )}
          </div>

          {state?.error && <div className="text-muted-foreground text-[12px]">{state.error}</div>}

          {hasOutput && (
            <div className="min-w-0">
              {details?.title && (
                <div className="text-foreground mb-1 text-[12px] font-medium">{details.title}</div>
              )}
              {details?.summary && (
                <CommentMarkdown
                  content={details.summary}
                  variant="document"
                  className="max-w-full min-w-0 overflow-hidden text-[12px] leading-relaxed break-words [&_a]:break-all [&_code]:break-words [&_pre]:max-w-full"
                />
              )}
              {details?.text && (
                <CommentMarkdown
                  content={details.text}
                  variant="document"
                  className="mt-2 max-w-full min-w-0 overflow-hidden text-[12px] leading-relaxed break-words [&_a]:break-all [&_code]:break-words [&_pre]:max-w-full"
                />
              )}
            </div>
          )}

          {hasAnnotations && (
            <div className="border-border/60 min-w-0 border-t pt-2">
              <div className="text-muted-foreground mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
                {translate(
                  'auto.components.right.sidebar.checks.panel.content.f2fe8a4e8f',
                  'Annotations'
                )}
              </div>
              <div className="flex flex-col gap-2">
                {details!.annotations.map((annotation, index) => (
                  <div key={`${annotation.path ?? 'annotation'}-${index}`} className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-muted-foreground min-w-0 truncate font-mono text-[11px]">
                        {annotation.path ??
                          translate(
                            'auto.components.right.sidebar.checks.panel.content.cdbfda4dec',
                            'Annotation'
                          )}
                        {annotation.startLine ? `:${annotation.startLine}` : ''}
                      </span>
                      {annotation.annotationLevel && (
                        <span className="text-muted-foreground shrink-0 text-[11px]">
                          {annotation.annotationLevel}
                        </span>
                      )}
                    </div>
                    {annotation.title && (
                      <div className="text-foreground mt-0.5 text-[12px] font-medium">
                        {annotation.title}
                      </div>
                    )}
                    <div className="text-foreground mt-0.5 text-[12px] break-words">
                      {annotation.message}
                    </div>
                    {annotation.rawDetails && (
                      <pre className="bg-muted/40 text-muted-foreground mt-1 p-2 font-mono text-[11px] whitespace-pre-wrap">
                        {annotation.rawDetails}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
              {details!.annotations.length >= 20 && (
                <div className="text-muted-foreground mt-1.5 text-[10px]">
                  {translate(
                    'auto.components.right.sidebar.checks.panel.content.df137989b3',
                    'Showing first 20 annotations'
                  )}
                </div>
              )}
            </div>
          )}

          {hasJobs && (
            <div className="border-border/60 min-w-0 border-t pt-2">
              <div className="text-muted-foreground mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
                {failedJobs.length > 0
                  ? translate(
                      'auto.components.right.sidebar.checks.panel.content.066fedd446',
                      'Failed jobs'
                    )
                  : translate(
                      'auto.components.right.sidebar.checks.panel.content.49731703ea',
                      'Jobs'
                    )}
              </div>
              <div className="flex flex-col gap-2">
                {jobs.map((job, index) => (
                  <div key={`${job.name}-${index}`} className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-foreground min-w-0 flex-1 truncate text-[12px] font-medium">
                        {job.name}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-[11px]">
                        {job.conclusion ??
                          job.status ??
                          translate(
                            'auto.components.right.sidebar.checks.panel.content.ee07b33924',
                            'unknown'
                          )}
                      </span>
                    </div>
                    {job.steps.length > 0 && (
                      <div className="mt-1 grid gap-0.5 pl-2">
                        {job.steps
                          .filter((step) => {
                            const state = step.conclusion ?? step.status
                            return isFailureState(state)
                          })
                          .map((step) => (
                            <div
                              key={step.name}
                              className="text-muted-foreground flex min-w-0 items-center gap-2 text-[11px]"
                            >
                              <span className="min-w-0 flex-1 truncate">{step.name}</span>
                              <span className="shrink-0">{step.conclusion ?? step.status}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {(details?.jobs.length ?? 0) >= 100 && (
                <div className="text-muted-foreground mt-1.5 text-[10px]">
                  {translate(
                    'auto.components.right.sidebar.checks.panel.content.a2fb3f4408',
                    'Showing first 100 jobs'
                  )}
                </div>
              )}
            </div>
          )}

          {hasLogTail && (
            <div className="text-muted-foreground text-[11px]">
              {translate(
                'auto.components.right.sidebar.checks.panel.content.2524d1fb83',
                'Log tail available in full details.'
              )}
            </div>
          )}

          {!state?.error && !hasOutput && !hasAnnotations && !hasJobs && (
            <div className="text-muted-foreground text-[12px]">
              {getCheckConclusion(detailsStatusCheck) === 'action_required'
                ? translate(
                    'auto.components.right.sidebar.checks.panel.content.actionRequiredHint',
                    'Needs a manual action on GitHub (e.g. approving the run) to unblock merging.'
                  )
                : translate(
                    'auto.components.right.sidebar.checks.panel.content.e15a8b77ef',
                    'No inline details are available for this check.'
                  )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
