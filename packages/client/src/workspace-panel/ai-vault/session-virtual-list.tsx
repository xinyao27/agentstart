import type { AgentStatusState } from '@agentstart/protocol/agent/status-records'
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react'
import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { LEGEND_LIST_SCROLL_AREA_PROPS } from '~renderer/sidebar/list-scroll-area'
import type { AiVaultScope } from '~renderer/workspace-panel/ai-vault/session/providers'
import type { AiVaultSession } from '~renderer/workspace-panel/ai-vault/session/record'

import type { AiVaultOriginalPaneTarget } from './original-pane'
import { EmptyState, SessionLoadingState, VaultGroupHeader } from './panel-controls'
import type { AiVaultResumeStartup } from './resume-command'
import { canContinueAiVaultSessionInNewSession } from './session-continuation'
import {
  canOpenAiVaultSessionLogInAgentStart,
  canUseLocalAiVaultSessionPathActions
} from './session-path-actions'
import {
  aiVaultSessionResumeLabel,
  aiVaultSessionRowResumeGating,
  type AiVaultSessionResumeActions,
  type AiVaultSessionResumeState
} from './session-resume'
import { VaultSessionRow } from './session-row'
import {
  canJumpToAiVaultSessionWorktree,
  isAiVaultSessionInCurrentWorktree,
  type AiVaultSessionWorktreeInfo
} from './session-worktree'
import type { AiVaultSessionGroup } from './session/filter'
import {
  buildAiVaultListModel,
  getAiVaultListRowKey,
  getAiVaultListRowType,
  type AiVaultListRow
} from './virtual-rows'

// Why: collapsed session rows dominate the list at ~98px while group headers are
// 32px; LegendList measures the real heights after first paint and only needs a
// starting hint.
const AI_VAULT_LIST_ROW_ESTIMATE_PX = 98

export function AiVaultSessionVirtualList({
  groups,
  collapsedGroups,
  loading,
  sessionsCount,
  filteredSessionsCount,
  error,
  vaultScope,
  buildResumeStartup,
  getOriginalPaneTarget,
  getSessionLiveState,
  getWorktreeInfo,
  getSessionResumeState,
  getSessionResumeActions,
  onToggleGroup,
  onJumpToOriginalPane,
  onJumpToWorktree,
  onResume,
  onContinueInNewSession,
  onCopyResume,
  onCopyId,
  onCopyPath,
  onOpenLog,
  onRevealLog,
  onOpenCwd
}: {
  groups: readonly AiVaultSessionGroup[]
  collapsedGroups: ReadonlySet<string>
  loading: boolean
  sessionsCount: number
  filteredSessionsCount: number
  error: string | null
  vaultScope: AiVaultScope
  buildResumeStartup: (session: AiVaultSession, worktreeId?: string | null) => AiVaultResumeStartup
  getOriginalPaneTarget: (session: AiVaultSession) => AiVaultOriginalPaneTarget | null
  getSessionLiveState: (session: AiVaultSession) => AgentStatusState | null
  getWorktreeInfo: (session: AiVaultSession) => AiVaultSessionWorktreeInfo | null
  getSessionResumeState: (session: AiVaultSession) => AiVaultSessionResumeState
  getSessionResumeActions: (session: AiVaultSession) => AiVaultSessionResumeActions
  onToggleGroup: (key: string) => void
  onJumpToOriginalPane: (session: AiVaultSession) => void
  onJumpToWorktree: (worktreeId: string) => void
  onResume: (session: AiVaultSession, worktreeId: string) => void
  onContinueInNewSession: (session: AiVaultSession, worktreeId: string) => void
  onCopyResume: (session: AiVaultSession, worktreeId?: string | null) => void
  onCopyId: (session: AiVaultSession) => void
  onCopyPath: (session: AiVaultSession) => void
  onOpenLog: (session: AiVaultSession) => void
  onRevealLog: (session: AiVaultSession) => void
  onOpenCwd: (session: AiVaultSession) => void
}): React.JSX.Element {
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(() => new Set())

  const model = (() => buildAiVaultListModel({ groups, collapsedGroups }))()

  const toggleSessionDetails = (sessionId: string) => {
    setExpandedSessionIds((current) => {
      const next = new Set(current)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      return next
    })
  }

  const listHeader = buildAiVaultListStatus({
    error,
    filteredSessionsCount,
    loading,
    sessionsCount
  })

  return (
    <div className="min-h-0 flex-1">
      <LegendList<AiVaultListRow>
        {...LEGEND_LIST_SCROLL_AREA_PROPS}
        data={model.rows}
        keyExtractor={getAiVaultListRowKey}
        getItemType={getAiVaultListRowType}
        estimatedItemSize={AI_VAULT_LIST_ROW_ESTIMATE_PX}
        stickyHeaderIndices={model.stickyHeaderIndices}
        ListHeaderComponent={listHeader}
        renderItem={({ item }: LegendListRenderItemProps<AiVaultListRow>) => (
          <AiVaultListRowView
            row={item}
            collapsedGroups={collapsedGroups}
            expandedSessionIds={expandedSessionIds}
            vaultScope={vaultScope}
            buildResumeStartup={buildResumeStartup}
            getOriginalPaneTarget={getOriginalPaneTarget}
            getSessionLiveState={getSessionLiveState}
            getWorktreeInfo={getWorktreeInfo}
            getSessionResumeState={getSessionResumeState}
            getSessionResumeActions={getSessionResumeActions}
            onToggleGroup={onToggleGroup}
            onToggleSessionDetails={toggleSessionDetails}
            onJumpToOriginalPane={onJumpToOriginalPane}
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
        )}
      />
    </div>
  )
}

function buildAiVaultListStatus({
  error,
  filteredSessionsCount,
  loading,
  sessionsCount
}: {
  error: string | null
  filteredSessionsCount: number
  loading: boolean
  sessionsCount: number
}): React.ReactElement | null {
  if (loading && sessionsCount === 0) {
    return <SessionLoadingState />
  }
  if (!loading && sessionsCount === 0 && !error) {
    return (
      <EmptyState
        title={translate(
          'auto.components.right.sidebar.AiVaultPanel.noAgentSessionsFound',
          'No agent sessions found'
        )}
      />
    )
  }
  if (sessionsCount > 0 && filteredSessionsCount === 0) {
    return (
      <EmptyState
        title={translate(
          'auto.components.right.sidebar.AiVaultPanel.noSessionsMatchFilters',
          'No sessions match the current filters'
        )}
      />
    )
  }
  return null
}

function AiVaultListRowView({
  row,
  collapsedGroups,
  expandedSessionIds,
  vaultScope,
  buildResumeStartup,
  getOriginalPaneTarget,
  getSessionLiveState,
  getWorktreeInfo,
  getSessionResumeState,
  getSessionResumeActions,
  onToggleGroup,
  onToggleSessionDetails,
  onJumpToOriginalPane,
  onJumpToWorktree,
  onResume,
  onContinueInNewSession,
  onCopyResume,
  onCopyId,
  onCopyPath,
  onOpenLog,
  onRevealLog,
  onOpenCwd
}: {
  row: AiVaultListRow
  collapsedGroups: ReadonlySet<string>
  expandedSessionIds: ReadonlySet<string>
  vaultScope: AiVaultScope
  buildResumeStartup: (session: AiVaultSession, worktreeId?: string | null) => AiVaultResumeStartup
  getOriginalPaneTarget: (session: AiVaultSession) => AiVaultOriginalPaneTarget | null
  getSessionLiveState: (session: AiVaultSession) => AgentStatusState | null
  getWorktreeInfo: (session: AiVaultSession) => AiVaultSessionWorktreeInfo | null
  getSessionResumeState: (session: AiVaultSession) => AiVaultSessionResumeState
  getSessionResumeActions: (session: AiVaultSession) => AiVaultSessionResumeActions
  onToggleGroup: (key: string) => void
  onToggleSessionDetails: (sessionId: string) => void
  onJumpToOriginalPane: (session: AiVaultSession) => void
  onJumpToWorktree: (worktreeId: string) => void
  onResume: (session: AiVaultSession, worktreeId: string) => void
  onContinueInNewSession: (session: AiVaultSession, worktreeId: string) => void
  onCopyResume: (session: AiVaultSession, worktreeId?: string | null) => void
  onCopyId: (session: AiVaultSession) => void
  onCopyPath: (session: AiVaultSession) => void
  onOpenLog: (session: AiVaultSession) => void
  onRevealLog: (session: AiVaultSession) => void
  onOpenCwd: (session: AiVaultSession) => void
}): React.JSX.Element {
  if (row.type === 'group') {
    return (
      // Why: pinned headers need an opaque backdrop, the group button itself is
      // translucent.
      <div className="bg-sidebar">
        <VaultGroupHeader
          group={row.group}
          collapsed={collapsedGroups.has(row.group.key)}
          onToggle={() => onToggleGroup(row.group.key)}
        />
      </div>
    )
  }

  const session = row.session
  const originalPaneTarget = getOriginalPaneTarget(session)
  const worktreeInfo = getWorktreeInfo(session)
  // Why: omit the jump affordance when the session already lives in the
  // worktree on screen — jumping there is a no-op.
  const showJumpToWorktree = !isAiVaultSessionInCurrentWorktree(worktreeInfo)
  const worktreeJumpId =
    showJumpToWorktree && canJumpToAiVaultSessionWorktree(worktreeInfo)
      ? worktreeInfo?.worktreeId
      : null
  const resumeState = getSessionResumeState(session)
  const resumeActions = getSessionResumeActions(session)
  const continuationWorktreeId = canContinueAiVaultSessionInNewSession(
    session,
    resumeState.worktreeId
  )
    ? resumeState.worktreeId
    : null
  // Gate resume on real content: a zero-turn transcript would resume into an
  // empty conversation, so it is never offered as normally resumable.
  const resumeGating = aiVaultSessionRowResumeGating(session, resumeState)
  const canOpenLocalSessionPaths = canUseLocalAiVaultSessionPathActions(session.executionHostId)
  // Why: in-AgentStart View Log additionally withholds synthetic (SQLite/OpenCode)
  // identities that have no single file to open, while Reveal/CWD stay on the
  // existing local-path gate.
  const canOpenLogInAgentStart = canOpenAiVaultSessionLogInAgentStart(session)

  return (
    <VaultSessionRow
      session={session}
      liveState={getSessionLiveState(session)}
      resumeStartup={buildResumeStartup(session, resumeState.worktreeId)}
      worktreeInfo={worktreeInfo}
      vaultScope={vaultScope}
      detailsExpanded={expandedSessionIds.has(session.id)}
      resumeDisabled={resumeGating.resumeDisabled}
      resumeLabel={aiVaultSessionResumeLabel(resumeState)}
      resumeActions={resumeActions}
      onToggleDetails={() => onToggleSessionDetails(session.id)}
      onJumpToOriginalPane={originalPaneTarget ? () => onJumpToOriginalPane(session) : undefined}
      showJumpToWorktree={showJumpToWorktree}
      onJumpToWorktree={worktreeJumpId ? () => onJumpToWorktree(worktreeJumpId) : undefined}
      onResume={() => {
        if (resumeState.worktreeId) {
          onResume(session, resumeState.worktreeId)
        }
      }}
      onContinueInNewSession={
        continuationWorktreeId
          ? () => onContinueInNewSession(session, continuationWorktreeId)
          : undefined
      }
      onResumeInWorktree={() => {
        if (resumeActions.worktree.worktreeId) {
          onResume(session, resumeActions.worktree.worktreeId)
        }
      }}
      onResumeInNewTab={() => {
        if (resumeActions.newTab.worktreeId) {
          onResume(session, resumeActions.newTab.worktreeId)
        }
      }}
      onCopyResume={
        resumeGating.canCopyResumeCommand
          ? () => onCopyResume(session, resumeState.worktreeId)
          : undefined
      }
      onCopyId={() => onCopyId(session)}
      onCopyPath={() => onCopyPath(session)}
      onOpenLog={canOpenLogInAgentStart ? () => onOpenLog(session) : undefined}
      onRevealLog={canOpenLocalSessionPaths ? () => onRevealLog(session) : undefined}
      onOpenCwd={canOpenLocalSessionPaths && session.cwd ? () => onOpenCwd(session) : undefined}
    />
  )
}
