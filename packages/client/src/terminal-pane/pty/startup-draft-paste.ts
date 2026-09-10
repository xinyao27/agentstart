import type { DraftPasteReadySignal } from '@agentstart/protocol/agent/launch/config'
import { isExpectedAgentProcess } from '@agentstart/protocol/agent/process/recognition'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { inspectRuntimeTerminalProcess } from '~renderer/runtime/terminal-inspection'
import { createDraftPasteReadyScanner } from '~renderer/terminal-pane/agent/draft-readiness-scanner'
import { getSettingsForWorktreeRuntimeOwner } from '~renderer/worktree/runtime-owner'

import { sendAgentDraftPasteContent } from '../agent/draft-paste-content'
import { writeTerminalPastePtyInput } from '../terminal-pty-paste-writer'
import type { PtyTransport } from './transport-types'

const STARTUP_DRAFT_PASTE_QUIET_MS = 1500
const STARTUP_DRAFT_PASTE_TIMEOUT_MS = 8000

type StartupDraftPasteOptions = {
  ownsPaste: boolean
  prompt: string | null
  readySignal: DraftPasteReadySignal
  expectedProcess: string | null
  worktreeId: string
  transport: PtyTransport
  getCurrentPtyId: () => string | null
  onAttempt: () => void
  onInputRecorded: () => void
}

export type StartupDraftPaste = {
  arm: () => void
  observe: (data: string) => void
  dispose: () => void
}

export function createStartupDraftPaste(options: StartupDraftPasteOptions): StartupDraftPaste {
  const scanner = options.ownsPaste ? createDraftPasteReadyScanner(options.readySignal) : null
  let isReadinessArmed = false
  let isSettled = !options.ownsPaste
  let isPasteInFlight = false
  let hasRecordedInput = false
  let quietTimer: ReturnType<typeof setTimeout> | null = null
  let hardTimer: ReturnType<typeof setTimeout> | null = null

  const clearTimers = (): void => {
    if (quietTimer !== null) {
      clearTimeout(quietTimer)
      quietTimer = null
    }
    if (hardTimer !== null) {
      clearTimeout(hardTimer)
      hardTimer = null
    }
  }

  const send = (): void => {
    if (!options.prompt || isSettled || isPasteInFlight || !isReadinessArmed) {
      return
    }
    const ptyId = options.getCurrentPtyId()
    if (!ptyId) {
      return
    }
    isPasteInFlight = true
    isSettled = true
    options.onAttempt()
    clearTimers()
    const settings = getSettingsForWorktreeRuntimeOwner(
      readProjectCatalogRuntimeState(),
      options.worktreeId
    )
    // Why: xterm focus reports share this transport queue. Bypassing it can
    // race CSI I against the draft on ConPTY and expose a literal `[I` prefix.
    void sendAgentDraftPasteContent(settings, ptyId, options.prompt, async (data) => {
      const accepted = await writeTerminalPastePtyInput(options.transport, data)
      if (accepted && !hasRecordedInput) {
        // Why: this write bypasses xterm's user-input signal; keep the draft
        // from being discarded by later hibernation.
        hasRecordedInput = true
        options.onInputRecorded()
      }
      return accepted
    })
      .catch(() => false)
      .finally(() => {
        isPasteInFlight = false
      })
  }

  const deliverIfAgentOwnsPty = async (): Promise<void> => {
    if (!options.expectedProcess || isSettled) {
      return
    }
    const ptyId = options.getCurrentPtyId()
    if (!ptyId) {
      return
    }
    const settings = getSettingsForWorktreeRuntimeOwner(
      readProjectCatalogRuntimeState(),
      options.worktreeId
    )
    try {
      const process = await inspectRuntimeTerminalProcess(settings, ptyId)
      const foreground = process.foregroundProcess?.toLowerCase() ?? ''
      if (
        options.getCurrentPtyId() === ptyId &&
        isExpectedAgentProcess(foreground, options.expectedProcess)
      ) {
        send()
      }
    } catch {
      // Best-effort fallback; the primary path is the PTY readiness marker.
    }
  }

  const armHardTimer = (): void => {
    if (!scanner || isSettled || hardTimer !== null) {
      return
    }
    hardTimer = setTimeout(() => {
      hardTimer = null
      void deliverIfAgentOwnsPty()
    }, STARTUP_DRAFT_PASTE_TIMEOUT_MS)
  }

  const armQuietTimer = (): void => {
    if (!scanner || isSettled) {
      return
    }
    if (quietTimer !== null) {
      clearTimeout(quietTimer)
    }
    quietTimer = setTimeout(() => {
      quietTimer = null
      send()
    }, STARTUP_DRAFT_PASTE_QUIET_MS)
  }

  const arm = (): void => {
    if (!scanner || isReadinessArmed) {
      return
    }
    isReadinessArmed = true
    armHardTimer()
  }

  return {
    arm,
    observe: (data) => {
      if (!scanner || !isReadinessArmed || isSettled) {
        return
      }
      const scanned = scanner.observe(data)
      if (scanned.ready) {
        send()
        return
      }
      if (scanned.armQuietTimer) {
        armQuietTimer()
      }
    },
    dispose: clearTimers
  }
}
