const TERMINAL_INPUT_ACTIVITY_WRITE_INTERVAL_MS = 500

const GATE_PRUNE_SIZE = 256

type TerminalInputActivityEntries = readonly (readonly [string, number])[]

export type TerminalInputActivityCommit = {
  insert: (paneKey: string, timestamp: number) => void
  refreshExisting: (entries: TerminalInputActivityEntries) => void
}

const pendingByPaneKey = new Map<string, number>()
const lastWrittenByPaneKey = new Map<string, number>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let pendingCommit: TerminalInputActivityCommit | null = null

function pruneGate(now: number): void {
  if (lastWrittenByPaneKey.size <= GATE_PRUNE_SIZE) {
    return
  }
  for (const [paneKey, writtenAt] of lastWrittenByPaneKey) {
    if (
      now - writtenAt >= TERMINAL_INPUT_ACTIVITY_WRITE_INTERVAL_MS &&
      !pendingByPaneKey.has(paneKey)
    ) {
      lastWrittenByPaneKey.delete(paneKey)
    }
  }
}

function releaseTimerFromNodeEventLoop(timer: ReturnType<typeof setTimeout>): void {
  const candidate: unknown = timer
  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    'unref' in candidate &&
    typeof candidate.unref === 'function'
  ) {
    candidate.unref()
  }
}

// Why: xterm reports each keystroke, while the only persistent consumer uses
// minute-scale idle windows. Keep the leading edge and collapse the burst tail.
export function recordTerminalInputActivity(args: {
  paneKey: string
  timestamp: number
  forceWrite?: boolean
  commit: TerminalInputActivityCommit
}): void {
  const lastWrittenAt = lastWrittenByPaneKey.get(args.paneKey)
  if (
    args.forceWrite === true ||
    lastWrittenAt === undefined ||
    args.timestamp - lastWrittenAt >= TERMINAL_INPUT_ACTIVITY_WRITE_INTERVAL_MS
  ) {
    pendingByPaneKey.delete(args.paneKey)
    lastWrittenByPaneKey.set(args.paneKey, args.timestamp)
    pruneGate(args.timestamp)
    args.commit.insert(args.paneKey, args.timestamp)
    return
  }

  pendingByPaneKey.set(args.paneKey, args.timestamp)
  pendingCommit = args.commit
  if (flushTimer === null) {
    flushTimer = setTimeout(flushTerminalInputActivity, TERMINAL_INPUT_ACTIVITY_WRITE_INTERVAL_MS)
    releaseTimerFromNodeEventLoop(flushTimer)
  }
}

function flushTerminalInputActivity(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  const commit = pendingCommit
  pendingCommit = null
  if (!commit || pendingByPaneKey.size === 0) {
    pendingByPaneKey.clear()
    return
  }
  const entries = Array.from(pendingByPaneKey)
  pendingByPaneKey.clear()
  for (const [paneKey, timestamp] of entries) {
    lastWrittenByPaneKey.set(paneKey, timestamp)
  }
  commit.refreshExisting(entries)
}

export function readLastTerminalInputAt(
  stored: Readonly<Record<string, number | undefined>>,
  paneKey: string
): number | undefined {
  const storedAt = stored[paneKey]
  if (storedAt === undefined) {
    return undefined
  }
  const pendingAt = pendingByPaneKey.get(paneKey)
  return pendingAt !== undefined && pendingAt > storedAt ? pendingAt : storedAt
}

export function mergePendingTerminalInputActivity(
  stored: Record<string, number>
): Record<string, number> {
  let next: Record<string, number> | null = null
  for (const [paneKey, pendingAt] of pendingByPaneKey) {
    const storedAt = stored[paneKey]
    if (storedAt === undefined || storedAt >= pendingAt) {
      continue
    }
    next ??= { ...stored }
    next[paneKey] = pendingAt
  }
  return next ?? stored
}
