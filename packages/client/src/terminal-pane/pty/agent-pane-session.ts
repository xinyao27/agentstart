import type { AgentType, ParsedAgentStatusPayload } from '@yiru/protocol/agent/status-records'
import { inferAgentStatusInterrupt } from '~renderer/runtime/agent-status-client'
import { useAppStore } from '~renderer/store/state'
import { markTerminalBracketedPasteInterrupted } from '~renderer/terminal/bracketed-paste'

import { createAgentInterruptInference } from '../agent/interrupt-inference'
import type { ManagedPane, PaneManager } from '../pane-manager/pane-manager'
import { safeFit } from '../pane-manager/pane-tree-ops'
import {
  createActivePaneBinding,
  type ActivePaneBindingOptionsOverride
} from './active-pane-binding'
import { createAgentCompletionSession } from './agent-completion-session'
import { createAgentStatusHandler } from './agent-status'
import { createAgentTitleLifecycle } from './agent-title-lifecycle'
import { createCommandCodeStatus } from './command-code-status'
import type { PtyConnectionDeps } from './connection-types'
import { createForegroundAgentSession } from './foreground-agent-session'
import { createPaneAgentIdentity } from './pane-agent-identity'
import { createPaneBinding, type PaneBinding } from './pane-binding'
import { createPaneTitle } from './pane-title'
import { createReattachAgentSignal, type ReattachAgentSignal } from './reattach-agent-signal'
import type { ShellCommandAgentInference } from './shell-command-agent-inference'
import type { StartupLaunch } from './startup-launch'
import { createTerminalInputIntent, type TerminalInputIntent } from './terminal-input-intent'
import { installTerminalKeydown } from './terminal-keydown'
import { createTitleCompletionSideEffects } from './title-completion-side-effects'
import { createTitleOnlyInterrupt } from './title-only-interrupt'
import type { PtyTransport } from './transport-types'

type AgentPaneSessionOptions = {
  pane: ManagedPane
  manager: PaneManager
  deps: PtyConnectionDeps
  paneKey: string
  startup: PtyConnectionDeps['startup']
  launch: StartupLaunch
  getTransport: () => PtyTransport
  getIsDisposed: () => boolean
  setFocusReportSuppression: (title: string | undefined, agentType: AgentType | undefined) => void
  clearFocusReportSuppression: () => void
  queueIdleModeReset: () => void
  handleMode2031Subscribe: () => void
}

export type AgentPaneSession = {
  shellCommandInference: ShellCommandAgentInference
  terminalInputIntent: TerminalInputIntent
  reattachAgentSignal: ReattachAgentSignal
  paneBinding: PaneBinding
  bindActivePanePty: (ptyId: string, override?: ActivePaneBindingOptionsOverride) => void
  onAgentStatus: (payload: ParsedAgentStatusPayload) => void
  sampleVisibleForegroundAgent: () => void
  startProcessTracking: () => void
  disposeProcessTracking: () => void
  observeOutputActivity: () => void
  requestKnownDroidReconfirmation: () => void
  observeInterruptIntent: (intent: 'ctrl-c' | 'plain-escape') => void
  observeTitleOnlyInterrupt: () => void
  disposeBeforeStartup: () => void
  disposeBeforeOutput: () => void
  disposeAfterOutput: () => void
}

export function createAgentPaneSession(options: AgentPaneSessionOptions): AgentPaneSession {
  const neutralTerminalTitle = (): string => {
    const state = useAppStore.getState()
    const tab = (state.tabsByWorktree[options.deps.worktreeId] ?? []).find(
      (entry) => entry.id === options.deps.tabId
    )
    return tab?.defaultTitle?.trim() || 'Terminal'
  }
  const completionSideEffects = createTitleCompletionSideEffects({
    paneKey: options.paneKey,
    setCacheTimerStartedAt: (timestamp) =>
      options.deps.setCacheTimerStartedAt(options.paneKey, timestamp),
    setFocusReportSuppression: options.setFocusReportSuppression,
    clearFocusReportSuppression: options.clearFocusReportSuppression,
    queueIdleTerminalModeReset: options.queueIdleModeReset
  })
  const identity = createPaneAgentIdentity({
    paneKey: options.paneKey,
    tabId: options.deps.tabId,
    worktreeId: options.deps.worktreeId,
    paneId: options.pane.id,
    startup: options.startup,
    getNeutralTitle: neutralTerminalTitle,
    getIsActivePane: () => options.manager.getActivePane()?.id === options.pane.id,
    setRuntimePaneTitle: (title) =>
      options.deps.setRuntimePaneTitle(options.deps.tabId, options.pane.id, title),
    updateTabTitle: (title) => options.deps.updateTabTitle(options.deps.tabId, title)
  })
  const titleOnlyInterrupt = createTitleOnlyInterrupt({
    paneKey: options.paneKey,
    tabId: options.deps.tabId,
    worktreeId: options.deps.worktreeId,
    paneId: options.pane.id,
    getNeutralTitle: neutralTerminalTitle,
    getIsActivePane: () => options.manager.getActivePane()?.id === options.pane.id,
    setRuntimePaneTitle: (title) =>
      options.deps.setRuntimePaneTitle(options.deps.tabId, options.pane.id, title),
    updateTabTitle: (title) => options.deps.updateTabTitle(options.deps.tabId, title)
  })
  const reattachAgentSignal = createReattachAgentSignal({
    terminal: options.pane.terminal,
    paneKey: options.paneKey,
    tabId: options.deps.tabId,
    worktreeId: options.deps.worktreeId,
    paneId: options.pane.id,
    getIsDisposed: options.getIsDisposed,
    queueIdleTerminalModeReset: options.queueIdleModeReset
  })
  const interruptInference = createAgentInterruptInference({
    paneKey: options.paneKey,
    getStatusEntry: () => useAppStore.getState().agentStatusByPaneKey[options.paneKey],
    inferInterrupt: (request) =>
      inferAgentStatusInterrupt(request)
        .then((applied) => {
          if (applied) {
            titleOnlyInterrupt.clearInferredWorkingTitle()
          }
          return applied
        })
        .catch((error) => {
          console.warn('[agent-interrupt] inferInterrupt failed:', error)
          return false
        })
  })
  const terminalInputIntent = createTerminalInputIntent({
    interruptInference,
    onAcceptedInput: (data, intent) => {
      if (intent === 'ctrl-c' || data === '\x03') {
        markTerminalBracketedPasteInterrupted(options.pane.terminal)
      }
    },
    onTitleOnlyInterrupt: titleOnlyInterrupt.observe
  })
  const foregroundAgent = createForegroundAgentSession({
    terminal: options.pane.terminal,
    paneKey: options.paneKey,
    worktreeId: options.deps.worktreeId,
    getPtyId: () => options.getTransport().getPtyId(),
    getIsVisible: () => options.deps.isVisibleRef.current,
    shellCommandInference: identity.shellCommandInference,
    terminalInputIntent,
    hasKnownAgentIdentity: identity.hasKnownAgentIdentity,
    hasLiveHookIcon: identity.hasLiveHookIcon,
    expectsLaunchAgent: identity.expectsLaunchAgent,
    clearStaleTitleOnConfirmedShell: identity.clearStaleTitleOnConfirmedShell
  })
  const disposeTerminalKeydown = installTerminalKeydown({
    terminal: options.pane.terminal,
    container: options.pane.container,
    inputIntent: terminalInputIntent,
    sampleForegroundAgent: foregroundAgent.sampleVisible,
    clearTabUnread: () => options.deps.clearTerminalTabUnread(options.deps.tabId),
    clearPaneUnread: () => options.deps.clearTerminalPaneUnread(options.paneKey),
    clearWorktreeUnread: () => options.deps.clearWorktreeUnread(options.deps.worktreeId)
  })
  const completion = createAgentCompletionSession({
    paneKey: options.paneKey,
    tabId: options.deps.tabId,
    worktreeId: options.deps.worktreeId,
    launchToken: options.launch.launchToken ?? null,
    getPtyId: () => options.getTransport().getPtyId(),
    getIsDisposed: options.getIsDisposed,
    getIsVisible: () => options.deps.isVisibleRef.current,
    getHasTabPty: () => (useAppStore.getState().ptyIdsByTabId[options.deps.tabId] ?? []).length > 0,
    clearTitleCompletion: completionSideEffects.clear,
    setFocusReportSuppression: options.setFocusReportSuppression,
    queueIdleTerminalModeReset: options.queueIdleModeReset,
    dispatchNotification: options.deps.dispatchNotification,
    markWorktreeUnread: options.deps.markWorktreeUnread,
    markTerminalTabUnread: options.deps.markTerminalTabUnread,
    markTerminalPaneUnread: options.deps.markTerminalPaneUnread
  })
  const commandCodeStatus = createCommandCodeStatus({
    paneKey: options.paneKey,
    tabId: options.deps.tabId,
    paneId: options.pane.id
  })
  const title = createPaneTitle({
    paneKey: options.paneKey,
    paneId: options.pane.id,
    tabId: options.deps.tabId,
    launchToken: options.launch.launchToken ?? null,
    getDisplayOwner: identity.getAuthoritativeAgent,
    getRendererOwner: identity.getPaneScopedRendererOwner,
    getIsActivePane: () => options.manager.getActivePane()?.id === options.pane.id,
    setGpuRendering: (enabled) => options.manager.setPaneGpuRendering(options.pane.id, enabled),
    setRuntimeTitle: (value) =>
      options.deps.setRuntimePaneTitle(options.deps.tabId, options.pane.id, value),
    updateTabTitle: (value) => options.deps.updateTabTitle(options.deps.tabId, value),
    setCacheTimerStartedAt: (timestamp) =>
      options.deps.setCacheTimerStartedAt(options.paneKey, timestamp),
    completionSideEffects,
    notifications: completion.notifications
  })
  const titleLifecycle = createAgentTitleLifecycle({
    paneKey: options.paneKey,
    setCacheTimerStartedAt: (timestamp) =>
      options.deps.setCacheTimerStartedAt(options.paneKey, timestamp),
    setFocusReportSuppression: options.setFocusReportSuppression,
    clearFocusReportSuppression: options.clearFocusReportSuppression,
    queueIdleTerminalModeReset: options.queueIdleModeReset,
    clearShellInference: identity.shellCommandInference.clear,
    reconfirmKnownDroid: identity.shellCommandInference.requestKnownDroidReconfirmation,
    disposeTitleOnlyInterrupt: titleOnlyInterrupt.dispose,
    completionSideEffects,
    notifications: completion.notifications
  })
  const paneBinding = createPaneBinding({
    paneId: options.pane.id,
    tabId: options.deps.tabId,
    container: options.pane.container,
    getIsDisposed: options.getIsDisposed,
    fit: () => {
      safeFit(options.pane)
    },
    callbacks: {
      onTitleChange: title.onChange,
      onBell: completion.notifications.onBell,
      onAgentBecameIdle: titleLifecycle.onIdle,
      onAgentBecameWorking: titleLifecycle.onWorking,
      onAgentExited: titleLifecycle.onExited,
      onCommandFinished: foregroundAgent.handleCommandFinished,
      onPrLink: (link) =>
        useAppStore.getState().observeTerminalGitHubPullRequestLink(options.deps.worktreeId, link),
      onCommandCodeWorking: commandCodeStatus.seedWorking,
      onCommandCodeDone: commandCodeStatus.scheduleDone,
      onMode2031Subscribe: options.handleMode2031Subscribe
    }
  })
  const bindActivePanePty = createActivePaneBinding({
    paneKey: options.paneKey,
    tabId: options.deps.tabId,
    launchToken: options.launch.launchToken ?? null,
    launchConfig: options.startup?.launchConfig ?? null,
    initialStatus: options.startup?.initialAgentStatus ?? null,
    paneBinding,
    getAuthoritativeAgent: identity.getAuthoritativeAgent,
    resolveExpectedLaunchAgent: identity.resolveExpectedLaunchAgent,
    onInitialAgentStarted: foregroundAgent.onCommandStarted,
    sampleForegroundAgent: foregroundAgent.sampleVisible,
    syncLayoutBinding: (ptyId) => options.deps.syncPanePtyLayoutBinding(options.pane.id, ptyId),
    updateTabPtyId: (ptyId, replacedPtyId) =>
      options.deps.updateTabPtyId(options.deps.tabId, ptyId, replacedPtyId),
    startProcessTracking: completion.coordinator.startProcessTracking
  })
  const onAgentStatus = createAgentStatusHandler({
    paneKey: options.paneKey,
    paneId: options.pane.id,
    tabId: options.deps.tabId,
    launchToken: options.launch.launchToken ?? null,
    getAuthoritativeAgent: identity.getAuthoritativeAgent,
    notifications: completion.notifications
  })

  return {
    shellCommandInference: identity.shellCommandInference,
    terminalInputIntent,
    reattachAgentSignal,
    paneBinding,
    bindActivePanePty,
    onAgentStatus,
    sampleVisibleForegroundAgent: foregroundAgent.sampleVisible,
    startProcessTracking: completion.coordinator.startProcessTracking,
    disposeProcessTracking: completion.coordinator.dispose,
    observeOutputActivity: completion.coordinator.observeOutputActivity,
    requestKnownDroidReconfirmation: identity.shellCommandInference.requestKnownDroidReconfirmation,
    observeInterruptIntent: interruptInference.observeInputIntent,
    observeTitleOnlyInterrupt: titleOnlyInterrupt.observe,
    disposeBeforeStartup: () => {
      disposeTerminalKeydown()
      terminalInputIntent.dispose()
      interruptInference.dispose()
      titleOnlyInterrupt.dispose()
      commandCodeStatus.dispose()
    },
    disposeBeforeOutput: () => {
      completionSideEffects.dispose()
      completionSideEffects.clear()
      completion.notifications.dispose()
      reattachAgentSignal.dispose()
    },
    disposeAfterOutput: () => {
      foregroundAgent.dispose()
      completion.coordinator.dispose()
    }
  }
}
