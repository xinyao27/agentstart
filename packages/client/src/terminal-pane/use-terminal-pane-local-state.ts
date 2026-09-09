import type { IDisposable } from '@xterm/xterm'
import { useLayoutEffect, useRef, useState } from 'react'
import type { TerminalKittyKeyboardModeTracker } from '~renderer/terminal-pane/emulator/kitty-keyboard'

import { useDaemonActions } from '../daemon-actions/use-actions'
import { isTerminalSessionStateSaveFailure } from '../terminal/session-state-save-failure'
import { isTerminalZeroDimensionsDiagnostic } from '../terminal/zero-dimensions-diagnostic'
import type { AgentSessionContinuationRequest } from './agent/session-continuation'
import type { SearchState } from './keyboard-handlers'
import type { ManagedPane, PaneManager } from './pane-manager/pane-manager'
import type { PtyTransport } from './pty/transport-types'
import type { PreparedAgentSessionFork } from './terminal-agent-session-fork'
import { reportTerminalPaneError } from './terminal-error-reporting'
import { useTerminalMobileFit } from './use-terminal-mobile-fit'

type TerminalPaneLocalStateInput = {
  isActive: boolean
  isVisible: boolean
  isWorktreeActive: boolean
}

export type TerminalPaneSnapshot = {
  activePane: ManagedPane | null
  panes: ManagedPane[]
}

export function useTerminalPaneLocalState({
  isActive,
  isVisible,
  isWorktreeActive
}: TerminalPaneLocalStateInput) {
  const containerRef = useRef<HTMLDivElement>(null)
  const managerRef = useRef<PaneManager | null>(null)
  const paneFontSizesRef = useRef<Map<number, number>>(new Map())
  const expandedPaneIdRef = useRef<number | null>(null)
  const expandedStyleSnapshotRef = useRef<Map<HTMLElement, { display: string; flex: string }>>(
    new Map()
  )
  const pendingPaneSizeRefreshFrameIdsRef = useRef<number[]>([])
  const paneTransportsRef = useRef<Map<number, PtyTransport>>(new Map())
  const paneCwdRef = useRef<Map<number, { cwd: string; confirmed: boolean }>>(new Map())
  const paneMode2031Ref = useRef<Map<number, boolean>>(new Map())
  const paneKittyKeyboardModesRef = useRef<Map<number, TerminalKittyKeyboardModeTracker>>(new Map())
  const paneLastThemeModeRef = useRef<Map<number, 'dark' | 'light'>>(new Map())
  const panePtyBindingsRef = useRef<Map<number, IDisposable>>(new Map())
  const replayingPanesRef = useRef<Map<number, number>>(new Map())
  const isActiveRef = useRef(isActive)
  const isRendererVisible = isVisible && isWorktreeActive
  const isVisibleRef = useRef(isRendererVisible)

  const [expandedPaneId, setExpandedPaneId] = useState<number | null>(null)
  const [paneCount, setPaneCount] = useState(0)
  const [paneLayoutRevision, setPaneLayoutRevision] = useState(0)
  const [paneSnapshot, setPaneSnapshot] = useState<TerminalPaneSnapshot>({
    activePane: null,
    panes: []
  })
  const [searchOpen, setSearchOpen] = useState(false)
  const searchOpenRef = useRef(false)
  const searchStateRef = useRef<SearchState>({ query: '', caseSensitive: false, regex: false })
  const [agentSessionFork, setAgentSessionFork] = useState<PreparedAgentSessionFork | null>(null)
  const [agentSessionContinuation, setAgentSessionContinuation] =
    useState<AgentSessionContinuationRequest | null>(null)
  const [sessionStateSaveFailureOpen, setSessionStateSaveFailureOpen] = useState(false)
  const daemonActions = useDaemonActions()

  const [paneTitles, setPaneTitles] = useState<Record<number, string>>({})
  const paneTitlesRef = useRef<Record<number, string>>({})
  useLayoutEffect(() => {
    isActiveRef.current = isActive
    isVisibleRef.current = isRendererVisible
    searchOpenRef.current = searchOpen
    paneTitlesRef.current = paneTitles
  }, [isActive, isRendererVisible, paneTitles, searchOpen])
  const removedTitleLeafIdsRef = useRef<Set<string>>(new Set())
  const clearedScrollbackLeafIdsRef = useRef<Set<string>>(new Set())
  const onPtyErrorRef = useRef((_paneId: number, message: string) => {
    if (isTerminalSessionStateSaveFailure(message)) {
      setSessionStateSaveFailureOpen(true)
    } else if (!isTerminalZeroDimensionsDiagnostic(message)) {
      reportTerminalPaneError(message, 'terminal-pty')
    }
  })
  const { panePtyIds, refreshMobileFitState } = useTerminalMobileFit({
    managerRef,
    paneTransportsRef
  })

  return {
    agentSessionContinuation,
    agentSessionFork,
    clearedScrollbackLeafIdsRef,
    containerRef,
    daemonActions,
    expandedPaneId,
    expandedPaneIdRef,
    expandedStyleSnapshotRef,
    isActiveRef,
    isRendererVisible,
    isVisibleRef,
    managerRef,
    onPtyErrorRef,
    paneCount,
    paneCwdRef,
    paneFontSizesRef,
    paneKittyKeyboardModesRef,
    paneLastThemeModeRef,
    paneLayoutRevision,
    paneMode2031Ref,
    paneSnapshot,
    panePtyBindingsRef,
    panePtyIds,
    paneTitles,
    paneTitlesRef,
    paneTransportsRef,
    pendingPaneSizeRefreshFrameIdsRef,
    refreshMobileFitState,
    removedTitleLeafIdsRef,
    replayingPanesRef,
    searchOpen,
    searchOpenRef,
    searchStateRef,
    sessionStateSaveFailureOpen,
    setAgentSessionContinuation,
    setAgentSessionFork,
    setExpandedPaneId,
    setPaneCount,
    setPaneLayoutRevision,
    setPaneSnapshot,
    setPaneTitles,
    setSearchOpen,
    setSessionStateSaveFailureOpen
  }
}
