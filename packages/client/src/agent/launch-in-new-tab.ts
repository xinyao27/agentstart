import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '@yiru/protocol/agent/launch-defaults'
import { TUI_AGENT_CONFIG } from '@yiru/protocol/agent/launch/config'
import type { SessionOptionValue } from '@yiru/protocol/agent/session-options/types'
import type { StartupHostPlatform } from '@yiru/protocol/agent/shell-command'
import type { TuiAgent } from '@yiru/protocol/agent/types'
import { resolveLocalWindowsAgentStartupShell } from '@yiru/protocol/host/windows-terminal-shell'
import type { LaunchSource } from '@yiru/protocol/telemetry/events/foundations'
import { toast } from 'sonner'
import { seedCommandCodeSubmittedPromptStatus } from '~renderer/agent/command-code-status-seed'
import { getAgentLaunchPlatformForRepo } from '~renderer/agent/launch-platform'
import { deliverLaunchPromptToAgentTab } from '~renderer/agent/launch-prompt-delivery'
import { launchAgentInRemoteHostTab } from '~renderer/agent/launch-remote-host-tab'
import {
  buildAgentDraftLaunchPlan,
  buildAgentStartupPlan,
  type AgentStartupPlan
} from '~renderer/agent/tui-startup'
import { translate } from '~renderer/i18n/i18n'
import { CLIENT_PLATFORM } from '~renderer/new-workspace/workspace-creation'
import { getLocalProjectExecutionRuntimeContext } from '~renderer/preflight/context'
import { isRemoteRuntimeSessionActive } from '~renderer/runtime/remote-runtime-session'
import { useAppStore } from '~renderer/store/state'
import { reconcileTabOrder } from '~renderer/tab-bar/reconcile-order'
import { track, tuiAgentToAgentKind } from '~renderer/telemetry/client'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import { requestRemoteAgentLaunchHost } from './launch-host-request'

export type LaunchAgentInNewTabArgs = {
  agent: TuiAgent
  worktreeId: string
  /** The tab group the user clicked from. Keeps split-group launches in the
   *  pane the user initiated from instead of falling through to the active group. */
  groupId?: string
  /** Optional initial prompt. Delivery depends on `promptDelivery` and the
   *  agent's prompt mode. */
  prompt?: string
  /** Optional CLI arguments appended to the selected agent command. */
  agentArgs?: string | null
  /** Optional working directory for the new terminal, including nested package paths. */
  initialCwd?: string | null
  /** Force generated prompt text out of the shell launch command. `draft`
   *  leaves it editable; `submit-after-ready` sends it once the TUI is ready. */
  promptDelivery?: 'auto-submit' | 'draft' | 'submit-after-ready'
  /** Telemetry surface that initiated this launch. Defaults to the tab-bar
   *  quick-launch entry point so existing callers stay unchanged. */
  launchSource?: LaunchSource
  /** User-authored Quick Command label for local tabs created from the tab bar. */
  quickCommandLabel?: string | null
  /** Shell platform that will execute the startup command. Defaults to the
   * local project runtime; remote launches always use their runtime status. */
  launchPlatform?: StartupHostPlatform
  /** Called after the prompt is actually delivered to the agent input path. */
  onPromptDelivered?: () => void
  /** Model and per-model option picks for this launch. Overrides the persisted
   *  defaults so a caller can relaunch onto a different model or effort level. */
  sessionOptions?: Record<string, SessionOptionValue>
}

export type LaunchAgentInNewTabResult = {
  tabId: string | null
  startupPlan: AgentStartupPlan
  pasteDraftAfterLaunch: boolean
  promptDeliveryResult?: Promise<{ delivered: boolean; failureNotified: boolean }>
} | null

export async function launchAgentInNewTab(
  args: LaunchAgentInNewTabArgs
): Promise<LaunchAgentInNewTabResult> {
  const {
    agent,
    worktreeId,
    groupId,
    prompt,
    agentArgs,
    initialCwd,
    promptDelivery = 'auto-submit',
    launchSource,
    quickCommandLabel,
    launchPlatform,
    onPromptDelivered
  } = args
  let store = useAppStore.getState()
  const worktree = store.allWorktrees?.().find((entry: { id: string }) => entry.id === worktreeId)
  const repo = worktree ? store.repos?.find((entry) => entry.id === worktree.repoId) : null
  const runtimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(store, worktreeId)
  const isRemote = Boolean(runtimeEnvironmentId)
  let resolvedLaunchPlatform =
    launchPlatform ??
    (repo
      ? getAgentLaunchPlatformForRepo(getLocalProjectExecutionRuntimeContext(store, worktreeId))
      : CLIENT_PLATFORM)
  let queuedShell = resolveLocalWindowsAgentStartupShell({
    platform: resolvedLaunchPlatform,
    isRemote,
    terminalWindowsShell: store.settings?.terminalWindowsShell
  })
  if (runtimeEnvironmentId) {
    const host = await requestRemoteAgentLaunchHost(worktreeId, runtimeEnvironmentId)
    if (!host) {
      return null
    }
    store = useAppStore.getState()
    resolvedLaunchPlatform = host.platform
    queuedShell = host.shell
  }
  const cmdOverrides = store.settings?.agentCmdOverrides ?? {}
  const effectiveAgentArgs =
    agentArgs !== undefined
      ? agentArgs
      : resolveTuiAgentLaunchArgs(agent, store.settings?.agentDefaultArgs)
  const agentEnv = resolveTuiAgentLaunchEnv(agent, store.settings?.agentDefaultEnv)
  const startupPlanBase = {
    agent,
    cmdOverrides,
    platform: resolvedLaunchPlatform,
    shell: queuedShell,
    isRemote,
    agentArgs: effectiveAgentArgs,
    agentEnv,
    sessionOptions: args.sessionOptions
  }
  const trimmedPrompt = prompt?.trim() ?? ''
  const hasPrompt = trimmedPrompt.length > 0
  const isFollowupPath = TUI_AGENT_CONFIG[agent].promptInjectionMode === 'stdin-after-start'
  // Why: argv/flag agents fold the prompt into the launch command and
  // auto-submit — keeping behavior consistent with the composer/tab-bar `+`
  // mental model, where the prompt is "the first turn the user sent".
  // Followup-path and generated-context launches can deliver a prompt via
  // post-launch bracketed paste; callers decide whether that paste remains a
  // draft or submits after readiness.
  let startupPlan: AgentStartupPlan | null = null
  let pasteDraftAfterLaunch: string | null = null
  let submitPastedPrompt = false
  let promptDeliveryResult: Promise<{ delivered: boolean; failureNotified: boolean }> | undefined

  if (hasPrompt && promptDelivery === 'submit-after-ready') {
    // Why: generated multi-line prompts are too large to echo through a shell
    // argv/prefill command. Launch cleanly, then paste+submit inside the TUI.
    startupPlan = buildAgentStartupPlan({
      ...startupPlanBase,
      prompt: '',
      allowEmptyPromptLaunch: true
    })
    pasteDraftAfterLaunch = trimmedPrompt
    submitPastedPrompt = true
  } else if (hasPrompt && promptDelivery === 'draft') {
    const draftLaunchPlan = buildAgentDraftLaunchPlan({
      ...startupPlanBase,
      draft: trimmedPrompt
    })
    if (draftLaunchPlan) {
      startupPlan = {
        agent: draftLaunchPlan.agent,
        launchCommand: draftLaunchPlan.launchCommand,
        expectedProcess: draftLaunchPlan.expectedProcess,
        followupPrompt: null,
        launchConfig: draftLaunchPlan.launchConfig,
        ...(draftLaunchPlan.sessionOptions
          ? { sessionOptions: draftLaunchPlan.sessionOptions }
          : {}),
        ...(draftLaunchPlan.startupCommandDelivery
          ? { startupCommandDelivery: draftLaunchPlan.startupCommandDelivery }
          : {}),
        ...(draftLaunchPlan.env ? { env: draftLaunchPlan.env } : {})
      }
    } else {
      startupPlan = buildAgentStartupPlan({
        ...startupPlanBase,
        prompt: '',
        allowEmptyPromptLaunch: true
      })
      pasteDraftAfterLaunch = trimmedPrompt
    }
  } else if (hasPrompt && isFollowupPath) {
    startupPlan = buildAgentStartupPlan({
      ...startupPlanBase,
      prompt: '',
      allowEmptyPromptLaunch: true
    })
    pasteDraftAfterLaunch = trimmedPrompt
  } else {
    startupPlan = buildAgentStartupPlan({
      ...startupPlanBase,
      prompt: hasPrompt ? trimmedPrompt : '',
      allowEmptyPromptLaunch: !hasPrompt
    })
  }

  if (!startupPlan) {
    return null
  }

  if (isRemoteRuntimeSessionActive(runtimeEnvironmentId)) {
    const remoteHostDelivery = launchAgentInRemoteHostTab({
      agent,
      worktreeId,
      environmentId: runtimeEnvironmentId,
      groupId,
      cwd: initialCwd,
      hasPrompt,
      startupPlan,
      ...(pasteDraftAfterLaunch !== null
        ? {
            promptAfterReady: {
              content: pasteDraftAfterLaunch,
              submit: submitPastedPrompt,
              forcePaste: promptDelivery === 'submit-after-ready'
            }
          }
        : {}),
      onPromptDelivered
    })
    return {
      tabId: null,
      startupPlan,
      pasteDraftAfterLaunch: pasteDraftAfterLaunch !== null,
      ...(pasteDraftAfterLaunch !== null && promptDelivery === 'submit-after-ready'
        ? { promptDeliveryResult: remoteHostDelivery }
        : {})
    }
  }

  // Why: queue the startup command BEFORE TerminalPane mounts — it captures
  // `pendingStartupByTabId[tabId]` in useState on first render. If the queue
  // lands after mount the agent binary never starts; the user sees a bare shell.
  // Since both calls happen synchronously in the same React batch, the queue
  // is in place by the time the pane commits.
  const tab = store.createTab(worktreeId, groupId, undefined, {
    launchAgent: agent,
    quickCommandLabel
  })
  if (initialCwd?.trim()) {
    // Why: queue before mount so local, WSL, and SSH continuations preserve their subdirectory.
    store.queueTabInitialCwd(tab.id, initialCwd)
  }
  store.queueTabStartupCommand(tab.id, {
    command: startupPlan.launchCommand,
    ...(startupPlan.env ? { env: startupPlan.env } : {}),
    launchConfig: startupPlan.launchConfig,
    launchAgent: agent,
    ...(startupPlan.startupCommandDelivery
      ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
      : {}),
    ...(agent === 'command-code' && hasPrompt && promptDelivery === 'auto-submit'
      ? { initialAgentStatus: { agent, prompt: trimmedPrompt } }
      : {}),
    telemetry: {
      agent_kind: tuiAgentToAgentKind(agent),
      launch_source: launchSource ?? 'tab_bar_quick_launch',
      request_kind: 'new'
    }
  })
  // Why: schedule the bracketed-paste-after-ready follow-up immediately after
  // the startup command is queued. Fire-and-forget so callers keep their
  // synchronous `{ tabId, startupPlan }` signature. The helper short-circuits
  // for agents with a `draftPromptFlag`, so calling it on the followup path
  // is safe even when the draft was already injected via the native flag.
  if (pasteDraftAfterLaunch !== null) {
    // Why: surface silent paste failures — without onTimeout, a stalled agent
    // readiness wait drops the user's notes with no feedback. Suppress when
    // the user closed the tab or switched worktrees so the toast/telemetry
    // don't fire for user-initiated cancellation (mirrors the 5s launch
    // watchdog in QuickLaunchButton).
    let failureNotified = false
    const deliveryPromise = deliverLaunchPromptToAgentTab({
      tabId: tab.id,
      content: pasteDraftAfterLaunch,
      agent,
      submit: submitPastedPrompt,
      forcePaste: promptDelivery === 'submit-after-ready',
      onTimeout: () => {
        const state = useAppStore.getState()
        const tabsForWorktree = state.tabsByWorktree[worktreeId] ?? []
        const currentTab = tabsForWorktree.find((t) => t.id === tab.id)
        if (currentTab?.ptyId === null) {
          // Why: PTY never spawned — a genuine launch failure. Stay silent so
          // the single notice comes from the caller (source-control dialog
          // toast, or QuickLaunch's watchdog); leaving failureNotified false lets it fire.
          return
        }
        if (!currentTab || state.activeWorktreeId !== worktreeId) {
          // Why: user-initiated cancellation (closed the tab or switched
          // worktrees) — mark notified so the deferred source-control caller
          // suppresses its generic "couldn't start" toast too, not just this nudge.
          failureNotified = true
          return
        }
        toast.message(
          translate(
            'auto.lib.launch.agent.in.new.tab.a5a1f7033f',
            "Your {{value0}} wasn't sent — paste it once the agent is ready.",
            { value0: submitPastedPrompt ? 'prompt' : 'notes' }
          )
        )
        failureNotified = true
        track('agent_error', {
          error_class: 'paste_readiness_timeout',
          agent_kind: tuiAgentToAgentKind(agent)
        })
      }
    }).then((delivered) => {
      if (delivered) {
        if (agent === 'command-code' && submitPastedPrompt) {
          // Why: Command Code has no prompt-submit hook; when Yiru submits a
          // generated prompt after readiness, seed working at delivery time.
          seedCommandCodeSubmittedPromptStatus(tab.id, trimmedPrompt)
        }
        onPromptDelivered?.()
      }
      return { delivered, failureNotified: !delivered && failureNotified }
    })
    if (promptDelivery === 'submit-after-ready') {
      promptDeliveryResult = deliveryPromise
    } else {
      void deliveryPromise.catch((error) =>
        console.error('Prompt delivery failed after launch', error)
      )
    }
  } else if (hasPrompt) {
    onPromptDelivered?.()
  }

  // Why: match the `+` button's `createNewTerminalTab` sequence — without
  // `setActiveTabType('terminal')`, a worktree currently showing an editor
  // file keeps rendering the editor and the new terminal tab stays invisible.
  store.setActiveTabType('terminal')

  // Why: persist the tab-bar order with the new terminal appended. Without
  // this, `reconcileTabOrder` falls back to terminals-first when the stored
  // order is unset, which can jump the new tab to index 0 instead of the end.
  const fresh = useAppStore.getState()
  const termIds = (fresh.tabsByWorktree[worktreeId] ?? []).map((t) => t.id)
  const editorIds = fresh.openFiles.filter((f) => f.worktreeId === worktreeId).map((f) => f.id)
  const browserIds = (fresh.browserTabsByWorktree?.[worktreeId] ?? []).map((t) => t.id)
  const base = reconcileTabOrder(
    fresh.tabBarOrderByWorktree[worktreeId],
    termIds,
    editorIds,
    browserIds
  )
  const order = base.filter((id) => id !== tab.id)
  order.push(tab.id)
  fresh.setTabBarOrder(worktreeId, order)

  return {
    tabId: tab.id,
    startupPlan,
    pasteDraftAfterLaunch: pasteDraftAfterLaunch !== null,
    ...(promptDeliveryResult ? { promptDeliveryResult } : {})
  }
}
