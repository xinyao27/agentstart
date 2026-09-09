import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { runtimePtyEnvironmentId, runtimePtyHandle } from '@yiru/protocol/terminal-identity'
import { makePaneKey } from '@yiru/protocol/terminal/pane-identity'
import { isTerminalInputTooLargeWithDeferredMeasurement } from '~renderer/terminal-pane/pty/input-chunks'

import { useAppStore } from '../store/state'
import { getActiveRuntimeTarget, type RuntimeClientTarget } from './rpc-client'
import { openRuntimeTerminalClient } from './terminal-protocol'

export type RuntimeTerminalProcessInspection = {
  foregroundProcess: string | null
  hasChildProcesses: boolean
}

type TerminalTarget = RuntimeClientTarget

const DESKTOP_RUNTIME_CLIENT = { id: 'yiru-desktop', type: 'desktop' } as const

function isRuntimePtyInputTooLarge(data: string): boolean | Promise<boolean> {
  return isTerminalInputTooLargeWithDeferredMeasurement(data)
}

function isTerminalGoneError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('terminal_handle_stale') ||
    message.includes('terminal_exited') ||
    message.includes('terminal_gone') ||
    message.includes('no_connected_pty')
  )
}

function targetForRuntimePty(
  ptyId: string,
  settings:
    | Pick<GlobalSettings, 'activeRuntimeEnvironmentId'>
    | null
    | undefined = useAppStore.getState().settings
): TerminalTarget {
  const environmentId = runtimePtyEnvironmentId(ptyId)
  return environmentId ? { kind: 'environment', environmentId } : getActiveRuntimeTarget(settings)
}

export async function hasRuntimeTerminal(ptyId: string): Promise<boolean> {
  const terminal = runtimePtyHandle(ptyId)
  if (!terminal) {
    return false
  }
  try {
    await (await openRuntimeTerminalClient(targetForRuntimePty(ptyId))).show(terminal)
    return true
  } catch (error) {
    if (isTerminalGoneError(error)) {
      return false
    }
    throw error
  }
}

export async function closeRuntimeTerminal(ptyId: string): Promise<void> {
  const terminal = runtimePtyHandle(ptyId)
  if (!terminal) {
    return
  }
  await (await openRuntimeTerminalClient(targetForRuntimePty(ptyId))).close(terminal)
}

export async function clearRuntimeTerminalBuffer(ptyId: string): Promise<void> {
  const terminal = runtimePtyHandle(ptyId)
  if (!terminal) {
    return
  }
  await (await openRuntimeTerminalClient(targetForRuntimePty(ptyId))).clearBuffer(terminal)
}

export async function listRuntimeTerminalSessions() {
  return (await openRuntimeTerminalClient({ kind: 'local' })).listManagedSessions()
}

export async function killRuntimeTerminalSession(sessionId: string): Promise<boolean> {
  const result = await (await openRuntimeTerminalClient({ kind: 'local' })).killManaged(sessionId)
  return result.success
}

export function recordRuntimeTerminalInputForPtyId(ptyId: string, timestamp = Date.now()): void {
  const state = useAppStore.getState()
  for (const [tabId, layout] of Object.entries(state.terminalLayoutsByTabId)) {
    for (const [leafId, leafPtyId] of Object.entries(layout?.ptyIdsByLeafId ?? {})) {
      if (leafPtyId !== ptyId) {
        continue
      }
      try {
        // Why: paired/runtime sends can bypass xterm.onData, so hibernation
        // needs the same user-input marker from the PTY-id route.
        state.recordTerminalInput(makePaneKey(tabId, leafId), timestamp)
      } catch {
        // Ignore malformed legacy layout data; the planner will stay
        // conservative when a live PTY cannot be matched to an eligible pane.
      }
      return
    }
  }
}

export async function inspectRuntimeTerminalProcess(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  ptyId: string
): Promise<RuntimeTerminalProcessInspection> {
  const target = targetForRuntimePty(ptyId, settings)
  const terminal = runtimePtyHandle(ptyId)
  if (!terminal) {
    return { foregroundProcess: null, hasChildProcesses: false }
  }

  try {
    const result = await (
      await openRuntimeTerminalClient(target)
    ).inspectProcess(terminal, { timeoutMs: 15_000 })
    return result.process
  } catch (error) {
    if (isTerminalGoneError(error)) {
      return { foregroundProcess: null, hasChildProcesses: false }
    }
    throw error
  }
}

export function sendRuntimePtyInput(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  ptyId: string,
  data: string
): boolean {
  const tooLarge = isRuntimePtyInputTooLarge(data)
  if (tooLarge === true) {
    return false
  }
  if (tooLarge !== false) {
    // Why: this is a fire-and-forget path, so accepted paste-sized input must
    // yield before validation and then dispatch without blocking the renderer.
    void tooLarge
      .then((resolvedTooLarge) => {
        if (!resolvedTooLarge) {
          sendRuntimePtyInputWithinLimit(settings, ptyId, data)
        }
      })
      .catch(() => {})
    return true
  }
  return sendRuntimePtyInputWithinLimit(settings, ptyId, data)
}

function sendRuntimePtyInputWithinLimit(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  ptyId: string,
  data: string
): boolean {
  const target = targetForRuntimePty(ptyId, settings)
  const terminal = runtimePtyHandle(ptyId)
  if (!terminal) {
    return false
  }

  void openRuntimeTerminalClient(target)
    .then((client) =>
      client.send({ terminal, text: data, client: DESKTOP_RUNTIME_CLIENT }, { timeoutMs: 15_000 })
    )
    .then((result) => {
      if (result.send.accepted === true) {
        recordRuntimeTerminalInputForPtyId(ptyId)
      }
    })
    .catch(() => {
      // Why: web session snapshots can retire a remote handle while xterm still
      // flushes a final input event. The next host snapshot will reattach.
    })
  return true
}

export async function sendRuntimePtyInputVerified(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  ptyId: string,
  data: string
): Promise<boolean> {
  const tooLarge = isRuntimePtyInputTooLarge(data)
  if (typeof tooLarge === 'boolean' ? tooLarge : await tooLarge) {
    return false
  }
  const target = targetForRuntimePty(ptyId, settings)
  const terminal = runtimePtyHandle(ptyId)
  if (!terminal) {
    return false
  }

  try {
    const result = await (
      await openRuntimeTerminalClient(target)
    ).send({ terminal, text: data, client: DESKTOP_RUNTIME_CLIENT }, { timeoutMs: 15_000 })
    if (result.send.accepted === true) {
      recordRuntimeTerminalInputForPtyId(ptyId)
      return true
    }
    return false
  } catch (error) {
    if (isTerminalGoneError(error)) {
      return false
    }
    throw error
  }
}
