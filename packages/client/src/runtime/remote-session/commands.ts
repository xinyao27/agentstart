import type { StartupCommandDelivery } from '@yiru/protocol/agent/launch/startup-delivery'
import type { SleepingAgentLaunchConfig } from '@yiru/protocol/agent/session-resume'
import type { TuiAgent } from '@yiru/protocol/agent/types'
import { BrowserRuntimeClient } from '@yiru/protocol/browser-runtime'

import { openRuntimeProtocolTarget } from '../protocol-target'
import { isRemoteTerminalSurfaceTabId, toHostSessionTabId } from '../remote-terminal-surface-id'
import { requireSessionTabsClient } from '../session-tabs-target'
import { toRuntimeWorktreeSelector } from '../worktree-selector'
import { recordRemoteSessionCloseIntent } from './close-intent'
import { recordRemoteSessionFocusIntent } from './focus-intent'
import type { RuntimeMobileSessionCreateTerminalResult } from './session-model'

export type RemoteSessionCommandResult<T> =
  | { status: 'completed'; value: T }
  | { status: 'failed'; error: unknown }

export async function createRemoteSessionTerminalCommand(args: {
  environmentId: string
  worktreeId: string
  afterTabId?: string
  targetGroupId?: string
  command?: string
  cwd?: string
  env?: Record<string, string>
  envToDelete?: string[]
  startupCommandDelivery?: StartupCommandDelivery
  launchConfig?: SleepingAgentLaunchConfig
  agent?: TuiAgent
  launchAgent?: TuiAgent
  activate?: boolean
}): Promise<RemoteSessionCommandResult<RuntimeMobileSessionCreateTerminalResult>> {
  try {
    const value = await requireSessionTabsClient({
      kind: 'environment',
      environmentId: args.environmentId
    }).then((client) =>
      client.createTerminal(
        {
          worktree: toRuntimeWorktreeSelector(args.worktreeId),
          afterTabId: args.afterTabId ? toHostSessionTabId(args.afterTabId) : undefined,
          targetGroupId: args.targetGroupId,
          command: args.command,
          cwd: args.cwd,
          ...(args.env ? { env: args.env } : {}),
          ...(args.envToDelete ? { envToDelete: args.envToDelete } : {}),
          startupCommandDelivery: args.startupCommandDelivery,
          ...(args.launchConfig
            ? {
                launchConfig: {
                  agentArgs: args.launchConfig.agentArgs,
                  agentEnv: args.launchConfig.agentEnv,
                  ...(args.launchConfig.agentCommand === undefined
                    ? {}
                    : { agentCommand: args.launchConfig.agentCommand }),
                  ...(args.launchConfig.ompResumeFilePath === undefined
                    ? {}
                    : { ompResumeFilePath: args.launchConfig.ompResumeFilePath })
                }
              }
            : {}),
          agent: args.agent,
          ...(args.launchAgent ? { launchAgent: args.launchAgent } : {}),
          activate: args.activate !== false
        },
        { timeoutMs: 15_000 }
      )
    )
    if (args.activate !== false) {
      recordRemoteSessionFocusIntent(args.worktreeId, value.tab.id)
    }
    return { status: 'completed', value }
  } catch (error) {
    return { status: 'failed', error }
  }
}

export async function createRemoteSessionBrowserTabCommand(args: {
  browserPageId?: string
  environmentId: string
  worktreeId: string
  url?: string
  profileId?: string | null
  targetGroupId?: string
}): Promise<RemoteSessionCommandResult<Awaited<ReturnType<BrowserRuntimeClient['createTab']>>>> {
  try {
    const client = new BrowserRuntimeClient(
      await openRuntimeProtocolTarget({ kind: 'environment', environmentId: args.environmentId })
    )
    const value = await client.createTab(
      {
        worktree: toRuntimeWorktreeSelector(args.worktreeId),
        ...(args.url === undefined ? {} : { url: args.url }),
        ...(args.profileId == null ? {} : { profileId: args.profileId })
      },
      { timeoutMs: 30_000 }
    )
    return { status: 'completed', value }
  } catch (error) {
    return { status: 'failed', error }
  }
}

export function setRemoteSessionTabPropsCommand(args: {
  environmentId: string
  worktreeId: string
  tabId: string
  color?: string | null
  isPinned?: boolean
}): void {
  const hostTabId = isRemoteTerminalSurfaceTabId(args.tabId)
    ? toHostSessionTabId(args.tabId)
    : args.tabId
  void requireSessionTabsClient({ kind: 'environment', environmentId: args.environmentId })
    .then((client) =>
      client.setTabProps(
        {
          worktree: toRuntimeWorktreeSelector(args.worktreeId),
          tabId: hostTabId,
          ...(args.color !== undefined ? { color: args.color } : {}),
          ...(args.isPinned !== undefined ? { isPinned: args.isPinned } : {})
        },
        { timeoutMs: 15_000 }
      )
    )
    .catch((error) => {
      console.warn(
        '[remote-session-command] failed to set tab props:',
        error instanceof Error ? error.message : String(error)
      )
    })
}

export async function closeRemoteSessionTabCommand(args: {
  environmentId: string
  worktreeId: string
  tabId: string
}): Promise<RemoteSessionCommandResult<unknown>> {
  const hostTabId = isRemoteTerminalSurfaceTabId(args.tabId)
    ? toHostSessionTabId(args.tabId)
    : args.tabId
  recordRemoteSessionCloseIntent(args.worktreeId, hostTabId, Date.now())
  try {
    const value = await requireSessionTabsClient({
      kind: 'environment',
      environmentId: args.environmentId
    }).then((client) =>
      client.close(
        { worktree: toRuntimeWorktreeSelector(args.worktreeId), tabId: hostTabId },
        { timeoutMs: 15_000 }
      )
    )
    return { status: 'completed', value }
  } catch (error) {
    return { status: 'failed', error }
  }
}
