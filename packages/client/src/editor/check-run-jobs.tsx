import type { PRCheckJob, PRCheckStep } from '@yiru/protocol/hosted-review/review-types'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  CheckCircle as CheckCircle2,
  CircleDashed,
  MinusCircle,
  XCircle,
  CaretDown as ChevronDown
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { CheckJobLogTail } from '~renderer/workspace-panel/check-job-log-tail'

import { resolveStepOutcome, summarizeJobSteps, type StepOutcome } from './check-job-step-status'

function StepOutcomeIcon({ outcome }: { outcome: StepOutcome }): React.JSX.Element {
  switch (outcome) {
    case 'success':
      return <CheckCircle2 className="size-3.5 shrink-0 text-green-700 dark:text-green-300" />
    case 'failure':
      return <XCircle className="text-destructive size-3.5 shrink-0" />
    case 'skipped':
      return <MinusCircle className="text-muted-foreground/60 size-3.5 shrink-0" />
    case 'pending':
      return <CircleDashed className="text-muted-foreground size-3.5 shrink-0" />
  }
}

function StepRow({ step }: { step: PRCheckStep }): React.JSX.Element {
  const outcome = resolveStepOutcome(step)
  return (
    <div className="flex min-w-0 items-center gap-2 py-1 text-xs">
      <StepOutcomeIcon outcome={outcome} />
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          outcome === 'skipped' ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        {step.name}
      </span>
      <span className="text-muted-foreground shrink-0">{step.conclusion ?? step.status}</span>
    </div>
  )
}

function JobCard({ job, index }: { job: PRCheckJob; index: number }): React.JSX.Element {
  const breakdown = summarizeJobSteps(job)
  const jobFailed = resolveStepOutcome(job) === 'failure'
  // Failures matter most, so surface them and collapse the passing/skipped noise
  // behind a one-line summary. With no failures there is nothing to prioritize,
  // so expand by default rather than hiding the job's only content.
  const collapsible = [...breakdown.succeeded, ...breakdown.skipped, ...breakdown.pending]
  const failedStepKey = breakdown.failed
    .map((step) => `${step.name}:${step.status ?? ''}:${step.conclusion ?? ''}`)
    .join('\0')
  const [expandedFailureKey, setExpandedFailureKey] = React.useState<string | null>(null)
  const showRest = breakdown.failed.length === 0 || expandedFailureKey === failedStepKey

  const summaryParts: string[] = []
  if (breakdown.succeeded.length > 0) {
    summaryParts.push(
      `${breakdown.succeeded.length} ${translate(
        'auto.components.editor.CheckRunJobs.1c0a4d7e02',
        'succeeded'
      )}`
    )
  }
  if (breakdown.skipped.length > 0) {
    summaryParts.push(
      `${breakdown.skipped.length} ${translate(
        'auto.components.editor.CheckRunJobs.2d3b8f1a55',
        'skipped'
      )}`
    )
  }
  if (breakdown.pending.length > 0) {
    summaryParts.push(
      `${breakdown.pending.length} ${translate(
        'auto.components.editor.CheckRunJobs.3e6c9a2b71',
        'pending'
      )}`
    )
  }

  return (
    <div key={`${job.name}-${index}`} className="px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {jobFailed ? (
          <XCircle className="text-destructive size-4 shrink-0" />
        ) : (
          <CheckCircle2 className="size-4 shrink-0 text-green-700 dark:text-green-300" />
        )}
        <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
          {job.name}
        </span>
        {breakdown.failed.length > 0 && (
          <span className="bg-destructive/15 text-destructive shrink-0 px-2 py-0.5 text-[11px] font-medium">
            {breakdown.failed.length}
            {' / '}
            {breakdown.total}{' '}
            {translate('auto.components.editor.CheckRunJobs.4f7d0c3e88', 'steps failed')}
          </span>
        )}
      </div>

      {breakdown.failed.length > 0 && (
        <div className="mt-2 grid gap-0.5">
          {breakdown.failed.map((step) => (
            <StepRow key={step.name} step={step} />
          ))}
        </div>
      )}

      {collapsible.length > 0 && (
        <div className="mt-1">
          <Button
            variant="quiet"
            size="xs"
            type="button"
            onClick={() => setExpandedFailureKey(showRest ? null : failedStepKey)}
            className="flex h-auto w-full justify-start gap-1.5 border-0 py-1 font-normal whitespace-normal"
            aria-expanded={showRest}
          >
            <ChevronDown
              className={cn(
                'size-3.5 shrink-0 transition-transform',
                showRest ? 'rotate-0' : '-rotate-90'
              )}
            />
            <span>
              {summaryParts.join(
                translate('auto.components.editor.CheckRunJobs.5a8e1d4f23', ' · ')
              )}
            </span>
          </Button>
          {showRest && (
            <div className="mt-0.5 grid gap-0.5 pl-5">
              {collapsible.map((step) => (
                <StepRow key={step.name} step={step} />
              ))}
            </div>
          )}
        </div>
      )}

      {job.logTail && <CheckJobLogTail logTail={job.logTail} expanded={jobFailed} />}
    </div>
  )
}

export function CheckRunJobs({
  jobs,
  hasFailedJobs
}: {
  jobs: PRCheckJob[]
  hasFailedJobs: boolean
}): React.JSX.Element {
  return (
    <section className="border-border bg-background border">
      <div className="border-border border-b px-3 py-2 text-sm font-medium">
        {hasFailedJobs
          ? translate('auto.components.editor.CheckRunDetailsPanel.066fedd446', 'Failed jobs')
          : translate('auto.components.editor.CheckRunDetailsPanel.49731703ea', 'Jobs')}
      </div>
      <div className="divide-border/50 divide-y">
        {jobs.map((job, index) => (
          <JobCard key={`${job.name}-${index}`} job={job} index={index} />
        ))}
      </div>
    </section>
  )
}
