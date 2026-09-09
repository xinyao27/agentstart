import type { WorkspaceSessionState } from '@yiru/protocol/workspace/session'
import { shouldPersistWorkspaceSession } from '~renderer/editor/workspace-session'
import { buildHostIdByWorktreeId } from '~renderer/editor/workspace-session-host-persistence'
import { useAppStore } from '~renderer/store/state'
import { buildActiveSurfacePatch } from '~renderer/tab-bar/state/active-surface'

import { projectSessionEditors } from './projection-editors'
import { projectTerminalIdentities } from './projection-identities'
import { applySessionProjection } from './projection-scope'
import { projectSessionTabs } from './projection-tabs'

export function receiveSessionProjection(session: WorkspaceSessionState, hostId?: string): boolean {
  // Why: routed environments already consume their destination's SessionTabs stream, not this shell's saved mirrors.
  if (hostId && hostId !== 'local') {
    return false
  }
  const state = useAppStore.getState()
  if (!shouldPersistWorkspaceSession(state)) {
    return false
  }
  applySessionProjection(() => {
    session = projectTerminalIdentities(session)
  })
  const hostForWorktree = buildHostIdByWorktreeId(state)
  const owns = (worktree: string): boolean => hostForWorktree(worktree) === 'local'
  const editors = projectSessionEditors(state, session, owns)
  const tabs = projectSessionTabs({ ...state, openFiles: editors.openFiles }, session, owns)
  const sleepingAgentSessionsByPaneKey = { ...state.sleepingAgentSessionsByPaneKey }
  const ownedTabIds = new Set(
    [...Object.entries(state.tabsByWorktree), ...Object.entries(tabs.tabsByWorktree)]
      .filter(([worktree]) => owns(worktree))
      .flatMap(([, values]) => values.map((tab) => tab.id))
  )
  for (const key of Object.keys(sleepingAgentSessionsByPaneKey)) {
    if ([...ownedTabIds].some((id) => key.startsWith(`${id}:`))) {
      delete sleepingAgentSessionsByPaneKey[key]
    }
  }
  for (const [key, record] of Object.entries(session.sleepingAgentSessionsByPaneKey ?? {})) {
    if (owns(record.worktreeId)) {
      sleepingAgentSessionsByPaneKey[key] = record
    }
  }
  const activeWorktree = state.activeWorktreeId
  const projected = { ...tabs, ...editors, sleepingAgentSessionsByPaneKey }
  const surface =
    activeWorktree && owns(activeWorktree)
      ? buildActiveSurfacePatch({ ...state, ...projected }, activeWorktree)
      : {}
  applySessionProjection(() => useAppStore.setState({ ...projected, ...surface }))
  return true
}
