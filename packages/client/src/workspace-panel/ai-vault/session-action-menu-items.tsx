import { translate } from '~renderer/i18n/i18n'
import {
  Copy,
  FileCode as FileJson,
  FolderOpen,
  ChatCentered as MessageSquarePlus,
  Crosshair as LocateFixed,
  Layout as PanelTopOpen,
  Play
} from '~renderer/icons/hugeicons'
import { ContextMenuItem, ContextMenuSeparator } from '~renderer/ui/context-menu'
import { DropdownMenuItem, DropdownMenuSeparator } from '~renderer/ui/dropdown-menu'

export function SessionActionMenuItems({
  menuKind = 'dropdown',
  resumeDisabled,
  resumeLabel,
  onResume,
  onContinueInNewSession,
  onJumpToOriginalPane,
  showJumpToWorktree,
  onJumpToWorktree,
  onCopyResume,
  onCopyId,
  onCopyPath,
  onOpenLog,
  onRevealLog,
  onOpenCwd
}: {
  menuKind?: 'dropdown' | 'context'
  resumeDisabled: boolean
  resumeLabel: string
  onResume: () => void
  onContinueInNewSession?: () => void
  onJumpToOriginalPane?: () => void
  showJumpToWorktree: boolean
  onJumpToWorktree?: () => void
  // Absent for zero-turn sessions: copying a resume command that lands in an
  // empty conversation would contradict the "not saved" state.
  onCopyResume?: () => void
  onCopyId: () => void
  onCopyPath: () => void
  onOpenLog?: () => void
  onRevealLog?: () => void
  onOpenCwd?: () => void
}) {
  const Item = menuKind === 'context' ? ContextMenuItem : DropdownMenuItem
  const Separator = menuKind === 'context' ? ContextMenuSeparator : DropdownMenuSeparator
  const hasLocalPathActions = Boolean(onOpenLog || onRevealLog || onOpenCwd)

  return (
    <>
      {onJumpToOriginalPane ? (
        <Item onClick={onJumpToOriginalPane}>
          <LocateFixed className="size-3.5" />
          {translate(
            'auto.components.workspacePanel.AiVaultSessionRow.jumpToOriginalPane',
            'Jump to Original Pane'
          )}
        </Item>
      ) : null}
      {showJumpToWorktree ? (
        <Item disabled={!onJumpToWorktree} onClick={onJumpToWorktree}>
          <PanelTopOpen className="size-3.5" />
          {translate(
            'auto.components.workspacePanel.AiVaultSessionRow.jumpToWorktree',
            'Jump to Worktree'
          )}
        </Item>
      ) : null}
      <Item disabled={resumeDisabled} onClick={onResume}>
        <Play className="size-3.5" />
        {resumeLabel}
      </Item>
      {onContinueInNewSession ? (
        <Item onClick={onContinueInNewSession}>
          <MessageSquarePlus className="size-3.5" />
          {translate(
            'components.agentSessionContinuation.continueInNewSession',
            'Continue in New Session…'
          )}
        </Item>
      ) : null}
      {onCopyResume ? (
        <Item onClick={onCopyResume}>
          <Copy className="size-3.5" />
          {translate(
            'auto.components.workspacePanel.AiVaultSessionRow.copyResumeCommand',
            'Copy Resume Command'
          )}
        </Item>
      ) : null}
      {hasLocalPathActions ? (
        <>
          <Separator />
          {onOpenLog ? (
            <Item onClick={onOpenLog}>
              <FileJson className="size-3.5" />
              {translate('auto.components.workspacePanel.AiVaultSessionRow.openLog', 'Open Log')}
            </Item>
          ) : null}
          {onRevealLog ? (
            <Item onClick={onRevealLog}>
              <FolderOpen className="size-3.5" />
              {translate(
                'auto.components.workspacePanel.AiVaultSessionRow.revealLog',
                'Reveal Log'
              )}
            </Item>
          ) : null}
          {onOpenCwd ? (
            <Item onClick={onOpenCwd}>
              <FolderOpen className="size-3.5" />
              {translate(
                'auto.components.workspacePanel.AiVaultSessionRow.openWorkingDirectory',
                'Open Working Directory'
              )}
            </Item>
          ) : null}
        </>
      ) : null}
      <Separator />
      <Item onClick={onCopyId}>
        {translate(
          'auto.components.workspacePanel.AiVaultSessionRow.copySessionId',
          'Copy Session ID'
        )}
      </Item>
      <Item onClick={onCopyPath}>
        {translate('auto.components.workspacePanel.AiVaultSessionRow.copyLogPath', 'Copy Log Path')}
      </Item>
    </>
  )
}
