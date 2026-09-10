import type { StartupCommandDelivery } from '@agentstart/protocol/agent/launch/startup-delivery'
import type { SleepingAgentLaunchConfig } from '@agentstart/protocol/agent/session-resume'
import type { TuiAgent } from '@agentstart/protocol/agent/types'

import { deliverLaunchPromptToAgentTab } from '../agent/launch-prompt-delivery'
import { useAppStore } from '../store/state'
import type { AppState } from '../store/types'
import { resolveRemoteRuntimeSessionEnvironmentId } from './remote-runtime-session-environment'
import {
  createRemoteSessionBrowserTabCommand,
  createRemoteSessionTerminalCommand
} from './remote-session/commands'
import type { RuntimeMobileSessionCreateTerminalResult } from './remote-session/session-model'
import { requestRemoteSessionTabsRefresh } from './remote-session/tabs-refresh-requests'
import { toRemoteTerminalSurfaceTabId } from './remote-terminal-surface-id'

type CreateRemoteRuntimeSessionTerminalArgs = {
  worktreeId: string
  environmentId?: string | null
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
  selectWorktree?: boolean
}

type CreatedRemoteRuntimeSessionTerminal = {
  terminal: RuntimeMobileSessionCreateTerminalResult['tab']
}

export async function createRemoteRuntimeSessionTerminal(
  args: CreateRemoteRuntimeSessionTerminalArgs
): Promise<boolean> {
  return Boolean(await createRemoteRuntimeSessionTerminalResult(args))
}

export async function createRemoteRuntimeAgentSessionTerminal(
  args: CreateRemoteRuntimeSessionTerminalArgs & {
    agent: TuiAgent
    promptAfterReady: string
    submitPrompt: boolean
    forcePromptPaste: boolean
  }
): Promise<{ created: boolean; promptDelivered: boolean }> {
  const created = await createRemoteRuntimeSessionTerminalResult(args)
  if (!created) {
    return { created: false, promptDelivered: false }
  }
  const promptDelivered = await deliverLaunchPromptToAgentTab({
    tabId: toRemoteTerminalSurfaceTabId(created.terminal.parentTabId),
    content: args.promptAfterReady,
    agent: args.agent,
    submit: args.submitPrompt,
    forcePaste: args.forcePromptPaste
  })
  return { created: true, promptDelivered }
}

async function createRemoteRuntimeSessionTerminalResult(
  args: CreateRemoteRuntimeSessionTerminalArgs
): Promise<CreatedRemoteRuntimeSessionTerminal | null> {
  const environmentId = resolveRemoteRuntimeSessionEnvironmentId(args.environmentId)
  if (!environmentId) {
    return null
  }
  if (args.selectWorktree !== false) {
    selectRemoteRuntimeSessionWorktree(args.worktreeId)
  }
  const result = await createRemoteSessionTerminalCommand({ ...args, environmentId })
  if (result.status === 'failed') {
    console.warn(
      '[remote-runtime-session] failed to create terminal:',
      result.error instanceof Error ? result.error.message : String(result.error)
    )
    return null
  }
  await requestRemoteSessionTabsRefresh({ environmentId, worktreeId: args.worktreeId })
  return { terminal: result.value.tab }
}

export async function createRemoteRuntimeSessionBrowserTab(args: {
  worktreeId: string
  environmentId?: string | null
  url?: string
  profileId?: string | null
  targetGroupId?: string
  selectWorktree?: boolean
}): Promise<boolean> {
  const environmentId = resolveRemoteRuntimeSessionEnvironmentId(args.environmentId)
  if (!environmentId) {
    return false
  }
  const shouldSelectWorktree = args.selectWorktree !== false
  const stagedFromWorktreeId = useAppStore.getState().activeWorktreeId
  if (shouldSelectWorktree) {
    selectRemoteRuntimeSessionWorktree(args.worktreeId)
  }
  const result = await createRemoteSessionBrowserTabCommand({
    environmentId,
    worktreeId: args.worktreeId,
    url: args.url,
    profileId: args.profileId,
    targetGroupId: args.targetGroupId
  })
  if (result.status === 'failed') {
    console.warn(
      '[remote-runtime-session] failed to create browser tab:',
      result.error instanceof Error ? result.error.message : String(result.error)
    )
    return false
  }
  stageRemoteRuntimeBrowserTab({
    environmentId,
    worktreeId: args.worktreeId,
    remotePageId: result.value.browserPageId,
    url: args.url,
    targetGroupId: args.targetGroupId,
    restoreFocus:
      shouldSelectWorktree &&
      (stagedFromWorktreeId === args.worktreeId ||
        useAppStore.getState().activeWorktreeId === args.worktreeId)
  })
  void requestRemoteSessionTabsRefresh({ environmentId, worktreeId: args.worktreeId })
  return true
}

function stageRemoteRuntimeBrowserTab(args: {
  environmentId: string
  worktreeId: string
  remotePageId: string
  url?: string
  targetGroupId?: string
  restoreFocus?: boolean
}): void {
  const remotePageId = args.remotePageId.trim()
  if (!remotePageId) {
    return
  }
  const existing = findLocalBrowserPageForRemotePage(
    useAppStore.getState(),
    args.environmentId,
    remotePageId
  )
  if (args.restoreFocus !== false) {
    selectRemoteRuntimeSessionWorktree(args.worktreeId)
  }
  if (existing) {
    if (args.restoreFocus !== false) {
      useAppStore
        .getState()
        .focusBrowserTabInWorktree(args.worktreeId, existing.pageId, { surfacePane: true })
    }
    return
  }
  const url = args.url?.trim() || 'about:blank'
  // Why: stage the host handle before the asynchronous snapshot arrives so
  // React never renders a fallback workspace for the selected worktree.
  const browserTab = useAppStore.getState().createBrowserTab(args.worktreeId, url, {
    title: url === 'about:blank' ? 'New Browser Tab' : url,
    focusAddressBar: true,
    pageId: remotePageId,
    browserRuntimeEnvironmentId: args.environmentId,
    targetGroupId: args.targetGroupId
  })
  const pageId = browserTab.activePageId ?? browserTab.pageIds?.[0] ?? null
  if (pageId) {
    useAppStore.getState().setRemoteBrowserPageHandle(pageId, {
      environmentId: args.environmentId,
      remotePageId
    })
  }
}

function selectRemoteRuntimeSessionWorktree(worktreeId: string): void {
  useAppStore.getState().setActiveWorktree(worktreeId)
}

function findLocalBrowserPageForRemotePage(
  state: AppState,
  environmentId: string,
  remotePageId: string
): { pageId: string } | null {
  for (const pages of Object.values(state.browserPagesByWorkspace)) {
    for (const page of pages) {
      const handle = state.remoteBrowserPageHandlesByPageId[page.id]
      if (handle?.environmentId === environmentId && handle.remotePageId === remotePageId) {
        return { pageId: page.id }
      }
    }
  }
  return null
}
