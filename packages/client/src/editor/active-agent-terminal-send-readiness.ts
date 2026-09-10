import { RuntimeProtocolError, StatusCode } from '@agentstart/protocol'
import type { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { isRuntimeTerminalGoneError } from '~renderer/runtime/terminal-gone-error'
import { openRuntimeTerminalClient } from '~renderer/runtime/terminal-protocol'

export const ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS = 15000

type TerminalAgentSendReadiness =
  | 'sendable'
  | 'no-active-terminal'
  | 'no-agent'
  | 'permission'
  | 'status-unavailable'

type TerminalAgentSendReadinessResult = {
  status: TerminalAgentSendReadiness
  supportsGuardedSend: boolean
}

export async function getTerminalAgentSendReadiness(
  runtimeTarget: ReturnType<typeof getActiveRuntimeTarget>,
  terminalHandle: string,
  options: { allowLegacyFallback: boolean }
): Promise<TerminalAgentSendReadinessResult> {
  try {
    const { agentStatus } = await (
      await openRuntimeTerminalClient(runtimeTarget)
    ).agentStatus(terminalHandle, { timeoutMs: ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS })
    if (!agentStatus.isRunningAgent) {
      return { status: 'no-agent', supportsGuardedSend: true }
    }
    if (agentStatus.status === 'permission') {
      return { status: 'permission', supportsGuardedSend: true }
    }
    return { status: 'sendable', supportsGuardedSend: true }
  } catch (error) {
    if (error instanceof RuntimeProtocolError && error.code === StatusCode.UNIMPLEMENTED) {
      if (!options.allowLegacyFallback) {
        // Why: selected-target sends are immediate; without terminal.agentStatus
        // an older remote runtime cannot rule out permission/action prompts.
        return { status: 'status-unavailable', supportsGuardedSend: false }
      }
      // Why: active-focused sends still wait for tui-idle, preserving old
      // runtime compatibility without immediate selected-target risk.
      return {
        status: await getLegacyTerminalAgentSendStatus(runtimeTarget, terminalHandle),
        supportsGuardedSend: false
      }
    }
    if (isRuntimeTerminalUnavailable(error)) {
      return { status: 'no-active-terminal', supportsGuardedSend: false }
    }
    throw error
  }
}

async function getLegacyTerminalAgentSendStatus(
  runtimeTarget: ReturnType<typeof getActiveRuntimeTarget>,
  terminalHandle: string
): Promise<TerminalAgentSendReadiness> {
  try {
    const { isRunningAgent } = await (
      await openRuntimeTerminalClient(runtimeTarget)
    ).isRunningAgent(terminalHandle, { timeoutMs: ACTIVE_AGENT_SEND_RPC_TIMEOUT_MS })
    return isRunningAgent ? 'sendable' : 'no-agent'
  } catch (error) {
    if (isRuntimeTerminalUnavailable(error)) {
      return 'no-active-terminal'
    }
    throw error
  }
}

export function isRuntimeTimeout(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('timeout')
}

export function isRuntimeTerminalUnavailable(error: unknown): boolean {
  return isRuntimeTerminalGoneError(error)
}

export function isRuntimeTerminalNotWritable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('terminal_not_writable')
}
