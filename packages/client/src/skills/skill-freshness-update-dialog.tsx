import { useState, useSyncExternalStore } from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  Warning as AlertTriangle,
  CheckCircle as CheckCircle2,
  Copy,
  ArrowClockwise as RefreshCw
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { notifyInstalledAgentSkillsChanged } from '~renderer/runtime/installed-agent-skill-discovery-state'
import type { SkillUpdateRun } from '~renderer/skills/freshness-model'
import { buildTargetedSkillUpdateCommand } from '~renderer/skills/update-command'
import { Button } from '~renderer/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~renderer/ui/dialog'
import { ScrollArea } from '~renderer/ui/scroll-area'

import { SkillRunLog } from './run-log'
import { SkillFreshnessGroup } from './skill-freshness-group'
import { groupSkillFreshness } from './skill-freshness-grouping'
import {
  consumeSkillFreshnessUpdateDialogRequest,
  getSkillFreshnessUpdateDialogRequest,
  subscribeSkillFreshnessUpdateDialog
} from './skill-freshness-update-dialog-request'
import {
  acknowledgeSkillUpdateRun,
  cancelSkillUpdateRun,
  startSkillUpdateRun,
  useSkillRunForOperation
} from './skill-update-run-store'
import { useSkillFreshness } from './use-skill-freshness'

function describeSkillUpdateFailure(run: Extract<SkillUpdateRun, { state: 'error' }>): string {
  switch (run.kind) {
    case 'launch-failed':
      return translate(
        'auto.components.skills.SkillFreshnessUpdateDialog.launchFailed',
        'The update command could not start: {{value0}}',
        { value0: run.detail }
      )
    case 'command-exited':
      return run.exitCode == null
        ? translate(
            'auto.components.skills.SkillFreshnessUpdateDialog.commandExitedUnknown',
            'The update command stopped unexpectedly.'
          )
        : translate(
            'auto.components.skills.SkillFreshnessUpdateDialog.commandExited',
            'The update command exited with code {{value0}}.',
            { value0: run.exitCode }
          )
    case 'incomplete':
      return translate(
        'auto.components.skills.SkillFreshnessUpdateDialog.incomplete',
        'Some skills could not be updated.'
      )
  }
}

export function SkillFreshnessUpdateDialog(): React.JSX.Element {
  const state = useSkillFreshness()
  const run = useSkillRunForOperation('update')
  const open = useSyncExternalStore(
    subscribeSkillFreshnessUpdateDialog,
    getSkillFreshnessUpdateDialogRequest,
    getSkillFreshnessUpdateDialogRequest
  )
  const [copied, setCopied] = useState(false)
  const inventory = state.inventory
  const eligibleNames = (() => state.inventory?.eligibleUpdateNames ?? [])()
  const displayEligibleCount = inventory?.eligibleUpdateNames.length ?? 0
  const runNames = (() => (run.state === 'idle' ? [] : run.names))()
  const groups = (() =>
    inventory
      ? groupSkillFreshness(inventory.installations, inventory.eligibleUpdateNames, runNames)
      : [])()
  const isRunning = run.state === 'running'
  const isStopping = isRunning && run.stopping === true
  const showResult = run.state === 'success' || run.state === 'error'

  const handleOpenChange = (next: boolean): void => {
    if (next) {
      return
    }
    consumeSkillFreshnessUpdateDialogRequest()
    setCopied(false)
    if (showResult) {
      void acknowledgeSkillUpdateRun()
    }
    notifyInstalledAgentSkillsChanged()
  }

  const copyRetryCommand = (): void => {
    const names = run.state === 'error' ? run.failedNames : eligibleNames
    const command = buildTargetedSkillUpdateCommand(names)
    if (!command) {
      return
    }
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2_000)
    })
  }

  const headline = ((): React.JSX.Element => {
    if (isRunning) {
      return (
        <div className="flex items-center gap-2 text-sm font-medium">
          <LoadingIndicator className="size-4" />
          {isStopping
            ? translate(
                'auto.components.skills.SkillFreshnessUpdateDialog.stoppingHeadline',
                'Stopping the update…'
              )
            : run.names.length === 1
              ? translate(
                  'auto.components.skills.SkillFreshnessUpdateDialog.runningOne',
                  'Updating 1 skill…'
                )
              : translate(
                  'auto.components.skills.SkillFreshnessUpdateDialog.runningMany',
                  'Updating {{value0}} skills…',
                  { value0: run.names.length }
                )}
        </div>
      )
    }
    if (run.state === 'success') {
      return (
        <div className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          {run.names.length === 1
            ? translate(
                'auto.components.skills.SkillFreshnessUpdateDialog.updatedOne',
                'Updated 1 skill'
              )
            : translate(
                'auto.components.skills.SkillFreshnessUpdateDialog.updatedMany',
                'Updated {{value0}} skills',
                { value0: run.names.length }
              )}
        </div>
      )
    }
    if (run.state === 'error') {
      return (
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="text-destructive size-4" />
          {translate(
            'auto.components.skills.SkillFreshnessUpdateDialog.updatedPartial',
            'Updated {{value0}} of {{value1}} skills',
            { value0: run.names.length - run.failedNames.length, value1: run.names.length }
          )}
        </div>
      )
    }
    if (state.loading || !inventory) {
      return (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <LoadingIndicator className="size-4" />
          {translate(
            'auto.components.skills.SkillFreshnessUpdateDialog.checking',
            'Checking installed Yiru skills…'
          )}
        </div>
      )
    }
    if (eligibleNames.length === 0) {
      return (
        <div className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          {translate(
            'auto.components.skills.SkillFreshnessUpdateDialog.success',
            'All installed Yiru skills are up to date.'
          )}
        </div>
      )
    }
    return (
      <p className="text-sm font-medium">
        {eligibleNames.length === 1
          ? translate(
              'auto.components.skills.SkillFreshnessUpdateDialog.updateOne',
              '1 skill can be updated safely'
            )
          : translate(
              'auto.components.skills.SkillFreshnessUpdateDialog.updateMany',
              '{{value0}} skills can be updated safely',
              { value0: eligibleNames.length }
            )}
      </p>
    )
  })()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[85vh] flex-col sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.skills.SkillFreshnessUpdateDialog.title', 'Update skills')}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4">
            {state.error && !isRunning && !showResult ? (
              <p className="text-destructive text-xs">{state.error}</p>
            ) : (
              headline
            )}

            {isRunning && !isStopping ? (
              <p className="text-muted-foreground text-xs">
                {translate(
                  'auto.components.skills.SkillFreshnessUpdateDialog.runningDescription',
                  'You can close this window — it keeps running in the background.'
                )}
              </p>
            ) : null}

            {groups.length > 0 ? (
              <div className="border-border min-w-0 border-t pt-3">
                {groups.map((group) => (
                  <SkillFreshnessGroup key={group.name} group={group} />
                ))}
              </div>
            ) : null}

            {run.state === 'error' ? (
              <div className="border-destructive text-muted-foreground space-y-2 border p-3 text-xs">
                <p className="text-foreground font-medium">
                  {translate(
                    'auto.components.skills.SkillFreshnessUpdateDialog.errorTitle',
                    "The update didn't finish"
                  )}
                </p>
                <p className="font-mono text-[11px] break-words">
                  {describeSkillUpdateFailure(run)}
                </p>
              </div>
            ) : null}

            {isRunning || showResult ? <SkillRunLog output={run.output} /> : null}
          </div>
        </ScrollArea>

        <DialogFooter className="sm:justify-between">
          <div>
            {isRunning ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isStopping}
                onClick={() => void cancelSkillUpdateRun()}
              >
                {isStopping
                  ? translate(
                      'auto.components.skills.SkillFreshnessUpdateDialog.stopping',
                      'Stopping…'
                    )
                  : translate('auto.components.skills.SkillFreshnessUpdateDialog.stop', 'Stop')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={state.loading}
                onClick={() => void state.refresh()}
              >
                <RefreshCw className={state.loading ? 'animate-spin' : undefined} />
                {translate(
                  'auto.components.skills.SkillFreshnessUpdateDialog.checkNow',
                  'Re-check'
                )}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {run.state === 'error' ? (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={copyRetryCommand}>
                  <Copy className="size-3.5" />
                  {copied
                    ? translate(
                        'auto.components.skills.SkillFreshnessUpdateDialog.copied',
                        'Copied'
                      )
                    : translate(
                        'auto.components.skills.SkillFreshnessUpdateDialog.copyCommand',
                        'Copy command'
                      )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void startSkillUpdateRun(run.failedNames)}
                >
                  {translate('auto.components.skills.SkillFreshnessUpdateDialog.retry', 'Retry')}
                </Button>
              </>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
              {run.state === 'success'
                ? translate('auto.components.skills.SkillFreshnessUpdateDialog.done', 'Done')
                : translate('auto.components.skills.SkillFreshnessUpdateDialog.close', 'Close')}
            </Button>
            {!showResult && displayEligibleCount > 0 ? (
              <Button
                type="button"
                size="sm"
                disabled={isRunning || eligibleNames.length === 0}
                onClick={() => void startSkillUpdateRun(eligibleNames)}
              >
                {displayEligibleCount === 1
                  ? translate(
                      'auto.components.skills.SkillFreshnessUpdateDialog.updateActionOne',
                      'Update 1 skill'
                    )
                  : translate(
                      'auto.components.skills.SkillFreshnessUpdateDialog.updateActionMany',
                      'Update {{value0}} skills',
                      { value0: displayEligibleCount }
                    )}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
