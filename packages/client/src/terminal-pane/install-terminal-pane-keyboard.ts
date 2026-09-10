import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { IDisposable } from '@xterm/xterm'

import {
  armTerminalImePendingCandidateKeyRelease,
  clearTerminalImePendingCandidateKeyRelease,
  createTerminalImePendingCandidateKeyReleases,
  shouldApplyTerminalImePendingCandidateKeyRelease
} from './ime/candidate-key-release-guard'
import { installTerminalImeCompositionTracker } from './ime/composition-tracker'
import { DISABLED_MAC_NATIVE_TEXT_INPUT_SOURCE_FEATURES } from './ime/input-source'
import { installTerminalImeLinuxCandidateState } from './ime/linux-candidate-state'
import { installTerminalImeNativeTextForwarder } from './ime/native-text-forwarder'
import type { PaneManager } from './pane-manager/pane-manager'
import { markTerminalPinnedViewport } from './pane-manager/terminal-scroll-intent'
import { syncTerminalScrollIntentSoon } from './pane-manager/terminal-scroll-intent-settle'
import type { ManagedPane } from './pane-manager/types'
import { resolveTerminalJisYenInput } from './terminal-jis-yen-input'
import { resetTerminalKeyboardProtocolAfterInterrupt } from './terminal-pane-lifecycle-decisions'
import {
  shouldBypassXtermKeyboardEvent,
  shouldHandleTerminalInterruptKeyboardEvent,
  shouldPreventDefaultTerminalImeCandidateKey,
  shouldSuppressTerminalImeKeyboardEvent,
  shouldSuppressTerminalInterruptKeyup,
  shouldSuppressTerminalModifierKeyboardEvent,
  TERMINAL_INTERRUPT_INPUT
} from './xterm-bypass-policy'

type InstallTerminalPaneKeyboardInput = {
  imeCompositionDisposables: Map<number, IDisposable>
  imeNativeTextForwarderDisposables: Map<number, IDisposable>
  managerRef: React.RefObject<PaneManager | null>
  pane: ManagedPane
  settingsRef: React.RefObject<GlobalSettings | null | undefined>
}

export function installTerminalPaneKeyboard({
  imeCompositionDisposables,
  imeNativeTextForwarderDisposables,
  managerRef,
  pane,
  settingsRef
}: InstallTerminalPaneKeyboardInput): void {
  let hasPendingInterruptKeyup = false
  const pendingCandidateKeyReleases = createTerminalImePendingCandidateKeyReleases()
  const isMac = navigator.userAgent.includes('Mac')
  const isLinux =
    !isMac && navigator.userAgent.includes('Linux') && !/Android|CrOS/.test(navigator.userAgent)
  const linuxCandidateState = isLinux
    ? installTerminalImeLinuxCandidateState(pane.terminal.element)
    : null
  const compositionTracker = installTerminalImeCompositionTracker(pane.terminal.element)
  imeCompositionDisposables.set(pane.id, {
    dispose: () => {
      compositionTracker.dispose()
      linuxCandidateState?.dispose()
    }
  })
  const nativeTextForwarder = isMac
    ? installTerminalImeNativeTextForwarder({
        terminalElement: pane.terminal.element,
        isComposing: () => compositionTracker.isActive(),
        sendInput: (data) => pane.terminal.input(data),
        getInputSourceFeatures: () => DISABLED_MAC_NATIVE_TEXT_INPUT_SOURCE_FEATURES
      })
    : { claimKeyEvent: () => false, dispose: () => undefined }
  imeNativeTextForwarderDisposables.set(pane.id, nativeTextForwarder)

  pane.terminal.attachCustomKeyEventHandler((event) => {
    const linuxClassification = linuxCandidateState?.classifyKeyboardEvent(event) ?? {
      candidateDigitGuardActive: false
    }
    const observeLinuxEvent = (): void => {
      linuxCandidateState?.observeKeyboardEvent(event, linuxClassification)
    }
    const now = Date.now()
    const pendingCandidateRelease = shouldApplyTerminalImePendingCandidateKeyRelease(
      event,
      pendingCandidateKeyReleases,
      now
    )
    const imeOptions = {
      compositionActive: compositionTracker.isActive(),
      candidateKeyGuardActive:
        compositionTracker.isCandidateKeyGuardActive() || pendingCandidateRelease,
      pendingCandidateKeyReleaseActive: pendingCandidateRelease,
      linuxOrphanCandidateDigitGuardActive: linuxClassification.candidateDigitGuardActive,
      isMac,
      isLinux
    }
    if (shouldSuppressTerminalImeKeyboardEvent(event, imeOptions)) {
      clearTerminalImePendingCandidateKeyRelease(pendingCandidateKeyReleases, event)
      if (shouldPreventDefaultTerminalImeCandidateKey(event, imeOptions)) {
        event.preventDefault()
        armTerminalImePendingCandidateKeyRelease(pendingCandidateKeyReleases, event, now)
      }
      observeLinuxEvent()
      return false
    }
    clearTerminalImePendingCandidateKeyRelease(pendingCandidateKeyReleases, event)
    if (hasPendingInterruptKeyup && shouldSuppressTerminalInterruptKeyup(event)) {
      hasPendingInterruptKeyup = false
      observeLinuxEvent()
      return false
    }
    if (
      shouldHandleTerminalInterruptKeyboardEvent(event, {
        isMac,
        hasSelection: pane.terminal.hasSelection()
      })
    ) {
      if (event.type === 'keydown') {
        hasPendingInterruptKeyup = true
        pane.terminal.input(TERMINAL_INTERRUPT_INPUT)
        resetTerminalKeyboardProtocolAfterInterrupt(pane.terminal)
      } else {
        hasPendingInterruptKeyup = false
      }
      observeLinuxEvent()
      return false
    }
    if (shouldSuppressTerminalModifierKeyboardEvent(event)) {
      observeLinuxEvent()
      return false
    }
    const jisYenInput = resolveTerminalJisYenInput(event, {
      enabled: settingsRef.current?.terminalJISYenToBackslash === true,
      isMac
    })
    if (jisYenInput) {
      if (jisYenInput.type === 'input') {
        pane.terminal.input(jisYenInput.data)
      }
      observeLinuxEvent()
      return false
    }
    if (event.type === 'keydown') {
      const shouldSync = (): boolean =>
        managerRef.current?.getPanes().some((candidate) => candidate.terminal === pane.terminal) ===
        true
      if (event.key === 'PageUp' || event.key === 'Home') {
        markTerminalPinnedViewport(pane.terminal)
        syncTerminalScrollIntentSoon(pane.terminal, {
          preservePinnedAtBottom: true,
          shouldSync
        })
      } else if (event.key === 'PageDown' || event.key === 'End') {
        syncTerminalScrollIntentSoon(pane.terminal, { shouldSync })
      }
    }
    if (nativeTextForwarder.claimKeyEvent(event)) {
      observeLinuxEvent()
      return false
    }
    const shouldBypass = shouldBypassXtermKeyboardEvent(event, {
      isMac,
      hasSelection: pane.terminal.hasSelection()
    })
    observeLinuxEvent()
    return !shouldBypass
  })
}
