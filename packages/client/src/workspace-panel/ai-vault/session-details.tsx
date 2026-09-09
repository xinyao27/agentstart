import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  FileCode as FileJson,
  FolderSimple as FolderGit2,
  ChatCentered as MessageSquarePlus,
  Chat as MessageSquare,
  Play
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'
import type { AiVaultScope } from '~renderer/workspace-panel/ai-vault/session/providers'
import type { AiVaultSession } from '~renderer/workspace-panel/ai-vault/session/record'
import { isAiVaultSessionResumableContent } from '~renderer/workspace-panel/ai-vault/session/recovery'

import { SessionSubagentsSection } from './session-subagents'
import { SessionUnsavedConversationNotice } from './session-unsaved-notice'
import {
  aiVaultWorktreeCompactPath,
  aiVaultWorktreeStatusLabel,
  shouldShowAiVaultWorktreeStatusBadge,
  shouldShowAiVaultSessionWorktreeLine,
  type AiVaultSessionWorktreeInfo
} from './session-worktree'
import { sessionDetailConversationTurns } from './session/display'

export function SessionInlineDetails({
  id,
  session,
  worktreeInfo,
  vaultScope,
  resumeActions,
  onResumeInWorktree,
  onResumeInNewTab,
  onContinueInNewSession,
  onOpenLog
}: {
  id: string
  session: AiVaultSession
  worktreeInfo: AiVaultSessionWorktreeInfo | null
  vaultScope: AiVaultScope
  resumeActions: {
    worktree: { worktreeId: string | null; disabled: boolean }
    newTab: { worktreeId: string | null; disabled: boolean }
  }
  onResumeInWorktree: () => void
  onResumeInNewTab: () => void
  onContinueInNewSession?: () => void
  onOpenLog?: () => void
}): React.JSX.Element {
  // A zero-turn transcript would resume into an empty conversation, so the plain
  // resume affordances are withheld and a distinct "not saved" state is shown.
  const hasResumableContent = isAiVaultSessionResumableContent(session)
  const showResumeInWorktree = hasResumableContent && Boolean(resumeActions.worktree.worktreeId)
  const showResumeInNewTab =
    hasResumableContent &&
    (!resumeActions.worktree.worktreeId || Boolean(resumeActions.newTab.worktreeId))
  const detailTurns = sessionDetailConversationTurns(session, 3)
  const worktreeDisplay = worktreeInfo

  return (
    <div
      id={id}
      className="border-sidebar-border/80 bg-background/50 mt-2 overflow-hidden border"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onDragStart={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div className="space-y-3 p-3">
        {hasResumableContent ? (
          <SessionReceiptSection
            icon={<MessageSquare className="size-3" />}
            label={translate(
              'auto.components.right.sidebar.AiVaultSessionDetails.latestTurns',
              'Latest turns'
            )}
          >
            {detailTurns.length > 0 ? (
              <div className="space-y-1.5">
                {detailTurns.map((turn, index) => (
                  <ConversationTurnCard
                    key={`${turn.timestamp ?? 'turn'}-${index}`}
                    role={turn.role}
                    text={turn.text}
                  />
                ))}
              </div>
            ) : (
              <SessionDetailEmptyState
                message={translate(
                  'auto.components.right.sidebar.AiVaultSessionDetails.noPreviewAvailable',
                  'No conversation preview available'
                )}
              />
            )}
          </SessionReceiptSection>
        ) : (
          // An unsaved session has no turns to show; the notice replaces the
          // preview section instead of stacking a second empty state under it.
          <SessionUnsavedConversationNotice session={session} logAvailable={Boolean(onOpenLog)} />
        )}

        <SessionSubagentsSection session={session} />

        {shouldShowAiVaultSessionWorktreeLine(worktreeDisplay, {
          vaultScope
        }) ? (
          <SessionReceiptSection
            icon={<FolderGit2 className="size-3" />}
            label={translate(
              'auto.components.right.sidebar.AiVaultSessionDetails.worktree',
              'Worktree'
            )}
          >
            <WorktreeMetadataLines worktreeInfo={worktreeDisplay} vaultScope={vaultScope} />
          </SessionReceiptSection>
        ) : null}
      </div>

      {showResumeInWorktree || showResumeInNewTab || onContinueInNewSession || onOpenLog ? (
        <div className="border-sidebar-border/80 bg-sidebar-accent/15 flex flex-wrap items-center gap-1.5 border-t px-3 py-2">
          {onContinueInNewSession ? (
            <Button
              type="button"
              variant="secondary"
              size="xs"
              draggable={false}
              onClick={(event) => {
                event.stopPropagation()
                onContinueInNewSession()
              }}
              className="shrink-0"
            >
              <MessageSquarePlus className="size-3.5" />
              {translate(
                'components.agentSessionContinuation.continueInNewSession',
                'Continue in New Session…'
              )}
            </Button>
          ) : null}
          {showResumeInWorktree ? (
            <Button
              type="button"
              variant="default"
              size="xs"
              disabled={resumeActions.worktree.disabled}
              draggable={false}
              onClick={(event) => {
                event.stopPropagation()
                onResumeInWorktree()
              }}
              className="h-7 shrink-0 px-2.5 text-[11px]"
            >
              <Play className="size-3.5" />
              {translate(
                'auto.components.right.sidebar.AiVaultSessionDetails.resumeInWorktree',
                'Resume in Worktree'
              )}
            </Button>
          ) : null}
          {showResumeInNewTab ? (
            <Button
              type="button"
              variant={showResumeInWorktree ? 'secondary' : 'default'}
              size="xs"
              disabled={resumeActions.newTab.disabled}
              draggable={false}
              onClick={(event) => {
                event.stopPropagation()
                onResumeInNewTab()
              }}
              className="h-7 shrink-0 px-2.5 text-[11px]"
            >
              <Play className="size-3.5" />
              {translate(
                'auto.components.right.sidebar.AiVaultSessionRow.resumeInNewTab',
                'Resume in New Tab'
              )}
            </Button>
          ) : null}
          {onOpenLog ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              draggable={false}
              onClick={(event) => {
                event.stopPropagation()
                onOpenLog()
              }}
              className="text-muted-foreground h-7 shrink-0 px-2.5 text-[11px]"
            >
              <FileJson className="size-3.5" />
              {translate('auto.components.right.sidebar.AiVaultSessionDetails.viewLog', 'View Log')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SessionReceiptSection({
  icon,
  label,
  children
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="space-y-1.5">
      <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.05em] uppercase">
        <span className="text-muted-foreground/80">{icon}</span>
        <span>{label}</span>
      </div>
      {children}
    </section>
  )
}

function ConversationTurnCard({
  role,
  text
}: {
  role: AiVaultSession['previewMessages'][number]['role']
  text: string
}): React.JSX.Element {
  const isUserTurn = role === 'user'

  return (
    <div
      className={cn(
        'border px-2.5 py-2',
        isUserTurn
          ? 'border-border/70 bg-foreground/[0.04]'
          : 'border-sidebar-border/70 bg-sidebar-accent/25'
      )}
    >
      <div className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-[0.05em] uppercase">
        {conversationRoleLabel(role)}
      </div>
      <p className="text-foreground/90 line-clamp-4 text-[12px] leading-[1.35] [overflow-wrap:anywhere]">
        {text}
      </p>
    </div>
  )
}

function WorktreeMetadataLines({
  worktreeInfo,
  vaultScope
}: {
  worktreeInfo: AiVaultSessionWorktreeInfo
  vaultScope: AiVaultScope
}): React.JSX.Element {
  const compactPath = aiVaultWorktreeCompactPath(worktreeInfo.path)
  const pathLine =
    compactPath && compactPath !== worktreeInfo.label ? compactPath : worktreeInfo.path
  const showPathLine = Boolean(pathLine) && pathLine !== worktreeInfo.label

  return (
    <div className="grid min-w-0 gap-1 text-[11px] leading-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {shouldShowAiVaultWorktreeStatusBadge(worktreeInfo.status, {
          vaultScope
        }) ? (
          <>
            <span className="text-muted-foreground shrink-0 text-[10px] font-medium tracking-[0.04em] uppercase">
              {aiVaultWorktreeStatusLabel(worktreeInfo.status)}
            </span>
            <span className="text-muted-foreground/45 shrink-0">·</span>
          </>
        ) : null}
        <span className="text-foreground min-w-0 text-[12px] leading-4 font-medium">
          {worktreeInfo.label}
        </span>
      </div>
      {showPathLine ? (
        <WorktreePathHint compactPath={pathLine} fullPath={worktreeInfo.path} />
      ) : null}
    </div>
  )
}

function WorktreePathHint({
  compactPath,
  fullPath
}: {
  compactPath: string
  fullPath: string
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="text-muted-foreground min-w-0 truncate font-mono text-[11px] leading-4">
            {compactPath}
          </div>
        }
      />
      <TooltipContent side="top" sideOffset={4} className="max-w-sm font-mono text-xs break-all">
        {fullPath}
      </TooltipContent>
    </Tooltip>
  )
}

function SessionDetailEmptyState({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="border-sidebar-border/80 text-muted-foreground border border-dashed px-2.5 py-2 text-[11px] leading-4">
      {message}
    </div>
  )
}

export function SessionTime({
  value,
  className
}: {
  value: string
  className?: string
}): React.JSX.Element {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return (
      <span className={cn('shrink-0 text-[11px] text-muted-foreground', className)}>
        {translate(
          'auto.components.right.sidebar.AiVaultSessionDetails.unknownTime',
          'Unknown time'
        )}
      </span>
    )
  }

  const date = new Date(timestamp)
  return (
    <span className={cn('shrink-0 text-[11px] text-muted-foreground', className)}>
      <time dateTime={date.toISOString()}>{formatTimeAgo(timestamp)}</time>
    </span>
  )
}

function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  if (diffMs < 60_000) {
    return translate('auto.components.right.sidebar.AiVaultSessionDetails.justNow', 'Just now')
  }
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) {
    return translate(
      'auto.components.right.sidebar.AiVaultSessionDetails.minutesAgo',
      '{{value0}}m ago',
      { value0: minutes }
    )
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return translate(
      'auto.components.right.sidebar.AiVaultSessionDetails.hoursAgo',
      '{{value0}}h ago',
      { value0: hours }
    )
  }
  const days = Math.floor(hours / 24)
  if (days < 30) {
    return translate(
      'auto.components.right.sidebar.AiVaultSessionDetails.daysAgo',
      '{{value0}}d ago',
      { value0: days }
    )
  }
  const months = Math.floor(days / 30)
  if (months < 12) {
    return translate(
      'auto.components.right.sidebar.AiVaultSessionDetails.monthsAgo',
      '{{value0}}mo ago',
      { value0: months }
    )
  }
  return translate(
    'auto.components.right.sidebar.AiVaultSessionDetails.yearsAgo',
    '{{value0}}y ago',
    { value0: Math.floor(months / 12) }
  )
}

function conversationRoleLabel(role: AiVaultSession['previewMessages'][number]['role']): string {
  if (role === 'user') {
    return translate('auto.components.right.sidebar.AiVaultSessionDetails.userRole', 'You')
  }
  if (role === 'assistant') {
    return translate('auto.components.right.sidebar.AiVaultSessionDetails.agentRole', 'Agent')
  }
  if (role === 'tool') {
    return translate('auto.components.right.sidebar.AiVaultSessionDetails.toolRole', 'Tool')
  }
  if (role === 'system') {
    return translate('auto.components.right.sidebar.AiVaultSessionDetails.systemRole', 'System')
  }
  return translate('auto.components.right.sidebar.AiVaultSessionDetails.sessionRole', 'Session')
}
