import type { TuiAgent } from '@yiru/protocol/agent/types'
import { toast } from 'sonner'
import type { AgentStartupPlan } from '~renderer/agent/tui-startup'
import { translate } from '~renderer/i18n/i18n'
import {
  createRemoteRuntimeAgentSessionTerminal,
  createRemoteRuntimeSessionTerminal,
  isRemoteTerminalSurfaceTabId
} from '~renderer/runtime/remote-runtime-session'
import { useAppStore } from '~renderer/store/state'

function removeStaleLocalAgentTabsForRemoteHostLaunch(worktreeId: string): void {
  const state = useAppStore.getState()
  for (const tab of state.tabsByWorktree[worktreeId] ?? []) {
    if (tab.launchAgent && !isRemoteTerminalSurfaceTabId(tab.id)) {
      // Why: pruning a stale local agent tab is a system close — keep it out of
      // the Cmd+Shift+T reopen stack.
      state.closeTab(tab.id, { reason: 'cleanup' })
    }
  }
}

/**
 * Launch an agent terminal on the web runtime host instead of a local tab.
 *
 * Why: paired web tabs are host-owned, so this path never creates a local tab
 * (callers return tabId: null). Local-only agent tabs cannot be closed because
 * close routes through session.tabs.close on the host, so prune them before
 * the host snapshot.
 */
export function launchAgentInRemoteHostTab(args: {
  agent: TuiAgent
  worktreeId: string
  environmentId: string | null
  groupId?: string
  cwd?: string | null
  hasPrompt: boolean
  startupPlan: AgentStartupPlan
  promptAfterReady?: {
    content: string
    submit: boolean
    forcePaste: boolean
  }
  onPromptDelivered?: () => void
}): Promise<{ delivered: boolean; failureNotified: boolean }> {
  const {
    agent,
    worktreeId,
    environmentId,
    groupId,
    cwd,
    hasPrompt,
    startupPlan,
    promptAfterReady,
    onPromptDelivered
  } = args
  removeStaleLocalAgentTabsForRemoteHostLaunch(worktreeId)
  const launch = {
    worktreeId,
    environmentId,
    targetGroupId: groupId,
    activate: true,
    ...(cwd?.trim() ? { cwd } : {}),
    ...(hasPrompt
      ? {
          command: startupPlan.launchCommand,
          ...(startupPlan.env ? { env: startupPlan.env } : {}),
          launchConfig: startupPlan.launchConfig,
          launchAgent: agent,
          ...(startupPlan.startupCommandDelivery
            ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
            : {})
        }
      : { agent })
  }
  const creation = promptAfterReady
    ? createRemoteRuntimeAgentSessionTerminal({
        ...launch,
        agent,
        promptAfterReady: promptAfterReady.content,
        submitPrompt: promptAfterReady.submit,
        forcePromptPaste: promptAfterReady.forcePaste
      })
    : createRemoteRuntimeSessionTerminal(launch)

  return creation.then((result) => {
    const created = typeof result === 'boolean' ? result : result.created
    const promptDelivered = typeof result === 'boolean' ? result : result.promptDelivered
    // Why: created means the host accepted the launch, not that a local tab
    // exists; keep pruning stale local rows until the snapshot mirrors.
    removeStaleLocalAgentTabsForRemoteHostLaunch(worktreeId)
    if (!created) {
      toast.error(
        translate(
          'auto.lib.launch.agent.in.new.tab.11cce5cc77',
          'Could not launch {{value0}} in a new terminal.',
          { value0: agent }
        )
      )
      return { delivered: false, failureNotified: true }
    }
    useAppStore.getState().setActiveTabType('terminal')
    if (hasPrompt && promptDelivered) {
      onPromptDelivered?.()
    }
    return { delivered: promptDelivered, failureNotified: false }
  })
}
