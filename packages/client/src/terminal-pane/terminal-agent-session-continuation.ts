import { isTuiAgent } from '@yiru/protocol/agent/identity'
import type { TuiAgent } from '@yiru/protocol/agent/types'
import { makePaneKey } from '@yiru/protocol/terminal/pane-identity'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'
import type { ManagedPane } from '~renderer/terminal-pane/pane-manager/pane-manager'

import {
  buildAgentSessionContinuationPrompt,
  type AgentSessionContinuationRequest
} from './agent/session-continuation'

type PrepareAgentSessionContinuationFromPaneArgs = {
  pane: ManagedPane
  tabId: string
  worktreeId: string
  groupId: string | null
  workspacePath: string
  initialCwd: string
  /** Why: switching Agent or model is a valid thing to do on a session that has
   *  nothing to hand off yet, so that entry point must not demand context. */
  requireContext?: boolean
}

export function canContinueAgentSessionInNewSession(
  sourceAgent: string | null | undefined
): boolean {
  return isTuiAgent(sourceAgent)
}

function resolveSourceAgent(args: {
  tabId: string
  worktreeId: string
  pane: ManagedPane
}): TuiAgent | null {
  const state = useAppStore.getState()
  const paneAgent = state.agentStatusByPaneKey[makePaneKey(args.tabId, args.pane.leafId)]?.agentType
  if (isTuiAgent(paneAgent)) {
    return paneAgent
  }
  const tabAgent = state.tabsByWorktree[args.worktreeId]?.find(
    (tab) => tab.id === args.tabId
  )?.launchAgent
  return isTuiAgent(tabAgent) ? tabAgent : null
}

export function prepareAgentSessionContinuationFromPane({
  pane,
  tabId,
  worktreeId,
  groupId,
  workspacePath,
  initialCwd,
  requireContext = true
}: PrepareAgentSessionContinuationFromPaneArgs): AgentSessionContinuationRequest | null {
  const state = useAppStore.getState()
  const paneKey = makePaneKey(tabId, pane.leafId)
  const status = state.agentStatusByPaneKey[paneKey]
  const sourceAgent = resolveSourceAgent({ pane, tabId, worktreeId })
  const transcriptPath = status?.providerSession?.transcriptPath?.trim() || null
  const capturedText = transcriptPath ? '' : pane.serializeAddon.serialize({ scrollback: 800 })
  const source = {
    // Why: prefer the same-host transcript so opening the dialog does not serialize large scrollback.
    capturedText,
    sourceAgent,
    sourceLabel: paneKey,
    sourceWorkingDirectory: initialCwd || workspacePath,
    transcriptPath,
    lastPrompt: status?.prompt,
    lastAssistantMessage: status?.lastAssistantMessage
  }
  if (requireContext && !buildAgentSessionContinuationPrompt(source, 'focused')) {
    toast.error(
      translate(
        'components.agentSessionContinuation.noContext',
        'No session context is available to continue in a new session.'
      )
    )
    pane.terminal.focus()
    return null
  }

  return {
    source,
    worktreeId,
    groupId,
    workspacePath,
    initialCwd: initialCwd || workspacePath,
    launchSource: 'terminal_context_menu'
  }
}
