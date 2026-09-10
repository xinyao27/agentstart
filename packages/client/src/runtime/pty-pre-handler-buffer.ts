import type { PtyDataMeta } from './pty-data-meta'
type BufferedPreHandlerPtyData = {
  data: string
  bytes: number
  meta?: PtyDataMeta
}

type BufferedPreHandlerPtyState = {
  chunks: BufferedPreHandlerPtyData[]
  head: number
  bytes: number
}

const preHandlerPtyData = new Map<string, BufferedPreHandlerPtyState>()
const preHandlerPtyExit = new Map<string, number>()
const consumedPreHandlerPtyExits = new Map<string, true>()
const discardedPreHandlerPtyStates = new Map<string, ReturnType<typeof setTimeout>>()
const DISCARDED_PRE_HANDLER_PTY_STATE_TTL_MS = 60_000

const PRE_HANDLER_PTY_EXIT_MAX_PTYS = 64
const warnedLostHandlerPtyIds = new Set<string>()

// Why: primary handlers and pane-less parked owners have fully handled this
// exit. Keep a bounded tombstone so duplicate IPC exits cannot be replayed to
// a future mount or accumulate in the pre-handler map.
function consumePreHandlerPtyState(ptyId: string): void {
  clearPreHandlerPtyState(ptyId)
  consumedPreHandlerPtyExits.set(ptyId, true)
  if (consumedPreHandlerPtyExits.size > PRE_HANDLER_PTY_EXIT_MAX_PTYS) {
    const oldestPtyId = consumedPreHandlerPtyExits.keys().next().value
    if (typeof oldestPtyId === 'string') {
      consumedPreHandlerPtyExits.delete(oldestPtyId)
    }
  }
}

// Why: removed worktrees have no future pane consumer. Suppress both delayed
// kill data and exit until an explicit same-id reconnect establishes a new
// admission boundary.
export function discardPreHandlerPtyState(ptyId: string): void {
  consumePreHandlerPtyState(ptyId)
  const priorTimer = discardedPreHandlerPtyStates.get(ptyId)
  if (priorTimer) {
    clearTimeout(priorTimer)
  }
  // Why: a large worktree can remove more PTYs than the bounded data maps.
  // Time retention protects every delayed kill flush without permanent growth.
  const timer = setTimeout(
    () => discardedPreHandlerPtyStates.delete(ptyId),
    DISCARDED_PRE_HANDLER_PTY_STATE_TTL_MS
  )
  discardedPreHandlerPtyStates.set(ptyId, timer)
}

function clearPreHandlerPtyState(ptyId: string): void {
  preHandlerPtyData.delete(ptyId)
  preHandlerPtyExit.delete(ptyId)
  consumedPreHandlerPtyExits.delete(ptyId)
  const discardTimer = discardedPreHandlerPtyStates.get(ptyId)
  if (discardTimer) {
    clearTimeout(discardTimer)
  }
  discardedPreHandlerPtyStates.delete(ptyId)
  warnedLostHandlerPtyIds.delete(ptyId)
}
