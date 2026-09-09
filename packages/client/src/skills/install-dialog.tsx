import type { SkillManageScope } from '@yiru/protocol'
import { useEffect, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Warning as AlertTriangle, CheckCircle as CheckCircle2 } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import type { SkillUpdateRun } from '~renderer/skills/freshness-model'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'
import { Input } from '~renderer/ui/input'
import { Label } from '~renderer/ui/label'
import { ScrollArea } from '~renderer/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~renderer/ui/select'

import { describeSkillRunFailure, SkillRunLog } from './run-log'
import {
  acknowledgeSkillUpdateRun,
  cancelSkillUpdateRun,
  holdSkillRunResult,
  startSkillInstallRun,
  useSkillRunForOperation
} from './skill-update-run-store'
import { describeSkillRunRejection } from './start-rejection'

/** What the marketplace hands over when the user picks a row. */
export type SkillInstallRequest = { source: string; skillName: string }

export type SkillInstallDialogProps = {
  request: SkillInstallRequest
  onOpenChange: (open: boolean) => void
}

const GLOBAL_SCOPE_VALUE = 'global'
const IDLE_RUN: SkillUpdateRun = { state: 'idle' }

export function SkillInstallDialog({
  request,
  onOpenChange
}: SkillInstallDialogProps): React.JSX.Element {
  const { repos } = useProjectCatalog()
  // Why: the scope becomes a spawn cwd, so only checkouts on this machine can
  // host a project-scoped install. Repo.connectionId used to exclude SSH
  // repos here, but it's dead — nothing sets it since remote hosts were
  // removed (#63) — every repo now qualifies.
  const localRepos = repos
  const [source, setSource] = useState(request.source)
  const [skillName, setSkillName] = useState(request.skillName)
  const [scopeValue, setScopeValue] = useState(GLOBAL_SCOPE_VALUE)
  const [submitted, setSubmitted] = useState(false)
  const [rejection, setRejection] = useState<string | null>(null)
  const liveRun = useSkillRunForOperation('install')
  // Why: the runner keeps the last settled run so the status bar can show it; a
  // freshly opened dialog must not present a stale result as its own, but it
  // should adopt an install that is still in flight.
  const run = submitted || liveRun.state === 'running' ? liveRun : IDLE_RUN

  useEffect(() => holdSkillRunResult(), [])

  const isRunning = run.state === 'running'
  const isStopping = isRunning && run.stopping === true
  const canSubmit = source.trim().length > 0 && !isRunning

  const submit = async (): Promise<void> => {
    setRejection(null)
    const trimmedName = skillName.trim()
    const scope: SkillManageScope =
      scopeValue === GLOBAL_SCOPE_VALUE
        ? { kind: 'global' }
        : { kind: 'project', repoPath: scopeValue }
    const result = await startSkillInstallRun({
      source: source.trim(),
      ...(trimmedName ? { skillNames: [trimmedName] } : {}),
      scope
    })
    if (!result?.started) {
      setRejection(describeSkillRunRejection(result?.reason))
      return
    }
    setSubmitted(true)
  }

  const handleOpenChange = (next: boolean): void => {
    if (next) {
      return
    }
    if (run.state === 'success' || run.state === 'error') {
      void acknowledgeSkillUpdateRun()
    }
    onOpenChange(false)
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.skills.SkillInstallDialog.title', 'Install skill')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.skills.SkillInstallDialog.description',
              'Runs the skills CLI against a repository source such as owner/repo.'
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="skill-install-source">
                  {translate('auto.components.skills.SkillInstallDialog.sourceLabel', 'Source')}
                </Label>
                <Input
                  id="skill-install-source"
                  value={source}
                  disabled={isRunning}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder={translate(
                    'auto.components.skills.SkillInstallDialog.sourcePlaceholder',
                    'owner/repo'
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="skill-install-name">
                  {translate(
                    'auto.components.skills.SkillInstallDialog.skillLabel',
                    'Skill name (optional)'
                  )}
                </Label>
                <Input
                  id="skill-install-name"
                  value={skillName}
                  disabled={isRunning}
                  onChange={(event) => setSkillName(event.target.value)}
                  placeholder={translate(
                    'auto.components.skills.SkillInstallDialog.skillPlaceholder',
                    'Leave empty to install every skill in the source'
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="skill-install-scope">
                  {translate(
                    'auto.components.skills.SkillInstallDialog.scopeLabel',
                    'Install into'
                  )}
                </Label>
                <Select
                  value={scopeValue}
                  onValueChange={(value) => setScopeValue(value ?? GLOBAL_SCOPE_VALUE)}
                  disabled={isRunning}
                >
                  <SelectTrigger id="skill-install-scope" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GLOBAL_SCOPE_VALUE}>
                      {translate(
                        'auto.components.skills.SkillInstallDialog.scopeGlobal',
                        'All projects (global)'
                      )}
                    </SelectItem>
                    {localRepos.map((repo) => (
                      <SelectItem key={repo.id} value={repo.path}>
                        {repo.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {rejection ? <p className="text-destructive text-xs">{rejection}</p> : null}

            {isRunning ? (
              <div className="flex items-center gap-2 text-sm font-medium">
                <LoadingIndicator className="size-4" />
                {isStopping
                  ? translate(
                      'auto.components.skills.SkillInstallDialog.stoppingHeadline',
                      'Stopping the install…'
                    )
                  : translate(
                      'auto.components.skills.SkillInstallDialog.runningHeadline',
                      'Installing…'
                    )}
              </div>
            ) : null}

            {run.state === 'success' ? (
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                {translate('auto.components.skills.SkillInstallDialog.success', 'Skill installed')}
              </div>
            ) : null}

            {run.state === 'error' ? (
              <div className="border-destructive text-muted-foreground space-y-2 border p-3 text-xs">
                <p className="text-foreground flex items-center gap-2 font-medium">
                  <AlertTriangle className="text-destructive size-4" />
                  {translate(
                    'auto.components.skills.SkillInstallDialog.errorTitle',
                    "The install didn't finish"
                  )}
                </p>
                <p className="font-mono text-[11px] break-words">{describeSkillRunFailure(run)}</p>
              </div>
            ) : null}

            {run.state === 'idle' ? null : <SkillRunLog output={run.output} />}
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
                  ? translate('auto.components.skills.SkillInstallDialog.stopping', 'Stopping…')
                  : translate('auto.components.skills.SkillInstallDialog.stop', 'Stop')}
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
              {run.state === 'success'
                ? translate('auto.components.skills.SkillInstallDialog.done', 'Done')
                : translate('auto.components.skills.SkillInstallDialog.close', 'Close')}
            </Button>
            <Button type="button" size="sm" disabled={!canSubmit} onClick={() => void submit()}>
              {run.state === 'error'
                ? translate('auto.components.skills.SkillInstallDialog.retry', 'Retry install')
                : translate('auto.components.skills.SkillInstallDialog.install', 'Install')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
