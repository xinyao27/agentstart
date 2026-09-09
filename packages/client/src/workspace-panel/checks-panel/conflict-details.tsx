import type {
  PRConflictSummary,
  PRMergeableState
} from '@yiru/protocol/hosted-review/pull-request-types'
import React, { useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Check, Copy, Files } from '~renderer/icons/hugeicons'
import { shellClient } from '~renderer/runtime/shell-client'
import { Button } from '~renderer/ui/button'

export type ConflictReview = {
  mergeable: PRMergeableState
  conflictSummary?: PRConflictSummary
}

export function buildMergeabilityRecalculationCommands(): string {
  return [
    'git fetch origin',
    'git commit --allow-empty --only -m "chore: refresh PR mergeability"',
    'git push'
  ].join('\n')
}

export function ConflictingFilesSection({ pr }: { pr: ConflictReview }): React.JSX.Element | null {
  const files = pr.conflictSummary?.files ?? []
  if (pr.mergeable !== 'CONFLICTING' || files.length === 0) {
    return null
  }

  // Why: the resolve action lives in the triage strip above; this section is
  // purely the informational conflict file list so the action isn't duplicated.
  return (
    <div className="border-border border-b px-3 py-3">
      <div className="text-muted-foreground text-[11px]">
        {pr.conflictSummary!.commitsBehind}{' '}
        {translate('auto.components.right.sidebar.checks.panel.content.6fa7f8723f', 'commit')}
        {pr.conflictSummary!.commitsBehind === 1 ? '' : 's'}{' '}
        {translate(
          'auto.components.right.sidebar.checks.panel.content.3916814392',
          'behind (base commit:'
        )}{' '}
        <span className="font-mono text-[10px]">{pr.conflictSummary!.baseCommit}</span>)
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Files className="text-muted-foreground size-3.5 shrink-0" />
        <div className="text-muted-foreground text-[11px]">
          {translate(
            'auto.components.right.sidebar.checks.panel.content.0975eeaaef',
            'Conflicting files'
          )}
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        {files.map((filePath) => (
          <div key={filePath} className="border-border bg-accent/20 border px-2.5 py-1.5">
            <div className="text-foreground font-mono text-[11px] leading-4 break-all">
              {filePath}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Fallback shown when the hosted review reports merge conflicts but no file list is available yet. */
export function MergeConflictNotice({
  pr,
  isRefreshingConflictDetails
}: {
  pr: ConflictReview
  isRefreshingConflictDetails: boolean
}): React.JSX.Element | null {
  if (pr.mergeable !== 'CONFLICTING' || (pr.conflictSummary?.files.length ?? 0) > 0) {
    return null
  }
  const locallyClean = pr.conflictSummary?.localMergeState === 'clean'
  let noticeBody = translate(
    'auto.components.right.sidebar.checks.panel.content.ae8a04ef17',
    'Conflict file details are unavailable'
  )
  if (isRefreshingConflictDetails) {
    noticeBody = translate(
      'auto.components.right.sidebar.checks.panel.content.73d0675356',
      'Refreshing conflict details…'
    )
  } else if (locallyClean) {
    noticeBody = translate(
      'auto.components.right.sidebar.checks.panel.content.f5bc5c4cf1',
      'The hosting provider reports conflicts, but local Git did not reproduce them. Refresh the review or push the branch to recalculate mergeability.'
    )
  }
  const refreshCommands = locallyClean ? buildMergeabilityRecalculationCommands() : null

  return (
    <div className="border-border border-t px-3 py-3">
      <div className="text-foreground text-[11px] font-medium">
        {translate(
          'auto.components.right.sidebar.checks.panel.content.87cd07c69a',
          'This branch has conflicts that must be resolved'
        )}
      </div>
      <div className="text-muted-foreground mt-1 text-[11px]">{noticeBody}</div>
      {refreshCommands ? <MergeabilityRecalculationCommandBox commands={refreshCommands} /> : null}
    </div>
  )
}

function MergeabilityRecalculationCommandBox({
  commands
}: {
  commands: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const copiedResetTimerRef = useRef<number | null>(null)
  const isMountedRef = useRef(false)

  const clearCopiedResetTimer = (): void => {
    if (copiedResetTimerRef.current !== null) {
      window.clearTimeout(copiedResetTimerRef.current)
      copiedResetTimerRef.current = null
    }
  }

  const setCopyButtonRef = (node: HTMLButtonElement | null) => {
    isMountedRef.current = node !== null
    if (node === null) {
      clearCopiedResetTimer()
    }
  }

  const copyCommands = (): void => {
    void shellClient.ui
      .writeClipboardText(commands)
      .then(() => {
        if (!isMountedRef.current) {
          return
        }
        clearCopiedResetTimer()
        setCopied(true)
        copiedResetTimerRef.current = window.setTimeout(() => {
          copiedResetTimerRef.current = null
          setCopied(false)
        }, 1500)
      })
      .catch(() => {
        /* best-effort */
      })
  }

  return (
    <div className="border-border bg-accent/20 mt-3 border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-muted-foreground text-[10px] font-medium">
          {translate(
            'auto.components.right.sidebar.checks.panel.content.5bc9bda2af',
            'Run from this worktree'
          )}
        </div>
        <Button
          ref={setCopyButtonRef}
          type="button"
          variant="outline"
          size="xs"
          onClick={copyCommands}
          aria-label={translate(
            'auto.components.right.sidebar.checks.panel.content.e87fb3d929',
            'Copy mergeability refresh commands'
          )}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied
            ? translate('auto.components.right.sidebar.checks.panel.content.1e53e45072', 'Copied')
            : translate(
                'auto.components.right.sidebar.checks.panel.content.084c516efb',
                'Copy commands'
              )}
        </Button>
      </div>
      <pre className="scrollbar-sleek border-border bg-background text-foreground mt-2 max-h-28 overflow-auto border px-2 py-1.5 font-mono text-[10px] leading-4 break-all whitespace-pre-wrap">
        {commands}
      </pre>
    </div>
  )
}
