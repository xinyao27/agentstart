import { useState } from 'react'
import { toast } from 'sonner'
import { AgentSessionContinuationDialog } from '~renderer/agent-session-continuation/dialog'
import { translate } from '~renderer/i18n/i18n'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogRepoBuckets } from '~renderer/project-catalog/repo-buckets'
import { shellClient } from '~renderer/runtime/shell-client'
import {
  useActiveRepo,
  useActiveWorktree,
  useActiveWorktreeId,
  useAllWorktrees,
  useProjectHostSetupProjection,
  useRepos
} from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'
import type { AiVaultScope } from '~renderer/workspace-panel/ai-vault/session/providers'
import type { AiVaultSession } from '~renderer/workspace-panel/ai-vault/session/record'

import {
  LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE,
  type RightSidebarPanelSource
} from '../right-sidebar-panel-source'
import { usePersistedAiVaultViewOptions } from '../use-persisted-ai-vault-view-options'
import {
  buildAiVaultHostScopeOptions,
  buildRuntimeAiVaultHostScopeOptions,
  useAiVaultExecutionHostScope
} from './host-scope'
import { useAiVaultOriginalPaneActions } from './original-pane-actions'
import { AiVaultPanelHeader } from './panel-header'
import { AiVaultPanelNotice, AiVaultPanelSurface } from './panel-surface'
import { deriveAiVaultScopeSessionPaths, deriveAiVaultWorkspaceScopePaths } from './scope-paths'
import {
  DEFAULT_AI_VAULT_SCOPE,
  getRestorableAiVaultScope,
  normalizeAiVaultScopeForContext
} from './scope-state'
import { useAiVaultSessionLaunchActions } from './session-launch-actions'
import { openAiVaultSessionLogInAgentStart } from './session-log-open'
import { buildAiVaultProjectContext, buildAiVaultSessionProjectById } from './session-projects'
import { useAiVaultSessionRefresh } from './session-refresh'
import {
  resolveAiVaultSessionResumeActions,
  resolveAiVaultSessionResumeState
} from './session-resume'
import { AiVaultSessionVirtualList } from './session-virtual-list'
import { useAiVaultSessionWorktreeMap, withAiVaultCurrentWorktreeStatus } from './session-worktree'
import { filterAiVaultSessions, groupAiVaultSessions } from './session/filter'
import { countAiVaultViewAdjustments } from './view-defaults'

function LocalAiVaultPanel(): React.JSX.Element {
  const activeWorktreeId = useActiveWorktreeId()
  const activeWorktree = useActiveWorktree()
  const activeRepo = useActiveRepo()
  const repos = useRepos()
  const allWorktrees = useAllWorktrees()
  const projectHostSetupProjection = useProjectHostSetupProjection()
  const settings = useAppStore((s) => s.settings)
  const catalog = useProjectCatalog()
  const { runtimeEnvironments } = catalog
  const resumeTargetState = {
    folderWorkspaces: catalog.folderWorkspaces,
    projectGroups: catalog.projectGroups,
    repos: catalog.repos,
    worktreesByRepo: projectCatalogRepoBuckets(catalog).worktreesByRepo
  }
  const agentCmdOverrides = settings?.agentCmdOverrides
  const { getOriginalPaneTarget, getSessionLiveState, jumpToOriginalPane, jumpToWorktree } =
    useAiVaultOriginalPaneActions()
  const [query, setQuery] = useState('')
  // Why: scope depends on current workspace/project availability, so only stable view options persist.
  const [scopeSelection, setScopeSelection] = useState({
    scope: DEFAULT_AI_VAULT_SCOPE,
    preferredScope: DEFAULT_AI_VAULT_SCOPE,
    userChangedScope: false
  })
  const {
    agents,
    sort,
    group,
    hideEmptySessions,
    setSort,
    setGroup,
    setHideEmptySessions,
    setAgentEnabled,
    resetViewOptions
  } = usePersistedAiVaultViewOptions()
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())

  const runtimeHostOptions = (() => buildRuntimeAiVaultHostScopeOptions(runtimeEnvironments))()
  const availableExecutionHostScopes = (() => runtimeHostOptions.map((option) => option.id))()
  const { executionHostScope, activeExecutionHostScope, onExecutionHostScopeChange } =
    useAiVaultExecutionHostScope({
      activeWorktreeId: activeWorktreeId ?? null,
      resumeTargetState,
      availableExecutionHostScopes
    })
  const hostScopeOptions = (() =>
    buildAiVaultHostScopeOptions({
      activeExecutionHostScope,
      runtimeHostOptions
    }))()
  const activeWorktreePath = activeWorktree?.path ?? null
  // Why: AI Vault ownership is cwd-based, so we must consider live worktrees across all repos.
  const activeWorktreePaths = (() =>
    deriveAiVaultWorkspaceScopePaths(activeWorktree ?? null, allWorktrees))()
  const projectScopeContext = (() =>
    buildAiVaultProjectContext({
      repos,
      worktrees: allWorktrees,
      projectHostSetupProjection,
      activeRepo,
      activeWorktree,
      sessions: []
    }))()
  const activeProjectKey = projectScopeContext.activeProjectKey
  const projectLabelByKey = projectScopeContext.projectLabelByKey
  // Sent to the scanner so scoped views surface sessions older than the global cap.
  const scopePaths = (() =>
    deriveAiVaultScopeSessionPaths(activeWorktree ?? null, allWorktrees, {
      activeProjectKey,
      projectHostSetupProjection
    }))()
  const { error, loading, refresh, scanResult, sessions } = useAiVaultSessionRefresh(
    scopePaths,
    executionHostScope
  )
  const sessionProjectById = (() =>
    buildAiVaultSessionProjectById({
      repos,
      worktrees: allWorktrees,
      projectHostSetupProjection,
      sessions
    }))()
  const sessionWorktreeById = useAiVaultSessionWorktreeMap({
    sessions,
    repos,
    worktrees: allWorktrees
  })
  const effectiveActiveWorktreeId = activeWorktreeId ?? activeWorktree?.id ?? null
  const getSessionWorktreeInfo = (session: AiVaultSession) =>
    withAiVaultCurrentWorktreeStatus(
      sessionWorktreeById.get(session.id) ?? null,
      effectiveActiveWorktreeId
    )
  const launchActions = useAiVaultSessionLaunchActions({
    activeWorktree: activeWorktree ?? null,
    activeWorktreeId: effectiveActiveWorktreeId,
    targetState: resumeTargetState,
    agentCmdOverrides
  })
  const viewAdjustmentCount = countAiVaultViewAdjustments({
    agents,
    sort,
    group,
    hideEmptySessions
  })

  // Workspace is the preferred default, but unavailable context still falls
  // back to All and restores without keeping a second effect-synchronized fact.
  const normalizedScope = normalizeAiVaultScopeForContext({
    scope: scopeSelection.scope,
    activeProjectKey,
    activeWorktreePath
  })
  const scope =
    getRestorableAiVaultScope({
      scope: normalizedScope,
      activeProjectKey,
      activeWorktreePath,
      preferredScope: scopeSelection.preferredScope,
      userChangedScope: scopeSelection.userChangedScope
    }) ?? normalizedScope
  if (scopeSelection.scope !== scope) {
    setScopeSelection({ ...scopeSelection, scope })
  }

  const filteredSessions = (() =>
    filterAiVaultSessions(sessions, {
      query,
      agents,
      scope,
      sort,
      activeWorktreePaths,
      activeProjectKey,
      sessionProjectById,
      projectLabelByKey,
      hideEmptySessions
    }))()

  const groups = (() =>
    groupAiVaultSessions(filteredSessions, group, {
      sessionProjectById,
      projectLabelByKey
    }))()

  const copyText = async (text: string, label: string): Promise<void> => {
    await shellClient.ui.writeClipboardText(text)
    toast.success(
      translate('auto.components.right.sidebar.AiVaultPanel.valueCopied', '{{value0}} copied', {
        value0: label
      })
    )
  }

  const getSessionResumeState = (session: AiVaultSession) =>
    resolveAiVaultSessionResumeState({
      sessionFilePath: session.filePath,
      sessionExecutionHostId: session.executionHostId,
      worktreeInfo: getSessionWorktreeInfo(session),
      activeWorktreeId: effectiveActiveWorktreeId,
      worktrees: allWorktrees,
      repos,
      targetState: resumeTargetState
    })

  const getSessionResumeActions = (session: AiVaultSession) =>
    resolveAiVaultSessionResumeActions({
      sessionFilePath: session.filePath,
      sessionExecutionHostId: session.executionHostId,
      worktreeInfo: getSessionWorktreeInfo(session),
      activeWorktreeId: effectiveActiveWorktreeId,
      worktrees: allWorktrees,
      repos,
      targetState: resumeTargetState
    })

  const handleScopeChange = (nextScope: AiVaultScope) => {
    setScopeSelection({
      scope: nextScope,
      preferredScope: nextScope,
      userChangedScope: nextScope !== DEFAULT_AI_VAULT_SCOPE
    })
  }

  const toggleGroup = (key: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <AiVaultPanelSurface>
      <AiVaultPanelHeader
        query={query}
        loading={loading}
        shownCount={filteredSessions.length}
        sessionCount={sessions.length}
        hasScanResult={Boolean(scanResult)}
        activeWorktreePath={activeWorktreePath}
        activeProjectKey={activeProjectKey}
        scope={scope}
        executionHostScope={executionHostScope}
        hostScopeOptions={hostScopeOptions}
        agents={agents}
        sort={sort}
        group={group}
        hideEmptySessions={hideEmptySessions}
        adjustmentCount={viewAdjustmentCount}
        onQueryChange={setQuery}
        onScopeChange={handleScopeChange}
        onExecutionHostScopeChange={onExecutionHostScopeChange}
        onAgentEnabledChange={setAgentEnabled}
        onSortChange={setSort}
        onGroupChange={setGroup}
        onHideEmptySessionsChange={setHideEmptySessions}
        onReset={resetViewOptions}
        onRefresh={() => void refresh({ force: true })}
      />

      {error ? <AiVaultPanelNotice tone="destructive">{error}</AiVaultPanelNotice> : null}

      {scanResult && scanResult.issues.length > 0 ? (
        <AiVaultPanelNotice>
          {translate(
            'auto.components.right.sidebar.AiVaultPanel.transcriptsSkipped',
            '{{count}} transcript skipped',
            { count: scanResult.issues.length }
          )}
        </AiVaultPanelNotice>
      ) : null}

      <AiVaultSessionVirtualList
        groups={groups}
        collapsedGroups={collapsedGroups}
        loading={loading}
        sessionsCount={sessions.length}
        filteredSessionsCount={filteredSessions.length}
        error={error}
        vaultScope={scope}
        buildResumeStartup={launchActions.buildResumeStartup}
        getSessionResumeState={getSessionResumeState}
        getSessionResumeActions={getSessionResumeActions}
        getOriginalPaneTarget={getOriginalPaneTarget}
        getSessionLiveState={getSessionLiveState}
        getWorktreeInfo={getSessionWorktreeInfo}
        onToggleGroup={toggleGroup}
        onJumpToOriginalPane={jumpToOriginalPane}
        onJumpToWorktree={jumpToWorktree}
        onResume={launchActions.handleResume}
        onContinueInNewSession={launchActions.handleContinueInNewSession}
        onCopyResume={(session, worktreeId) =>
          void launchActions.copyResumeCommand(session, worktreeId)
        }
        onCopyId={(session) =>
          void copyText(
            session.sessionId,
            translate('auto.components.right.sidebar.AiVaultPanel.sessionId', 'Session ID')
          )
        }
        onCopyPath={(session) =>
          void copyText(
            session.filePath,
            translate('auto.components.right.sidebar.AiVaultPanel.logPath', 'Log path')
          )
        }
        onOpenLog={(session) => void openAiVaultSessionLogInAgentStart(session)}
        onRevealLog={(session) => void shellClient.shell.openPath(session.filePath)}
        onOpenCwd={(session) => {
          if (session.cwd) {
            void shellClient.shell.openPath(session.cwd)
          }
        }}
      />
      {launchActions.continuationRequest ? (
        <AgentSessionContinuationDialog
          open
          request={launchActions.continuationRequest}
          onOpenChange={launchActions.handleContinuationDialogOpenChange}
        />
      ) : null}
    </AiVaultPanelSurface>
  )
}

export default function AiVaultPanel({
  source = LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE
}: {
  source?: RightSidebarPanelSource
}): React.JSX.Element {
  void source
  return <LocalAiVaultPanel />
}
