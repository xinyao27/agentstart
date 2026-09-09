import { agentPhaseFromStatus } from '@yiru/protocol/agent/phase'
import type { LaunchSource } from '@yiru/protocol/telemetry/events/foundations'
import React from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { AgentIcon } from '~renderer/agent/catalog'
import { agentKindForAgentType } from '~renderer/agent/status'
import { agentTypeToIconAgent } from '~renderer/agent/status'
import { AgentStateDot, agentStateLabel, type AgentDotState } from '~renderer/agent/status-dot'
import { formatAgentTypeLabel } from '~renderer/agent/title/type-label'
import type { DashboardAgentRow as DashboardAgentRowData } from '~renderer/dashboard/use-dashboard-data'
import { useNow } from '~renderer/dashboard/use-now'
import {
  activeAgentNotesSendFailureMessage,
  sendNotesToActiveAgentSession,
  type ActiveAgentNotesSendResult
} from '~renderer/editor/active-agent-note-send'
import {
  deriveNotesSendAgentTargets,
  type NotesSendAgentTarget
} from '~renderer/editor/notes-send-agent-targets'
import { translate } from '~renderer/i18n/i18n'
import { useWorktreeAgentRows } from '~renderer/sidebar/use-worktree-agent-rows'
import { useAppStore } from '~renderer/store/state'
import { focusTerminalTabSurface } from '~renderer/tab-bar/focus-terminal-surface'
import { QuickLaunchAgentMenuItems } from '~renderer/tab-bar/quick-launch-button'
import { track } from '~renderer/telemetry/client'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '~renderer/ui/dropdown-menu'

import { selectLivePtyIdsForWorktree } from '../sidebar/worktree-card/status-inputs'

type OrderedSendTarget = {
  target: NotesSendAgentTarget
  agent: DashboardAgentRowData | null
}

export function ReviewNotesSendMenuContent({
  worktreeId,
  groupId,
  prompt,
  promptDelivery = 'submit-after-ready',
  launchSource = 'notes_send',
  onPromptDelivered
}: {
  worktreeId: string
  groupId: string
  prompt: string
  promptDelivery?: 'auto-submit' | 'draft' | 'submit-after-ready'
  launchSource?: LaunchSource
  onPromptDelivered?: () => void
}): React.JSX.Element {
  const hasPrompt = prompt.trim().length > 0

  // Why: enumerate every running agent of the worktree so the user can target
  // any of them — not only the focused pane. Derive from store slices in a memo
  // to avoid the new-array identity churn of selecting the function result.
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
  const terminalLayoutsByTabId = useAppStore((s) => s.terminalLayoutsByTabId)
  const ptyIdsByTabId = useAppStore(useShallow((s) => selectLivePtyIdsForWorktree(s, worktreeId)))
  const runtimePaneTitlesByTabId = useAppStore((s) => s.runtimePaneTitlesByTabId)
  const agentStatusEpoch = useAppStore((s) => s.agentStatusEpoch)
  const agentRows = useWorktreeAgentRows(worktreeId)
  const now = useNow(30_000)
  const sendTargets = (() => {
    void agentStatusEpoch
    return deriveNotesSendAgentTargets(
      {
        agentStatusByPaneKey,
        tabsByWorktree,
        terminalLayoutsByTabId,
        ptyIdsByTabId,
        runtimePaneTitlesByTabId
      },
      worktreeId
    )
  })()
  const orderedSendTargets = (() => orderSendTargetsByWorktreeAgentRows(sendTargets, agentRows))()

  const runNotesSend = (
    send: () => Promise<ActiveAgentNotesSendResult>,
    onSent: () => void,
    options: { explicitTarget?: boolean } = {}
  ) => {
    const pending = toast.loading(
      translate('auto.components.editor.ReviewNotesSendMenuContent.50f7e753ea', 'Sending notes...')
    )

    void send()
      .then((result) => {
        if (result.status === 'sent') {
          onSent()
          toast.success(
            translate('auto.components.editor.ReviewNotesSendMenuContent.bb9c69a0c9', 'Notes sent.')
          )
          return
        }

        toast.message(
          activeAgentNotesSendFailureMessage(result.status, {
            explicitTarget: options.explicitTarget
          })
        )
      })
      .catch((error) => {
        console.error('Failed to send notes:', error)
        toast.error(
          translate(
            'auto.components.editor.ReviewNotesSendMenuContent.f5096c6e4e',
            'Could not send notes.'
          )
        )
      })
      .finally(() => {
        toast.dismiss(pending)
      })
  }

  const sendToAgentTarget = (target: NotesSendAgentTarget) => {
    if (!hasPrompt || target.status !== 'eligible') {
      return
    }

    const currentEligibility = resolveCurrentSendTargetEligibility(target, worktreeId)
    if (currentEligibility.status !== 'eligible') {
      toast.message(currentEligibility.disabledReason)
      return
    }

    runNotesSend(
      () =>
        sendNotesToActiveAgentSession({
          state: useAppStore.getState(),
          worktreeId,
          prompt,
          noteTarget: { tabId: target.tabId, leafId: target.leafId }
        }),
      () => {
        onPromptDelivered?.()
        // Why: mirror the sidebar send-target telemetry so dropdown-routed
        // follow-up notes show up identically on `agent_prompt_sent`.
        track('agent_prompt_sent', {
          agent_kind: agentKindForAgentType(target.agentType),
          launch_source: launchSource,
          request_kind: 'followup'
        })
      },
      { explicitTarget: true }
    )
  }

  return (
    <>
      <DropdownMenuLabel>
        {translate('auto.components.editor.ReviewNotesSendMenuContent.03378aea75', 'Send notes to')}
      </DropdownMenuLabel>
      {orderedSendTargets.map(({ target, agent }) => (
        <AgentTargetMenuItem
          key={target.paneKey}
          target={target}
          agent={agent}
          now={now}
          disabled={!hasPrompt || target.status !== 'eligible'}
          onSend={sendToAgentTarget}
        />
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuLabel>
        {translate('auto.components.editor.ReviewNotesSendMenuContent.a49800405b', 'New agent')}
      </DropdownMenuLabel>
      <QuickLaunchAgentMenuItems
        worktreeId={worktreeId}
        groupId={groupId}
        onFocusTerminal={focusTerminalTabSurface}
        prompt={prompt}
        promptDelivery={promptDelivery}
        launchSource={launchSource}
        onPromptDelivered={onPromptDelivered}
      />
    </>
  )
}

function resolveCurrentSendTargetEligibility(
  target: NotesSendAgentTarget,
  worktreeId: string
): { status: 'eligible' } | { status: 'disabled'; disabledReason: string } {
  const state = useAppStore.getState()
  const currentTarget = deriveNotesSendAgentTargets(state, worktreeId).find(
    (candidate) => candidate.paneKey === target.paneKey
  )
  if (currentTarget) {
    return currentTarget.status === 'eligible'
      ? { status: 'eligible' }
      : {
          status: 'disabled',
          disabledReason: currentTarget.disabledReason ?? 'Terminal is no longer available'
        }
  }

  return { status: 'disabled', disabledReason: 'Terminal is no longer available' }
}

function AgentTargetMenuItem({
  target,
  agent,
  now,
  disabled,
  onSend
}: {
  target: NotesSendAgentTarget
  agent: DashboardAgentRowData | null
  now: number
  disabled: boolean
  onSend: (target: NotesSendAgentTarget) => void
}): React.JSX.Element {
  const tabTitle = target.tabTitle.trim()
  const state = asDotState(agent)
  const timeAgo = agent ? formatAgentRelativeTime(agent, now) : null
  const secondaryParts = [
    agentStateLabel(state),
    ...(timeAgo ? [timeAgo] : []),
    ...(tabTitle ? [tabTitle] : [])
  ]
  return (
    <DropdownMenuItem
      disabled={disabled}
      onClick={() => onSend(target)}
      // Why: surface the ineligibility reason (permission/stale/no-terminal) as a
      // hover tooltip rather than inline text, matching DashboardAgentRow's
      // title-attribute treatment of the same disabledReason.
      title={target.status === 'disabled' ? target.disabledReason : undefined}
      className="min-w-[240px] gap-2 px-2 py-1.5 text-[12px] leading-5 font-medium"
    >
      <AgentStateDot state={state} size="sm" className="shrink-0" />
      <AgentIcon agent={agentTypeToIconAgent(target.agentType ?? agent?.agentType)} size={14} />
      <span className="grid min-w-0 flex-1 text-left">
        <span className="truncate">
          {formatAgentTypeLabel(target.agentType ?? agent?.agentType)}
        </span>
        <span className="text-muted-foreground truncate text-[11px] font-normal">
          {secondaryParts.join(' · ')}
        </span>
      </span>
    </DropdownMenuItem>
  )
}

function orderSendTargetsByWorktreeAgentRows(
  sendTargets: NotesSendAgentTarget[],
  agentRows: DashboardAgentRowData[]
): OrderedSendTarget[] {
  const targetsByPaneKey = new Map(sendTargets.map((target) => [target.paneKey, target]))
  const usedPaneKeys = new Set<string>()
  const ordered: OrderedSendTarget[] = []

  for (const agent of agentRows) {
    const target = targetsByPaneKey.get(agent.paneKey)
    if (!target) {
      continue
    }
    ordered.push({ target: { ...target, agentType: agent.agentType }, agent })
    usedPaneKeys.add(target.paneKey)
  }

  for (const target of sendTargets) {
    if (!usedPaneKeys.has(target.paneKey)) {
      ordered.push({ target, agent: null })
    }
  }

  return ordered
}

function asDotState(agent: DashboardAgentRowData | null): AgentDotState {
  if (!agent || agent.state === 'idle') {
    return 'idle'
  }
  return agentPhaseFromStatus({ state: agent.state, toolName: agent.entry.toolName })
}

function formatAgentRelativeTime(agent: DashboardAgentRowData, now: number): string | null {
  const doneAt = lastEnteredDoneAt(agent)
  if (doneAt !== null) {
    return `${formatTimeAgo(doneAt, now)}`
  }
  const startedAt = agent.startedAt > 0 ? agent.startedAt : agent.entry.stateStartedAt
  return startedAt > 0 ? `${formatTimeAgo(startedAt, now)}` : null
}

function lastEnteredDoneAt(agent: DashboardAgentRowData): number | null {
  const entry = agent.entry
  if (entry.state === 'done') {
    return entry.stateStartedAt
  }
  for (let i = entry.stateHistory.length - 1; i >= 0; i--) {
    if (entry.stateHistory[i].state === 'done') {
      return entry.stateHistory[i].startedAt
    }
  }
  return null
}

function formatTimeAgo(ts: number, now: number): string {
  const delta = now - ts
  if (delta < 60_000) {
    return 'just now'
  }
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  return `${Math.floor(hours / 24)}d ago`
}
