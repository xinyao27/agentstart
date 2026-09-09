import { POST_PASTE_SUBMIT_DELAY_MS } from '~renderer/agent/paste-submit-delay'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { openRuntimeTerminalClient } from '~renderer/runtime/terminal-protocol'
import {
  BRACKETED_PASTE_END,
  BRACKETED_PASTE_START,
  sanitizeTerminalPasteText
} from '~renderer/terminal/bracketed-paste'
import { getSettingsForWorktreeRuntimeOwner } from '~renderer/worktree/runtime-owner'

import type { ActiveAgentNotesSendResult } from './active-agent-note-send-result'
import {
  findActiveRuntimeTerminal,
  getActiveTerminalNoteTarget,
  type ActiveTerminalNoteTarget
} from './active-agent-note-target'
import {
  ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS,
  getTerminalAgentSendReadiness,
  isRuntimeTerminalNotWritable,
  isRuntimeTerminalUnavailable,
  isRuntimeTimeout
} from './active-agent-terminal-send-readiness'

export {
  getActiveAgentNoteTarget,
  getActiveAgentRuntimeProbeDescriptor,
  getActiveTerminalNoteTarget,
  probeActiveAgentNoteTarget,
  type ActiveTerminalNoteTarget
} from './active-agent-note-target'
export {
  activeAgentNotesSendFailureMessage,
  type ActiveAgentNotesSendResult,
  type ActiveAgentNotesSendStatus
} from './active-agent-note-send-result'

const ACTIVE_AGENT_SEND_TIMEOUT_MS = 8000
const YIRU_DESKTOP_TERMINAL_CLIENT = { id: 'yiru-desktop', type: 'desktop' as const }

export async function sendNotesToActiveAgentSession({
  state,
  worktreeId,
  prompt,
  noteTarget: explicitNoteTarget,
  timeoutMs
}: {
  state: Parameters<typeof getActiveTerminalNoteTarget>[0]
  worktreeId: string
  prompt: string
  noteTarget?: ActiveTerminalNoteTarget
  timeoutMs?: number
}): Promise<ActiveAgentNotesSendResult> {
  const trimmedPrompt = prompt.trim()
  if (!trimmedPrompt) {
    return { status: 'empty' }
  }

  // Why: an explicit target lets the notes dropdown address ANY running agent of
  // the worktree, not just the focused pane; omitted, fall back to the focused
  // active terminal so existing callers keep their behavior. Routing below still
  // resolves the worktree's owner host, so explicit targets stay SSH/remote-correct.
  const noteTarget = explicitNoteTarget ?? getActiveTerminalNoteTarget(state, worktreeId)
  if (!noteTarget) {
    return { status: 'no-active-terminal' }
  }
  // Route by the worktree's owner host so the agent terminal is found and driven
  // on the host that actually runs it, not on the focused runtime.
  const runtimeTarget = getActiveRuntimeTarget(
    getSettingsForWorktreeRuntimeOwner(state, worktreeId)
  )
  const terminal = await findActiveRuntimeTerminal(
    runtimeTarget,
    worktreeId,
    noteTarget,
    ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS
  )
  if (!terminal) {
    return { status: 'no-active-terminal' }
  }

  if (explicitNoteTarget) {
    return await sendPromptToExplicitAgentTarget(runtimeTarget, terminal.handle, trimmedPrompt)
  }

  const effectiveTimeoutMs = timeoutMs ?? ACTIVE_AGENT_SEND_TIMEOUT_MS
  const initialAgentStatus = await getTerminalAgentSendReadiness(runtimeTarget, terminal.handle, {
    allowLegacyFallback: true
  })
  if (initialAgentStatus.status !== 'sendable') {
    return { status: initialAgentStatus.status }
  }

  try {
    const { wait } = await (
      await openRuntimeTerminalClient(runtimeTarget)
    ).wait(
      { terminal: terminal.handle, for: 'tui-idle', timeoutMs: effectiveTimeoutMs },
      { timeoutMs: effectiveTimeoutMs + 5000 }
    )
    if (wait.status !== 'running') {
      return { status: 'no-active-terminal' }
    }
    if (wait.blockedReason) {
      return { status: 'permission' }
    }
    if (!wait.satisfied) {
      return { status: 'not-ready' }
    }
  } catch (error) {
    if (isRuntimeTerminalUnavailable(error)) {
      return { status: 'no-active-terminal' }
    }
    if (isRuntimeTimeout(error)) {
      return { status: 'not-ready' }
    }
    throw error
  }

  const finalAgentStatus = await getTerminalAgentSendReadiness(runtimeTarget, terminal.handle, {
    allowLegacyFallback: true
  })
  if (finalAgentStatus.status !== 'sendable') {
    return { status: finalAgentStatus.status }
  }

  if (finalAgentStatus.supportsGuardedSend) {
    return await sendPromptWithGuardedPasteAndEnter(runtimeTarget, terminal.handle, trimmedPrompt, {
      allowLegacyFallback: false
    })
  }

  // Why: protocol-compatible older SSH runtimes do not know the guarded send
  // option. They already passed terminal.wait + legacy isRunningAgent checks,
  // so preserve the old active-focused send path for remote compatibility.
  return await sendPromptWithLegacyCombinedSend(runtimeTarget, terminal.handle, trimmedPrompt)
}

async function sendPromptWithLegacyCombinedSend(
  runtimeTarget: ReturnType<typeof getActiveRuntimeTarget>,
  terminalHandle: string,
  prompt: string
): Promise<ActiveAgentNotesSendResult> {
  try {
    const { send } = await (
      await openRuntimeTerminalClient(runtimeTarget)
    ).send(
      {
        terminal: terminalHandle,
        text: prompt,
        enter: true,
        client: YIRU_DESKTOP_TERMINAL_CLIENT
      },
      { timeoutMs: ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS }
    )
    return send.accepted ? { status: 'sent' } : { status: 'not-writable' }
  } catch (error) {
    if (isRuntimeTerminalUnavailable(error)) {
      return { status: 'no-active-terminal' }
    }
    if (isRuntimeTerminalNotWritable(error)) {
      return { status: 'not-writable' }
    }
    throw error
  }
}

async function sendPromptWithGuardedPasteAndEnter(
  runtimeTarget: ReturnType<typeof getActiveRuntimeTarget>,
  terminalHandle: string,
  prompt: string,
  options: { allowLegacyFallback: boolean }
): Promise<ActiveAgentNotesSendResult> {
  const initialAgentStatus = await getTerminalAgentSendReadiness(runtimeTarget, terminalHandle, {
    allowLegacyFallback: options.allowLegacyFallback
  })
  if (initialAgentStatus.status !== 'sendable') {
    return { status: initialAgentStatus.status }
  }

  const pastePayload = `${BRACKETED_PASTE_START}${sanitizeTerminalPasteText(prompt)}${BRACKETED_PASTE_END}`
  try {
    const { send } = await (
      await openRuntimeTerminalClient(runtimeTarget)
    ).send(
      {
        terminal: terminalHandle,
        text: pastePayload,
        requireAgentStatus: 'sendable',
        client: YIRU_DESKTOP_TERMINAL_CLIENT
      },
      { timeoutMs: ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS }
    )
    if (!send.accepted) {
      if (send.refusedReason === 'permission') {
        return { status: 'permission' }
      }
      if (send.refusedReason === 'no-agent') {
        return { status: 'no-agent' }
      }
      return { status: 'not-writable' }
    }
  } catch (error) {
    if (isRuntimeTerminalUnavailable(error)) {
      return { status: 'no-active-terminal' }
    }
    if (isRuntimeTerminalNotWritable(error)) {
      return { status: 'not-writable' }
    }
    throw error
  }

  await new Promise<void>((resolve) => setTimeout(resolve, POST_PASTE_SUBMIT_DELAY_MS))

  try {
    const submitAgentStatus = await getTerminalAgentSendReadiness(runtimeTarget, terminalHandle, {
      allowLegacyFallback: options.allowLegacyFallback
    })
    if (submitAgentStatus.status !== 'sendable') {
      return { status: 'partial-submit-failed' }
    }
  } catch (error) {
    if (isRuntimeTerminalUnavailable(error)) {
      return { status: 'partial-submit-failed' }
    }
    throw error
  }

  try {
    const { send } = await (
      await openRuntimeTerminalClient(runtimeTarget)
    ).send(
      {
        terminal: terminalHandle,
        enter: true,
        requireAgentStatus: 'sendable',
        client: YIRU_DESKTOP_TERMINAL_CLIENT
      },
      { timeoutMs: ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS }
    )
    return send.accepted ? { status: 'sent' } : { status: 'partial-submit-failed' }
  } catch (error) {
    if (isRuntimeTerminalUnavailable(error) || isRuntimeTerminalNotWritable(error)) {
      return { status: 'partial-submit-failed' }
    }
    throw error
  }
}

async function sendPromptToExplicitAgentTarget(
  runtimeTarget: ReturnType<typeof getActiveRuntimeTarget>,
  terminalHandle: string,
  prompt: string
): Promise<ActiveAgentNotesSendResult> {
  return await sendPromptWithGuardedPasteAndEnter(runtimeTarget, terminalHandle, prompt, {
    allowLegacyFallback: false
  })
}
