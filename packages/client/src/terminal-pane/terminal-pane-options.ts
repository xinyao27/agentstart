import {
  DEFAULT_TERMINAL_FONT_SIZE,
  resolveTerminalFontWeights
} from '@yiru/protocol/terminal/font-settings'
import { normalizeTerminalLineHeight } from '@yiru/protocol/terminal/line-height'
import { normalizeDesktopTerminalScrollbackRows } from '@yiru/protocol/terminal/scrollback-policy'

import { getConnectionId } from '../runtime/connection-context'
import { getRenderingHostSnapshot } from '../runtime/shell-platform-client'
import { useAppStore } from '../store/state'
import { getExecutionHostIdForWorktree } from '../worktree/runtime-owner'
import { buildFontFamily } from './layout-serialization'
import {
  normalizeTerminalFastScrollSensitivity,
  normalizeTerminalScrollSensitivity,
  resolveTerminalCursorInactiveStyle
} from './pane-manager/pane-terminal-options'
import { buildTerminalKeyboardProtocolOptions } from './pane-manager/terminal-keyboard-protocol'
import type { PaneManagerOptions } from './pane-manager/types'
import { buildWindowsPtyCompatibilityOptions } from './pane-manager/windows-pty-compatibility'
import { resolvePaneKeyboardProtocolAgent } from './terminal-keyboard-protocol-pane-agent'
import type { UseTerminalPaneLifecycleDeps } from './terminal-pane-lifecycle-types'

type TerminalPaneOptionsInput = {
  effectiveMacOptionAsAltRef: UseTerminalPaneLifecycleDeps['effectiveMacOptionAsAltRef']
  getStartup: () => UseTerminalPaneLifecycleDeps['startup']
  settingsRef: UseTerminalPaneLifecycleDeps['settingsRef']
  startupCwd: string
  tabId: string
  worktreeId: string
}

export function createTerminalPaneOptions({
  effectiveMacOptionAsAltRef,
  getStartup,
  settingsRef,
  startupCwd,
  tabId,
  worktreeId
}: TerminalPaneOptionsInput): NonNullable<PaneManagerOptions['terminalOptions']> {
  return () => {
    const currentSettings = settingsRef.current
    const terminalFontWeights = resolveTerminalFontWeights(currentSettings?.terminalFontWeight)
    const cursorStyle = currentSettings?.terminalCursorStyle ?? 'block'
    const storeState = useAppStore.getState()
    const currentTab = storeState.tabsByWorktree[worktreeId]?.find(
      (candidate) => candidate.id === tabId
    )
    const platformInfo = getRenderingHostSnapshot()
    const knownTuiAgent = resolvePaneKeyboardProtocolAgent(getStartup(), currentTab?.launchAgent)
    const ptyBackendContext = {
      userAgent: navigator.userAgent,
      osRelease: platformInfo?.osRelease,
      connectionId: getConnectionId(worktreeId),
      cwd: startupCwd,
      shellOverride: currentTab?.shellOverride,
      executionHostId: getExecutionHostIdForWorktree(storeState, worktreeId),
      tuiAgent: knownTuiAgent
    }

    return {
      ...buildWindowsPtyCompatibilityOptions(ptyBackendContext),
      ...buildTerminalKeyboardProtocolOptions(ptyBackendContext),
      fontSize: currentSettings?.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE,
      fontFamily: buildFontFamily(currentSettings?.terminalFontFamily ?? ''),
      fontWeight: terminalFontWeights.fontWeight,
      fontWeightBold: terminalFontWeights.fontWeightBold,
      scrollback: normalizeDesktopTerminalScrollbackRows(currentSettings?.terminalScrollbackRows),
      cursorStyle,
      cursorInactiveStyle: resolveTerminalCursorInactiveStyle(cursorStyle),
      cursorBlink: currentSettings?.terminalCursorBlink ?? true,
      scrollSensitivity: normalizeTerminalScrollSensitivity(
        currentSettings?.terminalScrollSensitivity
      ),
      fastScrollSensitivity: normalizeTerminalFastScrollSensitivity(
        currentSettings?.terminalFastScrollSensitivity
      ),
      macOptionIsMeta: effectiveMacOptionAsAltRef.current === 'true',
      lineHeight: normalizeTerminalLineHeight(currentSettings?.terminalLineHeight),
      wordSeparator: currentSettings?.terminalWordSeparator
    }
  }
}
