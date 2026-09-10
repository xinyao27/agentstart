// Why this module exists: a pane's xterm write pipeline can die while its PTY
// stays alive — a synchronous throw escaping an unguarded write callback wedges
// WriteBuffer (issue #2836), and write() on a disposed terminal silently drops
// its completion callback (verified against vendored xterm 6.1.0-beta.287). In
// both states every later write queues forever: output stops rendering,
// delivery ack credits leak, and the pane becomes a fossil the user can only
// cure by reloading the window. Detection here is probe-certified (mirroring
// replay-guard.ts): a stalled completion triggers an empty probe write; xterm
// parses in FIFO order, so a probe that also never completes proves the
// pipeline is dead rather than slow. Certification notifies a per-terminal
// handler (registered by the pane's PTY connection) that requests pane
// recovery — a remount that rebuilds the xterm and reattaches the live PTY.

type WriteTarget = {
  write(data: string, callback?: () => void): void
}

export type UndeliverableWriteReason = 'write-stalled' | 'replay-wedged'

type UndeliverableWriteHandler = (reason: UndeliverableWriteReason) => void

const handlersByTerminal = new WeakMap<object, UndeliverableWriteHandler>()
const certifiedDeadReasonsByTerminal = new WeakMap<object, UndeliverableWriteReason>()
const deliveredDeadTerminals = new WeakSet<object>()
// Why: wedge verdicts must distinguish "dead" from "alive but behind". A
// generation avoids same-millisecond misses and wall-clock adjustments while
// keeping the completion hot path constant-time and terminal-scoped.
const parseProgressGenerationByTerminal = new WeakMap<object, number>()

/** Report one parsed write completion for this terminal. */
export function recordTerminalParseProgress(terminal: object): void {
  const nextGeneration = (parseProgressGenerationByTerminal.get(terminal) ?? 0) + 1
  parseProgressGenerationByTerminal.set(terminal, nextGeneration)
}

/** Capture the current parse-progress generation for a later quiet-window check. */
export function captureTerminalParseProgressGeneration(terminal: object): number {
  return parseProgressGenerationByTerminal.get(terminal) ?? 0
}

/** Whether a write completion parsed after `generation` was captured. */
export function hasTerminalParseProgressSince(terminal: object, generation: number): boolean {
  return captureTerminalParseProgressGeneration(terminal) !== generation
}

type StallWatch = {
  timer: ReturnType<typeof setTimeout>
  onCertifiedDead?: () => void
}

const stallWatchByTerminal = new WeakMap<object, StallWatch>()

const WRITE_PIPELINE_STALL_CHECK_MS = 10_000

function certifyTerminalWritePipelineDead(terminal: object, expectedWatch?: StallWatch): void {
  const watch = stallWatchByTerminal.get(terminal)
  // Why: a real parse can settle and remove the watch before a stale probe
  // deadline runs. Only the watch that armed that deadline may certify.
  if (expectedWatch && watch !== expectedWatch) {
    return
  }
  if (watch) {
    stallWatchByTerminal.delete(terminal)
    try {
      watch.onCertifiedDead?.()
    } catch {
      // Why: discard can bottom out in a partial shellClient surface; recovery
      // notification must still run after cleanup fails.
    }
  }
  notifyUndeliverableWrite(terminal, 'write-stalled')
}

export function registerUndeliverableWriteHandler(
  terminal: object,
  handler: UndeliverableWriteHandler
): () => void {
  handlersByTerminal.set(terminal, handler)
  const certifiedReason = certifiedDeadReasonsByTerminal.get(terminal)
  if (certifiedReason !== undefined) {
    // Why: layout replay can certify a newly-created xterm before its PTY
    // connection installs recovery. Deliver after connection construction,
    // while rejecting a handler already replaced or disposed in that gap.
    queueMicrotask(() => {
      if (handlersByTerminal.get(terminal) === handler) {
        deliverUndeliverableWrite(terminal, handler, certifiedReason)
      }
    })
  }
  return () => {
    if (handlersByTerminal.get(terminal) === handler) {
      handlersByTerminal.delete(terminal)
    }
  }
}

/** One notification per terminal instance: recovery replaces the xterm, so a
 *  second notification for the same object is always a duplicate. */
export function notifyUndeliverableWrite(
  terminal: object,
  reason: UndeliverableWriteReason
): boolean {
  if (certifiedDeadReasonsByTerminal.has(terminal)) {
    return false
  }
  certifiedDeadReasonsByTerminal.set(terminal, reason)
  const handler = handlersByTerminal.get(terminal)
  if (handler !== undefined) {
    deliverUndeliverableWrite(terminal, handler, reason)
  }
  return true
}

function deliverUndeliverableWrite(
  terminal: object,
  handler: UndeliverableWriteHandler,
  reason: UndeliverableWriteReason
): void {
  if (deliveredDeadTerminals.has(terminal)) {
    return
  }
  deliveredDeadTerminals.add(terminal)
  try {
    handler(reason)
  } catch {
    // Why: notify fires from timer and write-callback contexts where a throw
    // becomes an unhandled error; recovery is best-effort by contract (see
    // terminal-pane-recovery.ts).
  }
}

export function isTerminalWritePipelineCertifiedDead(terminal: object): boolean {
  return certifiedDeadReasonsByTerminal.has(terminal)
}

/**
 * Arm (or keep armed) the stall watch for a terminal that just had a write
 * issued. Cleared by settleTerminalWriteStallWatch from the write-completion
 * callback. If the completion never arrives, an empty probe write certifies
 * dead-vs-slow exactly like replay-guard.ts: probe completes → pipeline is
 * alive (slow parse), re-arm and keep waiting; probe silent for another
 * interval → dead, notify.
 */
export function armTerminalWriteStallWatch(
  terminal: WriteTarget,
  options: { onCertifiedDead?: () => void; stallCheckMs?: number } = {}
): void {
  if (stallWatchByTerminal.has(terminal) || certifiedDeadReasonsByTerminal.has(terminal)) {
    return
  }
  const stallCheckMs = options.stallCheckMs ?? WRITE_PIPELINE_STALL_CHECK_MS
  const watch: StallWatch = {
    onCertifiedDead: options.onCertifiedDead,
    timer: setTimeout(probeForStall, stallCheckMs)
  }
  const certifyDead = (): void => certifyTerminalWritePipelineDead(terminal, watch)
  function probeForStall(): void {
    if (stallWatchByTerminal.get(terminal) !== watch) {
      return
    }
    let probeParsed = false
    try {
      terminal.write('', () => {
        probeParsed = true
        // Why: replay guards share this terminal-scoped generation; even an
        // auxiliary FIFO probe proves the parser is alive and making progress.
        recordTerminalParseProgress(terminal)
        // Why: a parsed probe proves the pipeline is alive — the stalled
        // completion was just slow. Disarm; the next write re-arms.
        const current = stallWatchByTerminal.get(terminal)
        if (current === watch) {
          clearTimeout(current.timer)
          stallWatchByTerminal.delete(terminal)
        }
      })
    } catch {
      certifyDead()
      return
    }
    watch.timer = setTimeout(() => {
      if (!probeParsed) {
        certifyDead()
      }
    }, stallCheckMs)
  }
  stallWatchByTerminal.set(terminal, watch)
}

/** Cancel a pending watch without claiming that any bytes parsed. */
export function cancelTerminalWriteStallWatch(terminal: object): void {
  const watch = stallWatchByTerminal.get(terminal)
  if (!watch) {
    return
  }
  clearTimeout(watch.timer)
  stallWatchByTerminal.delete(terminal)
}

/** Write completed normally — the pipeline is healthy; drop any pending watch. */
export function settleTerminalWriteStallWatch(terminal: object): void {
  recordTerminalParseProgress(terminal)
  cancelTerminalWriteStallWatch(terminal)
}

/** A synchronous terminal.write failure proves the pipeline cannot accept the
 *  issued bytes. Recover immediately without reporting fake parse progress. */
export function failTerminalWriteStallWatch(terminal: object): void {
  certifyTerminalWritePipelineDead(terminal)
}
