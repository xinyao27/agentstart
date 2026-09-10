import type { Repo } from '@agentstart/protocol/project/repository'
import { translate } from '~renderer/i18n/i18n'
import { ArrowsLeftRight as ArrowRightLeft } from '~renderer/icons/hugeicons'
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

import type {
  AgentStartProfileSummary,
  TransferAgentStartProfileProjectMode
} from './profile-model'
import type { AgentStartProfileSwitchLiveWorkSummary } from './switch-liveness'

type PendingProjectTransfer = {
  repo: Repo
  targetProfile: AgentStartProfileSummary
  mode: TransferAgentStartProfileProjectMode
  liveWorkSummary: AgentStartProfileSwitchLiveWorkSummary
}

export type { PendingProjectTransfer }

function liveWorkLines(summary: AgentStartProfileSwitchLiveWorkSummary): string[] {
  const lines: string[] = []
  if (summary.liveTerminalTabCount > 0) {
    lines.push(
      translate(
        summary.liveTerminalTabCount === 1
          ? 'auto.components.agentstart.profiles.project.transfer.confirm.terminalSingular'
          : 'auto.components.agentstart.profiles.project.transfer.confirm.terminalPlural',
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
          ? 'auto.components.agentstart.profiles.project.transfer.confirm.agentSingular'
          : 'auto.components.agentstart.profiles.project.transfer.confirm.agentPlural',
        summary.liveAgentCount === 1 ? '{{count}} active agent' : '{{count}} active agents',
        { count: summary.liveAgentCount }
      )
    )
  }
  if (summary.browserWorkspaceCount > 0) {
    lines.push(
      translate(
        summary.browserWorkspaceCount === 1
          ? 'auto.components.agentstart.profiles.project.transfer.confirm.browserSingular'
          : 'auto.components.agentstart.profiles.project.transfer.confirm.browserPlural',
        summary.browserWorkspaceCount === 1
          ? '{{count}} browser workspace'
          : '{{count}} browser workspaces',
        { count: summary.browserWorkspaceCount }
      )
    )
  }
  return lines
}

export function AgentStartProfileProjectTransferConfirmDialog({
  activeProfileName,
  pendingTransfer,
  pending,
  onCancel,
  onConfirm
}: {
  activeProfileName: string
  pendingTransfer: PendingProjectTransfer | null
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const mode = pendingTransfer?.mode ?? 'copy'
  const repoName = pendingTransfer?.repo.displayName ?? ''
  const targetName = pendingTransfer?.targetProfile.name ?? ''
  const lines = pendingTransfer ? liveWorkLines(pendingTransfer.liveWorkSummary) : []

  return (
    <Dialog
      open={Boolean(pendingTransfer)}
      onOpenChange={(open) => {
        if (!open && !pending) {
          onCancel()
        }
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="text-muted-foreground size-4" />
            {mode === 'move'
              ? translate(
                  'auto.components.agentstart.profiles.project.transfer.confirm.move.title',
                  'Move project?'
                )
              : translate(
                  'auto.components.agentstart.profiles.project.transfer.confirm.copy.title',
                  'Copy project?'
                )}
          </DialogTitle>
          <DialogDescription>
            {mode === 'move'
              ? translate(
                  'auto.components.agentstart.profiles.project.transfer.confirm.move.description',
                  'Move {{repoName}} to {{targetName}}. AgentStart removes it from {{activeProfileName}}, keeps files in place, and relaunches into {{targetName}}.',
                  { activeProfileName, repoName, targetName }
                )
              : translate(
                  'auto.components.agentstart.profiles.project.transfer.confirm.copy.description',
                  'Copy {{repoName}} to {{targetName}}. Both profiles will point at the same files with separate AgentStart metadata.',
                  { repoName, targetName }
                )}
          </DialogDescription>
        </DialogHeader>

        {lines.length > 0 ? (
          <div className="border-border bg-muted/40 border px-3 py-2 text-sm">
            <div className="text-foreground mb-1 font-medium">
              {translate(
                'auto.components.agentstart.profiles.project.transfer.confirm.live.work',
                'Live work in this project'
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
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            {translate(
              'auto.components.agentstart.profiles.project.transfer.confirm.cancel',
              'Cancel'
            )}
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={pending || !pendingTransfer}>
            {pending ? <LoadingIndicator className="size-4" /> : null}
            {mode === 'move'
              ? translate(
                  'auto.components.agentstart.profiles.project.transfer.confirm.move.action',
                  'Move project'
                )
              : translate(
                  'auto.components.agentstart.profiles.project.transfer.confirm.copy.action',
                  'Copy project'
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
