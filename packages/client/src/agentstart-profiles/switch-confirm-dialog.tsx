import { translate } from '~renderer/i18n/i18n'
import { Warning as AlertTriangle } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'

import type { AgentStartProfileSummary } from './profile-model'
import type { AgentStartProfileSwitchLiveWorkSummary } from './switch-liveness'

function liveWorkLines(summary: AgentStartProfileSwitchLiveWorkSummary): string[] {
  const lines: string[] = []
  if (summary.liveTerminalTabCount > 0) {
    lines.push(
      translate(
        summary.liveTerminalTabCount === 1
          ? 'auto.components.agentstart.profiles.switch.confirm.terminalSingular'
          : 'auto.components.agentstart.profiles.switch.confirm.terminalPlural',
        summary.liveTerminalTabCount === 1
          ? '{{count}} live terminal tab'
          : '{{count}} live terminal tabs',
        { count: summary.liveTerminalTabCount }
      )
    )
  }
  if (summary.liveAgentCount > 0) {
    lines.push(
      translate(
        summary.liveAgentCount === 1
          ? 'auto.components.agentstart.profiles.switch.confirm.agentSingular'
          : 'auto.components.agentstart.profiles.switch.confirm.agentPlural',
        summary.liveAgentCount === 1 ? '{{count}} active agent' : '{{count}} active agents',
        { count: summary.liveAgentCount }
      )
    )
  }
  if (summary.browserWorkspaceCount > 0) {
    lines.push(
      translate(
        summary.browserWorkspaceCount === 1
          ? 'auto.components.agentstart.profiles.switch.confirm.browserSingular'
          : 'auto.components.agentstart.profiles.switch.confirm.browserPlural',
        summary.browserWorkspaceCount === 1
          ? '{{count}} browser workspace'
          : '{{count}} browser workspaces',
        { count: summary.browserWorkspaceCount }
      )
    )
  }
  return lines
}

export function AgentStartProfileSwitchConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  activeProfileName,
  targetProfile,
  liveWorkSummary,
  switching
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  activeProfileName: string
  targetProfile: AgentStartProfileSummary | null
  liveWorkSummary: AgentStartProfileSwitchLiveWorkSummary
  switching: boolean
}): React.JSX.Element {
  const targetName =
    targetProfile?.name ??
    translate('auto.components.agentstart.profiles.switch.confirm.target', 'the selected profile')
  const lines = liveWorkLines(liveWorkSummary)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-muted-foreground size-4" />
            {translate(
              'auto.components.agentstart.profiles.switch.confirm.title',
              'Switch profiles?'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.agentstart.profiles.switch.confirm.description',
              'Switching to {{targetName}} will relaunch AgentStart and reload the workspace for {{activeProfileName}}.',
              { activeProfileName, targetName }
            )}
          </DialogDescription>
        </DialogHeader>

        {lines.length > 0 ? (
          <div className="border-border bg-muted/40 rounded-md border px-3 py-2 text-sm">
            <div className="text-foreground mb-1 font-medium">
              {translate(
                'auto.components.agentstart.profiles.switch.confirm.live.work',
                'Live work in this profile'
              )}
            </div>
            <ul className="text-muted-foreground space-y-1 text-xs">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={switching}
          >
            {translate('auto.components.agentstart.profiles.switch.confirm.cancel', 'Cancel')}
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={switching}>
            {switching ? <LoadingIndicator className="size-4" /> : null}
            {translate(
              'auto.components.agentstart.profiles.switch.confirm.switch',
              'Switch profile'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
