import type { IDisposable } from '@xterm/xterm'
import type { StartupCommandDelivery } from '@yiru/protocol/agent/launch/startup-delivery'
import type { SleepingAgentLaunchConfig } from '@yiru/protocol/agent/session-resume'
import type { ParsedAgentStatusPayload } from '@yiru/protocol/agent/status-records'
import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import type { SetupSplitDirection } from '@yiru/protocol/settings/workspace-preferences'
import type { EventProps } from '@yiru/protocol/telemetry/events/catalog'
import type { TerminalLayoutSnapshot } from '@yiru/protocol/workspace/session'
import type { TerminalKittyKeyboardModeTracker } from '~renderer/terminal-pane/emulator/kitty-keyboard'

import type { EffectiveMacOptionAsAlt } from '../keyboard-layout/detect-option-as-alt'
import type {
  PaneExternalDropHandler,
  PaneExternalDropResolver,
  PaneManager
} from './pane-manager/pane-manager'
import type { PtyTransport } from './pty/transport-types'
import type { ReplayingPanesRef } from './replay-guard'
import type { PaneCwdMap } from './resolve-split-cwd'
import type { TerminalPaneSnapshot } from './use-terminal-pane-local-state'

export type UseTerminalPaneLifecycleDeps = {
  tabId: string
  worktreeId: string
  cwd?: string
  startup?: {
    command: string
    delivery?: 'terminal-paste'
    startupCommandDelivery?: StartupCommandDelivery
    env?: Record<string, string>
    envToDelete?: string[]
    launchConfig?: SleepingAgentLaunchConfig
    launchToken?: string
    launchAgent?: TuiAgent
    draftPrompt?: string
    initialAgentStatus?: { agent: TuiAgent; prompt: string }
    telemetry?: EventProps<'agent_started'>
    showSessionRestoredBanner?: boolean
    waitForSetupSplitDirection?: SetupSplitDirection
  } | null
  setupSplit?: {
    command: string
    env?: Record<string, string>
    direction: SetupSplitDirection
  } | null
  isActive: boolean
  isVisible: boolean
  systemPrefersDark: boolean
  settings: GlobalSettings | null | undefined
  settingsRef: React.RefObject<GlobalSettings | null | undefined>
  effectiveMacOptionAsAlt: EffectiveMacOptionAsAlt
  effectiveMacOptionAsAltRef: React.RefObject<EffectiveMacOptionAsAlt>
  initialLayoutRef: React.RefObject<TerminalLayoutSnapshot>
  managerRef: React.RefObject<PaneManager | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  expandedStyleSnapshotRef: React.MutableRefObject<
    Map<HTMLElement, { display: string; flex: string }>
  >
  paneFontSizesRef: React.RefObject<Map<number, number>>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  paneCwdRef: React.RefObject<PaneCwdMap>
  paneMode2031Ref: React.RefObject<Map<number, boolean>>
  paneKittyKeyboardModesRef: React.RefObject<Map<number, TerminalKittyKeyboardModeTracker>>
  paneLastThemeModeRef: React.RefObject<Map<number, 'dark' | 'light'>>
  panePtyBindingsRef: React.RefObject<Map<number, IDisposable>>
  replayingPanesRef: ReplayingPanesRef
  isActiveRef: React.RefObject<boolean>
  isVisibleRef: React.RefObject<boolean>
  onPtyExitRef: React.RefObject<(ptyId: string) => void>
  onPtyErrorRef?: React.RefObject<(paneId: number, message: string) => void>
  clearTabPtyId: (tabId: string, ptyId: string) => void
  clearCodexRestartNotice: (ptyId: string) => void
  consumePendingCodexPaneRestart: (ptyId: string) => boolean
  consumeSuppressedPtyExit: (ptyId: string) => boolean
  pendingCodexPaneRestartIds: Record<string, true>
  suppressPtyExit: (ptyId: string) => void
  updateTabTitle: (tabId: string, title: string) => void
  setRuntimePaneTitle: (tabId: string, paneId: number, title: string) => void
  clearRuntimePaneTitle: (tabId: string, paneId: number) => void
  updateTabPtyId: (tabId: string, ptyId: string) => void
  markWorktreeUnread: (worktreeId: string) => void
  markTerminalTabUnread: (tabId: string) => void
  markTerminalPaneUnread: (paneKey: string) => void
  clearWorktreeUnread: (worktreeId: string) => void
  clearTerminalTabUnread: (tabId: string) => void
  clearTerminalPaneUnread: (paneKey: string) => void
  onShowSessionRestoredBanner: (paneId: number) => void
  dispatchNotification: (event: {
    source: 'terminal-bell' | 'agent-task-complete'
    terminalTitle?: string
    paneKey?: string
    agentStatusSnapshot?: ParsedAgentStatusPayload
    suppressOsNotification?: boolean
  }) => void
  setCacheTimerStartedAt: (key: string, ts: number | null) => void
  syncPanePtyLayoutBinding: (paneId: number, ptyId: string | null) => void
  clearExitedPanePtyLayoutBinding: (paneId: number, exitedPtyId: string) => void
  setTabPaneExpanded: (tabId: string, expanded: boolean) => void
  setTabCanExpandPane: (tabId: string, canExpand: boolean) => void
  setExpandedPane: (paneId: number | null) => void
  syncExpandedLayout: () => void
  persistLayoutSnapshot: () => void
  setPaneTitles: React.Dispatch<React.SetStateAction<Record<number, string>>>
  paneTitlesRef: React.RefObject<Record<number, string>>
  setRenamingPaneId: React.Dispatch<React.SetStateAction<number | null>>
  setPaneCount: React.Dispatch<React.SetStateAction<number>>
  setPaneLayoutRevision: React.Dispatch<React.SetStateAction<number>>
  setPaneSnapshot: React.Dispatch<React.SetStateAction<TerminalPaneSnapshot>>
  resolveExternalPaneDropTarget?: PaneExternalDropResolver
  onExternalPaneDrop?: PaneExternalDropHandler
}
