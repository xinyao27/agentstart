import type { AgentStatusState } from '@agentstart/protocol/agent/status-records'
import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/ui/class-names'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '~renderer/ui/context-menu'
import {
  AI_VAULT_SESSION_DRAG_END_EVENT,
  AI_VAULT_SESSION_DRAG_START_EVENT,
  writeAiVaultSessionDragData
} from '~renderer/workspace-panel/ai-vault/session-drag'
import type { AiVaultScope } from '~renderer/workspace-panel/ai-vault/session/providers'
import type { AiVaultSession } from '~renderer/workspace-panel/ai-vault/session/record'

import { SessionRowTrailingActions } from '../session-row-trailing-actions'
import type { AiVaultResumeStartup } from './resume-command'
import { SessionActionMenuItems } from './session-action-menu-items'
import { SessionInlineDetails } from './session-details'
import type { AiVaultSessionResumeActions } from './session-resume'
import {
  conversationRoleLabel,
  getSessionDetailsId,
  SessionMetadata,
  SessionWorktreeLine
} from './session-row-display'
import {
  shouldShowAiVaultSessionWorktreeLine,
  type AiVaultSessionWorktreeInfo
} from './session-worktree'
import { latestSessionConversationTurn } from './session/display'

export function VaultSessionRow({
  session,
  liveState,
  resumeStartup,
  worktreeInfo,
  vaultScope,
  detailsExpanded,
  resumeDisabled,
  onToggleDetails,
  onJumpToOriginalPane,
  showJumpToWorktree,
  onJumpToWorktree,
  onResume,
  onContinueInNewSession,
  resumeLabel,
  resumeActions,
  onResumeInWorktree,
  onResumeInNewTab,
  onCopyResume,
  onCopyId,
  onCopyPath,
  onOpenLog,
  onRevealLog,
  onOpenCwd
}: {
  session: AiVaultSession
  liveState: AgentStatusState | null
  resumeStartup: AiVaultResumeStartup
  worktreeInfo: AiVaultSessionWorktreeInfo | null
  vaultScope: AiVaultScope
  detailsExpanded: boolean
  resumeDisabled: boolean
  onToggleDetails: () => void
  onJumpToOriginalPane?: () => void
  showJumpToWorktree: boolean
  onJumpToWorktree?: () => void
  onResume: () => void
  onContinueInNewSession?: () => void
  resumeLabel: string
  resumeActions: AiVaultSessionResumeActions
  onResumeInWorktree: () => void
  onResumeInNewTab: () => void
  onCopyResume?: () => void
  onCopyId: () => void
  onCopyPath: () => void
  onOpenLog?: () => void
  onRevealLog?: () => void
  onOpenCwd?: () => void
}) {
  const updatedAt = session.updatedAt ?? session.modifiedAt
  const detailsId = getSessionDetailsId(session.id)
  const latestTurn = latestSessionConversationTurn(session)
  const detailsTooltip = detailsExpanded
    ? translate('auto.components.right.sidebar.AiVaultSessionRow.hideDetails', 'Hide Details')
    : translate('auto.components.right.sidebar.AiVaultSessionRow.showDetails', 'Show Details')
  const startResumeDrag = (event: React.DragEvent<HTMLElement>): void => {
    event.stopPropagation()
    const target = event.target
    if (target instanceof Element && target.closest('[data-ai-vault-session-actions]')) {
      event.preventDefault()
      return
    }
    if (resumeDisabled) {
      event.preventDefault()
      return
    }
    writeAiVaultSessionDragData(event.dataTransfer, {
      agent: session.agent,
      sessionId: session.sessionId,
      title: session.title,
      command: resumeStartup.command,
      sessionFilePath: session.filePath,
      sessionExecutionHostId: session.executionHostId,
      ...(resumeStartup.env ? { env: resumeStartup.env } : {}),
      ...(resumeStartup.envToDelete ? { envToDelete: resumeStartup.envToDelete } : {}),
      ...(resumeStartup.launchConfig ? { launchConfig: resumeStartup.launchConfig } : {})
    })
    window.dispatchEvent(new Event(AI_VAULT_SESSION_DRAG_START_EVENT))
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="block w-full min-w-0"
        render={
          <div
            className={cn(
              'group/session-row flex w-full min-w-0 flex-col border-b border-sidebar-border px-3 py-2 text-left transition-colors hover:bg-accent',
              resumeDisabled ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
              !detailsExpanded && 'min-h-[98px]'
            )}
            // Why: users naturally drag the session row itself; matching that
            // gesture avoids hidden affordances and text-selection false starts.
            draggable={!resumeDisabled}
            onClick={() => {
              onToggleDetails()
            }}
            onDragStart={startResumeDrag}
            onDragEnd={() => {
              window.dispatchEvent(new Event(AI_VAULT_SESSION_DRAG_END_EVENT))
            }}
          >
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1">
              <div
                className={cn(
                  'min-w-0 text-[13px] font-medium leading-5 text-foreground',
                  detailsExpanded ? 'line-clamp-2 [overflow-wrap:anywhere]' : 'line-clamp-1'
                )}
              >
                {session.title}
              </div>
              <SessionRowTrailingActions
                session={session}
                detailsExpanded={detailsExpanded}
                detailsId={detailsId}
                detailsTooltip={detailsTooltip}
                resumeDisabled={resumeDisabled}
                resumeLabel={resumeLabel}
                worktreeInfo={worktreeInfo}
                onToggleDetails={onToggleDetails}
                onJumpToOriginalPane={onJumpToOriginalPane}
                showJumpToWorktree={showJumpToWorktree}
                onJumpToWorktree={onJumpToWorktree}
                onResume={onResume}
                onContinueInNewSession={onContinueInNewSession}
                onCopyResume={onCopyResume}
                onCopyId={onCopyId}
                onCopyPath={onCopyPath}
                onOpenLog={onOpenLog}
                onRevealLog={onRevealLog}
                onOpenCwd={onOpenCwd}
              />
            </div>
            {detailsExpanded &&
            shouldShowAiVaultSessionWorktreeLine(worktreeInfo, { vaultScope }) ? (
              <div className="mt-1">
                <SessionWorktreeLine worktreeInfo={worktreeInfo} vaultScope={vaultScope} />
              </div>
            ) : null}
            {!detailsExpanded ? (
              <>
                <div className="text-muted-foreground mt-0.5 line-clamp-2 min-w-0 text-[12px] leading-4">
                  {latestTurn ? (
                    <>
                      <span className="text-foreground/80 font-medium">
                        {conversationRoleLabel(latestTurn.role)}
                      </span>
                      <span>: {latestTurn.text}</span>
                    </>
                  ) : (
                    translate(
                      'auto.components.right.sidebar.AiVaultSessionRow.noPreviewAvailable',
                      'No conversation preview available'
                    )
                  )}
                </div>
                <SessionMetadata
                  session={session}
                  liveState={liveState}
                  updatedAt={updatedAt}
                  worktreeInfo={worktreeInfo}
                  vaultScope={vaultScope}
                />
              </>
            ) : null}
            {detailsExpanded ? (
              <SessionInlineDetails
                id={detailsId}
                session={session}
                worktreeInfo={worktreeInfo}
                vaultScope={vaultScope}
                resumeActions={resumeActions}
                onResumeInWorktree={onResumeInWorktree}
                onResumeInNewTab={onResumeInNewTab}
                onContinueInNewSession={onContinueInNewSession}
                onOpenLog={onOpenLog}
              />
            ) : null}
          </div>
        }
      />
      <ContextMenuContent>
        <SessionActionMenuItems
          menuKind="context"
          resumeDisabled={resumeDisabled}
          resumeLabel={resumeLabel}
          onJumpToOriginalPane={onJumpToOriginalPane}
          showJumpToWorktree={showJumpToWorktree}
          onJumpToWorktree={onJumpToWorktree}
          onResume={onResume}
          onContinueInNewSession={onContinueInNewSession}
          onCopyResume={onCopyResume}
          onCopyId={onCopyId}
          onCopyPath={onCopyPath}
          onOpenLog={onOpenLog}
          onRevealLog={onRevealLog}
          onOpenCwd={onOpenCwd}
        />
      </ContextMenuContent>
    </ContextMenu>
  )
}
