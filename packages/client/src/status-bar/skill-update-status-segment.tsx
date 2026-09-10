import type { SkillUpdateOperation as SkillManageOperation } from '@agentstart/protocol'
import { translate } from '~renderer/i18n/i18n'
import {
  WarningCircle as AlertCircle,
  CheckCircle as CheckCircle2,
  ArrowClockwise as RefreshCw
} from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { requestSkillFreshnessUpdateDialog } from '../skills/skill-freshness-update-dialog-request'
import { useSkillUpdateRun } from '../skills/skill-update-run-store'

type SkillRunSegmentLabels = {
  running: string
  stopping: string
  success: string
  error: string
}

function segmentLabels(operation: SkillManageOperation): SkillRunSegmentLabels {
  switch (operation) {
    case 'update':
      return {
        running: translate(
          'auto.components.status.bar.SkillUpdateStatusSegment.runningLabel',
          'Updating skills'
        ),
        stopping: translate(
          'auto.components.status.bar.SkillUpdateStatusSegment.stoppingLabel',
          'Stopping skill update'
        ),
        success: translate(
          'auto.components.status.bar.SkillUpdateStatusSegment.successLabel',
          'Skills updated'
        ),
        error: translate(
          'auto.components.status.bar.SkillUpdateStatusSegment.errorLabel',
          'Skill update failed'
        )
      }
    case 'install':
      return {
        running: translate(
          'auto.components.status.bar.SkillUpdateStatusSegment.installRunningLabel',
          'Installing skill'
        ),
        stopping: translate(
          'auto.components.status.bar.SkillUpdateStatusSegment.installStoppingLabel',
          'Stopping skill install'
        ),
        success: translate(
          'auto.components.status.bar.SkillUpdateStatusSegment.installSuccessLabel',
          'Skill installed'
        ),
        error: translate(
          'auto.components.status.bar.SkillUpdateStatusSegment.installErrorLabel',
          'Skill install failed'
        )
      }
    case 'remove':
      return {
        running: translate(
          'auto.components.status.bar.SkillUpdateStatusSegment.removeRunningLabel',
          'Removing skill'
        ),
        stopping: translate(
          'auto.components.status.bar.SkillUpdateStatusSegment.removeStoppingLabel',
          'Stopping skill removal'
        ),
        success: translate(
          'auto.components.status.bar.SkillUpdateStatusSegment.removeSuccessLabel',
          'Skill removed'
        ),
        error: translate(
          'auto.components.status.bar.SkillUpdateStatusSegment.removeErrorLabel',
          'Skill removal failed'
        )
      }
  }
}

export function SkillUpdateStatusSegment(): React.JSX.Element | null {
  const run = useSkillUpdateRun()
  const openSkillsPage = useAppStore((s) => s.openSkillsPage)
  if (run.state === 'idle') {
    return null
  }

  const labels = segmentLabels(run.operation)
  const segment =
    run.state === 'running'
      ? {
          icon: <RefreshCw className="text-muted-foreground size-3 animate-spin" />,
          label: run.stopping ? labels.stopping : labels.running
        }
      : run.state === 'success'
        ? {
            icon: <CheckCircle2 className="text-muted-foreground size-3" />,
            label: labels.success
          }
        : {
            icon: <AlertCircle className="text-destructive size-3" />,
            label: labels.error
          }

  // Why: only the update run has a dialog that owns it; install and remove are
  // driven from the Skills page, so the segment routes back to where they live.
  const activate = run.operation === 'update' ? requestSkillFreshnessUpdateDialog : openSkillsPage

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="status-bar-icon"
            size="icon-status-bar-wide"
            type="button"
            onClick={activate}
            aria-label={segment.label}
          >
            {segment.icon}
          </Button>
        }
      />
      <TooltipContent side="top" sideOffset={6}>
        {segment.label}
      </TooltipContent>
    </Tooltip>
  )
}
