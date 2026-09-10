import type { StartupCommandDelivery } from '@agentstart/protocol/agent/launch/startup-delivery'
import type { SleepingAgentLaunchConfig } from '@agentstart/protocol/agent/session-resume'
import type { ParsedAgentStatusPayload } from '@agentstart/protocol/agent/status-records'
import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { PtyDataMeta } from '~renderer/runtime/pty-data-meta'

export type PtyBufferSnapshot = {
  data: string
  cols: number
  rows: number
  seq?: number
  /** Lowest seq main could still deliver when the snapshot was taken (start
   *  of its pending renderer-delivery queue; equals `seq` when empty). Bytes
   *  are delivered once and in order, so a post-restore chunk at or below
   *  this seq can never be a duplicate the snapshot already covers. */
  pendingDeliveryStartSeq?: number
  source?: 'headless' | 'provider'
  /** True when the snapshot captures an alternate-screen TUI (Claude Code,
   *  vim). Restore must NOT clear xterm's buffer in that case — the TUI's
   *  scrollback lives in xterm and a clear destroys scroll-up after a tab
   *  return. Mirrors the attach-time guard in pty-transport.ts. */
  alternateScreen?: boolean
  /** Authoritative normal buffer paired with an alternate-screen frame. */
  scrollbackAnsi?: string
  /** Trailing incomplete escape sequence main's emulator ingested (a PTY read
   *  ended mid-escape). Must be written LAST — after post-replay resets, right
   *  before post-snapshot live chunks — so the continuation completes it
   *  exactly as live instead of rendering literal (Bug E / #7329). */
  pendingEscapeTailAnsi?: string
}

type LocalPtySessionMetadata = {
  cwd?: string
  shellOverride?: string
}

export type PtyConnectResult = {
  id: string
  isReattach?: boolean
  /** The requested session exited while it had no primary pane handler. Its
   *  buffered final data/exit were delivered, so callers must not fresh-spawn. */
  exitedBeforeAttach?: boolean
  launchAgent?: TuiAgent
  launchConfig?: SleepingAgentLaunchConfig
  snapshot?: string
  snapshotCols?: number
  snapshotRows?: number
  isAlternateScreen?: boolean
  sessionExpired?: boolean
  coldRestore?: { scrollback: string; cwd: string }
  replay?: string
  startupCwdFallback?: { kind: 'worktree'; cwd: string }
  /** Trailing partial escape the daemon emulator held mid-parse; the reattach
   *  replay writes it LAST (after the reset) so a racing live continuation
   *  completes it instead of rendering literally (#7329). */
  pendingEscapeTailAnsi?: string
}

type PtyCallbacks = {
  onConnect?: () => void
  onDisconnect?: () => void
  onData?: (data: string, meta?: PtyDataMeta) => void
  onReplayData?: (
    data: string,
    meta?: {
      clearBeforeReplay?: boolean
      pendingEscapeTailAnsi?: string
      snapshotCols?: number
      snapshotRows?: number
      onParsed?: () => void
    }
  ) => void
  onStatus?: (shell: string) => void
  onError?: (message: string, errors?: string[]) => void
  onExit?: (code: number) => void
}

export type PtyTransport = {
  connect: (options: {
    url: string
    cols?: number
    rows?: number
    sessionId?: string
    /** Hidden-at-spawn declaration (terminal-query-authority.md): no visible
     *  view will consume this PTY's bytes, so main marks it hidden BEFORE the
     *  first byte and the gate + model responder own spawn-time queries.
     *  Ignored by remote-runtime transports (not gate-markable). */
    initiallyHidden?: boolean
    command?: string
    env?: Record<string, string>
    envToDelete?: string[]
    launchConfig?: SleepingAgentLaunchConfig
    launchToken?: string
    launchAgent?: TuiAgent
    startupCommandDelivery?: StartupCommandDelivery
    callbacks: PtyCallbacks
  }) => void | Promise<void | string | PtyConnectResult>
  attach: (options: {
    existingPtyId: string
    cols?: number
    rows?: number
    isAlternateScreen?: boolean
    callbacks: PtyCallbacks
  }) => void
  disconnect: () => void
  sendInput: (data: string) => boolean
  // Why: latency-critical terminal query replies (CPR/DSR/DA/OSC color/pixel
  // size) must skip input coalescing — a querying program reads them in raw
  // mode with a short timeout, so a debounced reply lands on the shell prompt
  // and corrupts input (#7329). Local transports already write promptly, so
  // this is `sendInput` for them; the remote transport flushes pending input
  // (preserving order) and sends the reply immediately.
  sendInputImmediate: (data: string) => boolean
  sendInputAccepted?: (data: string) => Promise<boolean>
  claimViewport?: (cols: number, rows: number) => boolean
  resize: (
    cols: number,
    rows: number,
    meta?: {
      widthPx?: number
      heightPx?: number
      cellW?: number
      cellH?: number
      claim?: boolean
    }
  ) => boolean
  setDeliveryState?: (state: {
    visible: boolean
    interested: boolean
    priority: 'parked' | 'visible' | 'active'
  }) => boolean
  isConnected: () => boolean
  getPtyId: () => string | null
  getConnectionId?: () => string | null | undefined
  /** The runtime captured by this transport; current worktree settings may
   * have changed since the terminal was created. */
  getRuntimeEnvironmentId?: () => string | null
  getLocalSessionMetadata?: () => LocalPtySessionMetadata | null
  /** Drop cross-chunk parser carries after a model-restore gap. */
  resetCrossChunkParserState?: () => void
  serializeBuffer?: (opts?: { scrollbackRows?: number }) => Promise<PtyBufferSnapshot | null>
  preserve?: () => void
  detach?: () => void
  destroy?: () => void | Promise<void>
}

export type RuntimePtyTransportOptions = {
  cwd?: string
  cwdFallback?: 'worktree'
  env?: Record<string, string>
  envToDelete?: string[]
  command?: string
  launchConfig?: SleepingAgentLaunchConfig
  launchToken?: string
  launchAgent?: TuiAgent
  startupCommandDelivery?: StartupCommandDelivery
  worktreeId?: string
  tabId?: string
  leafId?: string
  activate?: boolean
  onPtyExit?: (ptyId: string) => void
  onPtySpawn?: (ptyId: string) => void
  onAgentStatus?: (payload: ParsedAgentStatusPayload) => void
}
