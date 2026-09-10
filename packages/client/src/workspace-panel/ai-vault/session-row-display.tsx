import type { AgentStatusState } from '@agentstart/protocol/agent/status-records'
import { resolveRepoBadgeColor } from '@agentstart/protocol/project/appearance'
import { splitWorktreeIdForFilesystem } from '@agentstart/protocol/worktree/identity'
import type React from 'react'
import { AgentIcon } from '~renderer/agent/catalog'
import { AgentStateDot } from '~renderer/agent/status-dot'
import { translate } from '~renderer/i18n/i18n'
import RepoBadgeLabel from '~renderer/repo/badge-label'
import { useRepoById } from '~renderer/store/selectors'
import { Badge } from '~renderer/ui/badge'
import type { AiVaultScope } from '~renderer/workspace-panel/ai-vault/session/providers'
import type { AiVaultSession } from '~renderer/workspace-panel/ai-vault/session/record'
import { isAiVaultSessionRecoverableEmpty } from '~renderer/workspace-panel/ai-vault/session/recovery'

import { SessionTime } from './session-details'
import {
  aiVaultWorktreeStatusLabel,
  shouldShowAiVaultWorktreeStatusBadge,
  shouldShowAiVaultSessionWorktreeLine,
  type AiVaultSessionWorktreeInfo
} from './session-worktree'
import { sessionModelLabel } from './session/display'
import { agentLabel } from './session/filter'

export function getSessionDetailsId(sessionId: string): string {
  return `ai-vault-session-details-${sessionId.replace(/[^A-Za-z0-9_-]/g, '-')}`
}

export function SessionMetadata({
  session,
  liveState,
  updatedAt,
  worktreeInfo,
  vaultScope
}: {
  session: AiVaultSession
  liveState: AgentStatusState | null
  updatedAt: string
  worktreeInfo: AiVaultSessionWorktreeInfo | null
  vaultScope: AiVaultScope
}) {
  const modelLabel = sessionModelLabel(session)
  return (
    <div className="text-muted-foreground mt-1 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-1.5 gap-y-0.5 text-[11px] leading-4">
      <span className="text-muted-foreground flex size-4 shrink-0 items-center justify-center">
        <AgentIcon agent={session.agent} size={14} />
      </span>
      <div className="flex min-w-0 items-center gap-1.5">
        {/* Why: 'done' is the resting state of every finished pane — badging it
            would mark most rows; only live attention states earn a dot. */}
        {liveState && liveState !== 'done' ? <AgentStateDot state={liveState} /> : null}
        <span className="min-w-0 shrink-[2] truncate">{agentLabel(session.agent)}</span>
        <span className="shrink-0 tabular-nums">
          {translate(
            'auto.components.right.sidebar.AiVaultSessionRow.messageCount',
            '{{value0}} msgs',
            { value0: session.messageCount }
          )}
        </span>
        {session.subagentTranscriptCount > 0 ? (
          <>
            <span className="text-muted-foreground/55 shrink-0">·</span>
            <span className="shrink-0 tabular-nums">
              {session.subagentTranscriptCount === 1
                ? translate(
                    'auto.components.right.sidebar.AiVaultSessionRow.subagentCountSingular',
                    '1 subagent'
                  )
                : translate(
                    'auto.components.right.sidebar.AiVaultSessionRow.subagentCountPlural',
                    '{{value0}} subagents',
                    { value0: session.subagentTranscriptCount }
                  )}
            </span>
          </>
        ) : null}
        {isAiVaultSessionRecoverableEmpty(session) ? (
          <>
            <span className="text-muted-foreground/55 shrink-0">·</span>
            <span className="border-border/70 text-muted-foreground shrink-0 rounded-sm border border-dashed px-1 py-0 text-[10px] leading-4 font-medium">
              {translate(
                'auto.components.right.sidebar.AiVaultSessionRow.recoverableBadge',
                'Not saved'
              )}
            </span>
          </>
        ) : null}
        <span className="text-muted-foreground/55 shrink-0">·</span>
        <SessionTime value={updatedAt} />
        {modelLabel ? (
          <>
            <span className="text-muted-foreground/55 shrink-0">·</span>
            <span className="min-w-0 truncate" title={modelLabel}>
              {modelLabel}
            </span>
          </>
        ) : null}
      </div>
      {shouldShowAiVaultSessionWorktreeLine(worktreeInfo, { vaultScope }) ? (
        <div className="col-span-2 min-w-0">
          <SessionWorktreeLine worktreeInfo={worktreeInfo} vaultScope={vaultScope} />
        </div>
      ) : null}
    </div>
  )
}

export function SessionWorktreeLine({
  worktreeInfo,
  vaultScope
}: {
  worktreeInfo: AiVaultSessionWorktreeInfo
  vaultScope: AiVaultScope
}): React.JSX.Element {
  const repoId = worktreeInfo.worktreeId
    ? (splitWorktreeIdForFilesystem(worktreeInfo.worktreeId)?.repoId ?? null)
    : null
  const repo = useRepoById(repoId)

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 pl-5">
      {shouldShowAiVaultWorktreeStatusBadge(worktreeInfo.status, { vaultScope }) ? (
        <span className="border-sidebar-border bg-sidebar-accent/45 text-muted-foreground shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] leading-none">
          {worktreeStatusLabel(worktreeInfo.status)}
        </span>
      ) : null}
      <Badge
        variant="outline"
        className="border-border/70 bg-background h-5 max-w-full gap-1 px-1.5 py-0 text-[11px] font-medium"
        title={worktreeInfo.label}
      >
        <RepoBadgeLabel
          name={worktreeInfo.label}
          color={resolveRepoBadgeColor(repo?.badgeColor)}
          className="max-w-full min-w-0"
          badgeClassName="size-1.5"
        />
      </Badge>
    </div>
  )
}

function worktreeStatusLabel(status: AiVaultSessionWorktreeInfo['status']): string {
  return aiVaultWorktreeStatusLabel(status)
}

export function conversationRoleLabel(
  role: AiVaultSession['previewMessages'][number]['role']
): string {
  if (role === 'user') {
    return translate('auto.components.right.sidebar.AiVaultSessionRow.userRole', 'You')
  }
  if (role === 'assistant') {
    return translate('auto.components.right.sidebar.AiVaultSessionRow.agentRole', 'Agent')
  }
  if (role === 'tool') {
    return translate('auto.components.right.sidebar.AiVaultSessionRow.toolRole', 'Tool')
  }
  if (role === 'system') {
    return translate('auto.components.right.sidebar.AiVaultSessionRow.systemRole', 'System')
  }
  return translate('auto.components.right.sidebar.AiVaultSessionRow.sessionRole', 'Session')
}
