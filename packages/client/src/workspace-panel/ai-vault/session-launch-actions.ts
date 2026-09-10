import type { AiVaultAgent } from '@agentstart/protocol/ai-vault/providers'
import { parseWorkspaceKey } from '@agentstart/protocol/workspace/identity'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import { useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import type { AgentSessionContinuationRequest } from '~renderer/terminal-pane/agent/session-continuation'
import {
  canResumeAiVaultSessionOnTarget,
  getAiVaultResumeWorkspaceExecutionHostId,
  getAiVaultResumeWorkspaceTargetStatus
} from '~renderer/workspace-panel/ai-vault/resume-target'
import { launchAiVaultSessionInNewTab } from '~renderer/workspace-panel/ai-vault/session-launch'
import type { AiVaultSession } from '~renderer/workspace-panel/ai-vault/session/record'
import {
  activateAndRevealFolderWorkspace,
  activateAndRevealWorktree
} from '~renderer/worktree/activation'
import { findWorktreeById } from '~renderer/worktree/state/types'

import {
  buildAiVaultResumeCopyCommandForWorktree,
  buildAiVaultResumeStartupForWorktree,
  type AiVaultResumeStartup
} from './resume-command'
import { prepareAiVaultSessionContinuation } from './session-continuation'
import {
  isKnownAiVaultResumeWorkspaceTarget,
  type AiVaultSessionResumeTargetState
} from './session-resume'
import { agentLabel } from './session/filter'

export function useAiVaultSessionLaunchActions({
  activeWorktree,
  activeWorktreeId,
  targetState,
  agentCmdOverrides
}: {
  activeWorktree: Worktree | null
  activeWorktreeId: string | null
  targetState: AiVaultSessionResumeTargetState
  agentCmdOverrides?: Partial<Record<AiVaultAgent, string | null>>
}): {
  buildResumeStartup: (session: AiVaultSession, worktreeId?: string | null) => AiVaultResumeStartup
  copyResumeCommand: (session: AiVaultSession, worktreeId?: string | null) => Promise<void>
  handleResume: (session: AiVaultSession, targetWorktreeId?: string) => void
  handleContinueInNewSession: (session: AiVaultSession, targetWorktreeId: string) => void
  continuationRequest: AgentSessionContinuationRequest | null
  handleContinuationDialogOpenChange: (open: boolean) => void
} {
  const [continuationRequest, setContinuationRequest] =
    useState<AgentSessionContinuationRequest | null>(null)
  const buildResumeCommand = (session: AiVaultSession, worktreeId?: string | null): string =>
    buildAiVaultResumeCopyCommandForWorktree({
      state: useAppStore.getState(),
      worktreeId: worktreeId ?? activeWorktreeId ?? activeWorktree?.id ?? null,
      session,
      commandOverride: agentCmdOverrides?.[session.agent]
    })

  const buildResumeStartup = (session: AiVaultSession, worktreeId?: string | null) =>
    buildAiVaultResumeStartupForWorktree({
      state: useAppStore.getState(),
      worktreeId: worktreeId ?? activeWorktreeId ?? activeWorktree?.id ?? null,
      session,
      commandOverride: agentCmdOverrides?.[session.agent]
    })

  const copyResumeCommand = async (
    session: AiVaultSession,
    worktreeId?: string | null
  ): Promise<void> => {
    await shellClient.ui.writeClipboardText(buildResumeCommand(session, worktreeId))
    toast.success(
      translate(
        'auto.components.right.sidebar.AiVaultPanel.resumeCommandCopied',
        'Resume command copied'
      )
    )
  }

  const handleResume = (session: AiVaultSession, targetWorktreeId?: string): void => {
    const targetId = resolveAiVaultSessionLaunchTargetOrNotify({
      sessionFilePath: session.filePath,
      sessionExecutionHostId: session.executionHostId,
      activeWorktreeId: activeWorktreeId ?? activeWorktree?.id ?? null,
      targetWorktreeId,
      targetState
    })
    if (!targetId) {
      return
    }

    const launchResult = launchAiVaultSessionInNewTab({
      agent: session.agent,
      worktreeId: targetId.worktreeId,
      ...buildResumeStartup(session, targetId.worktreeId)
    })
    const showQueuedToast = (): void => {
      toast.success(
        translate(
          'auto.components.right.sidebar.AiVaultPanel.agentSessionQueued',
          '{{value0}} session queued',
          { value0: agentLabel(session.agent) }
        )
      )
    }
    if (launchResult.tabId === null) {
      void launchResult.runtimeLaunch.then((created) => {
        if (!created) {
          toast.error(
            translate(
              'auto.lib.launch.agent.in.new.tab.11cce5cc77',
              'Could not launch {{value0}} in a new terminal.',
              { value0: agentLabel(session.agent) }
            )
          )
          return
        }
        showQueuedToast()
      })
      return
    }
    if (useAppStore.getState().activeWorktreeId !== targetId.worktreeId) {
      activateAiVaultResumeWorkspace(targetId.worktreeId)
    }
    showQueuedToast()
  }

  const handleContinueInNewSession = (session: AiVaultSession, targetWorktreeId: string): void => {
    const targetId = resolveAiVaultSessionLaunchTargetOrNotify({
      sessionFilePath: session.filePath,
      sessionExecutionHostId: session.executionHostId,
      activeWorktreeId: activeWorktreeId ?? activeWorktree?.id ?? null,
      targetWorktreeId,
      targetState
    })
    if (!targetId) {
      return
    }

    const targetWorkspacePath = resolveAiVaultTargetWorkspacePath(targetState, targetId.worktreeId)
    if (!targetWorkspacePath) {
      toast.error(
        translate(
          'auto.components.right.sidebar.AiVaultPanel.openWorkspaceBeforeResuming',
          'Open a workspace before resuming a session.'
        )
      )
      return
    }
    setContinuationRequest(
      prepareAiVaultSessionContinuation({
        session,
        targetWorktreeId: targetId.worktreeId,
        targetWorkspacePath
      })
    )
  }

  const handleContinuationDialogOpenChange = (open: boolean): void => {
    if (!open) {
      setContinuationRequest(null)
    }
  }

  return {
    buildResumeStartup,
    copyResumeCommand,
    handleResume,
    handleContinueInNewSession,
    continuationRequest,
    handleContinuationDialogOpenChange
  }
}

function resolveAiVaultTargetWorkspacePath(
  state: AiVaultSessionResumeTargetState,
  workspaceId: string
): string | null {
  const scope = parseWorkspaceKey(workspaceId)
  if (scope?.type === 'folder') {
    return (
      state.folderWorkspaces.find((workspace) => workspace.id === scope.folderWorkspaceId)
        ?.folderPath ?? null
    )
  }
  const worktreeId = scope?.type === 'worktree' ? scope.worktreeId : workspaceId
  return findWorktreeById(state.worktreesByRepo, worktreeId)?.path ?? null
}

type AiVaultSessionLaunchTarget =
  | { status: 'missing' }
  | {
      status: 'unsupported'
      targetStatus: ReturnType<typeof getAiVaultResumeWorkspaceTargetStatus>
    }
  | { status: 'ready'; worktreeId: string }

function resolveAiVaultSessionLaunchTarget(args: {
  sessionFilePath: string | null
  sessionExecutionHostId?: AiVaultSession['executionHostId'] | null
  activeWorktreeId: string | null
  targetWorktreeId?: string
  targetState: AiVaultSessionResumeTargetState
}): AiVaultSessionLaunchTarget {
  const targetWorktreeId = args.targetWorktreeId ?? args.activeWorktreeId
  if (
    !targetWorktreeId ||
    !isKnownAiVaultResumeWorkspaceTarget(args.targetState, targetWorktreeId)
  ) {
    return { status: 'missing' }
  }

  const targetStatus = getAiVaultResumeWorkspaceTargetStatus(args.targetState, targetWorktreeId)
  const targetExecutionHostId = getAiVaultResumeWorkspaceExecutionHostId(
    args.targetState,
    targetWorktreeId
  )
  if (
    !canResumeAiVaultSessionOnTarget({
      sessionExecutionHostId: args.sessionExecutionHostId,
      targetStatus,
      targetExecutionHostId
    })
  ) {
    return { status: 'unsupported', targetStatus }
  }

  return { status: 'ready', worktreeId: targetWorktreeId }
}

function resolveAiVaultSessionLaunchTargetOrNotify(
  args: Parameters<typeof resolveAiVaultSessionLaunchTarget>[0]
): Extract<AiVaultSessionLaunchTarget, { status: 'ready' }> | null {
  const target = resolveAiVaultSessionLaunchTarget(args)
  if (target.status === 'missing') {
    toast.error(
      translate(
        'auto.components.right.sidebar.AiVaultPanel.openWorkspaceBeforeResuming',
        'Open a workspace before resuming a session.'
      )
    )
    return null
  }
  if (target.status === 'unsupported') {
    toast.error(aiVaultResumeUnsupportedMessage(target.targetStatus))
    return null
  }
  return target
}

function aiVaultResumeUnsupportedMessage(
  targetStatus: ReturnType<typeof getAiVaultResumeWorkspaceTargetStatus>
): string {
  // Why: local and runtime targets can both be valid generally; this branch
  // means the session's recorded host does not match the selected workspace.
  if (targetStatus === 'local' || targetStatus === 'runtime') {
    return translate(
      'auto.components.right.sidebar.AiVaultPanel.sessionHostMismatchUnsupported',
      'This session belongs to a different host. Open a workspace on the same host to resume it.'
    )
  }
  return translate(
    'auto.components.right.sidebar.AiVaultPanel.openSupportedWorkspace',
    'Open a workspace before resuming a session.'
  )
}

function activateAiVaultResumeWorkspace(workspaceId: string): void {
  const workspaceScope = parseWorkspaceKey(workspaceId)
  if (workspaceScope?.type === 'folder') {
    activateAndRevealFolderWorkspace(workspaceScope.folderWorkspaceId)
    return
  }
  activateAndRevealWorktree(workspaceId)
}
