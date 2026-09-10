import {
  TUI_AGENT_CONFIG,
  type DraftPasteReadySignal
} from '@agentstart/protocol/agent/launch/config'
import { recognizeAgentProcessFromCommandLine } from '@agentstart/protocol/agent/process/recognition'
import type { TuiAgent } from '@agentstart/protocol/agent/types'
import { createBrowserUuid } from '~renderer/browser/uuid'
import { useAppStore } from '~renderer/store/state'

import {
  beginAgentStartupDeliveryAttempt,
  releaseAgentStartupDeliveryAttempt
} from '../agent/startup-delayed-delivery'
import type { PtyConnectionDeps } from './connection-types'
import type { PtyConnectResult } from './transport-types'

type StartupLaunchOptions = {
  startup: PtyConnectionDeps['startup']
  paneKey: string
  tabId: string
  leafId: string
  worktreeId: string
}

export type StartupLaunch = {
  launchToken: string | undefined
  draftPrompt: string | null
  draftReadySignal: DraftPasteReadySignal
  expectedProcess: string | null
  claimDraftPaste: () => boolean
  markDraftPasteAttempted: () => void
  releaseUnattemptedDraftPaste: () => void
  registerEffectiveConfig: (
    launchConfig: PtyConnectResult['launchConfig'] | undefined,
    metadata?: { launchToken?: string; launchAgent?: TuiAgent }
  ) => void
  clearConfig: () => void
}

export function createStartupLaunch(options: StartupLaunchOptions): StartupLaunch {
  const startup = options.startup
  const launchToken = startup?.launchConfig
    ? (startup.launchToken ?? createBrowserUuid())
    : undefined
  const draftAgent = startup?.launchAgent ?? startup?.initialAgentStatus?.agent
  const draftAgentConfig = draftAgent ? TUI_AGENT_CONFIG[draftAgent] : null
  const draftPrompt =
    typeof startup?.draftPrompt === 'string' && startup.draftPrompt.trim()
      ? startup.draftPrompt
      : null
  const needsDraftPaste =
    draftPrompt !== null &&
    !draftAgentConfig?.draftPromptFlag &&
    !draftAgentConfig?.draftPromptEnvVar
  let hasClaimedDraftPaste = false
  let hasAttemptedDraftPaste = false

  const clearConfig = (): void => {
    useAppStore.getState().clearAgentLaunchConfig(options.paneKey)
  }

  if (startup?.launchConfig) {
    useAppStore.getState().registerAgentLaunchConfig(options.paneKey, startup.launchConfig, {
      agentType: startup.launchAgent ?? startup.initialAgentStatus?.agent,
      ...(launchToken ? { launchToken } : {}),
      tabId: options.tabId,
      leafId: options.leafId
    })
  } else if (startup) {
    clearConfig()
  }

  return {
    launchToken,
    draftPrompt,
    draftReadySignal:
      draftAgentConfig?.draftPasteReadySignal ?? 'render-quiet-after-bracketed-paste',
    expectedProcess: draftAgentConfig?.expectedProcess ?? null,
    claimDraftPaste: () => {
      if (!needsDraftPaste || launchToken === undefined) {
        return false
      }
      if (!hasClaimedDraftPaste) {
        hasClaimedDraftPaste = beginAgentStartupDeliveryAttempt({
          worktreeId: options.worktreeId,
          tabId: options.tabId,
          launchToken
        })
      }
      return hasClaimedDraftPaste
    },
    markDraftPasteAttempted: () => {
      hasAttemptedDraftPaste = true
    },
    releaseUnattemptedDraftPaste: () => {
      if (!hasClaimedDraftPaste || hasAttemptedDraftPaste || launchToken === undefined) {
        return
      }
      releaseAgentStartupDeliveryAttempt({
        worktreeId: options.worktreeId,
        tabId: options.tabId,
        launchToken
      })
      hasClaimedDraftPaste = false
    },
    registerEffectiveConfig: (launchConfig, metadata) => {
      if (!launchConfig) {
        if (metadata?.launchAgent) {
          useAppStore.getState().setPaneForegroundAgent(options.paneKey, {
            agent: metadata.launchAgent,
            shellForeground: false
          })
        }
        return
      }
      const persistedAgent = recognizeAgentProcessFromCommandLine(launchConfig.agentCommand)?.agent
      useAppStore.getState().registerAgentLaunchConfig(options.paneKey, launchConfig, {
        agentType:
          metadata?.launchAgent ??
          startup?.launchAgent ??
          startup?.initialAgentStatus?.agent ??
          persistedAgent,
        ...((metadata?.launchToken ?? launchToken)
          ? { launchToken: metadata?.launchToken ?? launchToken }
          : {}),
        tabId: options.tabId,
        leafId: options.leafId
      })
    },
    clearConfig
  }
}
