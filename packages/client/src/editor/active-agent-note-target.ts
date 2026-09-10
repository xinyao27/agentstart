import type { TerminalListResult } from '@agentstart/protocol'
import type { AgentStatusEntry } from '@agentstart/protocol/agent/status-records'
import type { TerminalLayoutSnapshot } from '@agentstart/protocol/workspace/session'
import type { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { openRuntimeTerminalClient } from '~renderer/runtime/terminal-protocol'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'
import type { WorktreeRuntimeOwnerState } from '~renderer/worktree/runtime-owner'

const ACTIVE_AGENT_TERMINAL_LIST_LIMIT = 200

export type ActiveTerminalNoteTarget = {
  tabId: string
  leafId: string
}

export type ActiveTerminalNoteTargetState = {
  activeWorktreeId: string | null
  activeTabType: string
  activeTabId: string | null
  activeTabIdByWorktree: Record<string, string | null | undefined>
  tabsByWorktree: Record<
    string,
    readonly { id: string; title?: string; launchAgent?: unknown }[] | undefined
  >
  ptyIdsByTabId?: Record<string, readonly string[] | undefined>
  terminalLayoutsByTabId: Record<
    string,
    | {
        activeLeafId: string | null
        root?: TerminalLayoutSnapshot['root']
        ptyIdsByLeafId?: Record<string, string | undefined>
      }
    | undefined
  >
  runtimePaneTitlesByTabId?: Record<string, Record<number, string> | undefined>
  agentStatusByPaneKey?: Record<string, AgentStatusEntry | undefined>
  settings: Parameters<typeof getActiveRuntimeTarget>[0]
} & Pick<WorktreeRuntimeOwnerState, 'repos' | 'worktreesByRepo'>

export function getActiveTerminalNoteTarget(
  state: ActiveTerminalNoteTargetState,
  worktreeId: string
): ActiveTerminalNoteTarget | null {
  if (state.activeWorktreeId !== worktreeId) {
    return null
  }

  const tabId =
    state.activeTabType === 'terminal'
      ? (state.activeTabId ?? state.activeTabIdByWorktree[worktreeId])
      : state.activeTabIdByWorktree[worktreeId]
  if (!tabId || !(state.tabsByWorktree[worktreeId] ?? []).some((tab) => tab.id === tabId)) {
    return null
  }

  const leafId = state.terminalLayoutsByTabId[tabId]?.activeLeafId
  return leafId ? { tabId, leafId } : null
}

export async function findActiveRuntimeTerminal(
  runtimeTarget: ReturnType<typeof getActiveRuntimeTarget>,
  worktreeId: string,
  noteTarget: ActiveTerminalNoteTarget,
  timeoutMs: number
): Promise<TerminalListResult['terminals'][number] | null> {
  const { terminals } = await (
    await openRuntimeTerminalClient(runtimeTarget)
  ).list(
    // Why: worktree ids can look like branch names or paths; keep the lookup unambiguous.
    { worktree: toRuntimeWorktreeSelector(worktreeId), limit: ACTIVE_AGENT_TERMINAL_LIST_LIMIT },
    { timeoutMs }
  )
  return (
    terminals.find(
      (terminal) => terminal.tabId === noteTarget.tabId && terminal.leafId === noteTarget.leafId
    ) ?? null
  )
}
