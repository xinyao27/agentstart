// ─── Parse-deferred ACK crediting ───────────────────────────────────
// Why: ACKing at dispatcher enqueue made main's 512KB in-flight window mean
// "bytes RECEIVED", not "bytes PARSED" — under flood the renderer's write
// queue grew unbounded behind instant ACKs, main saw no backpressure, crossed
// its pending cap, and dropped output (rc.7.perf DSR timeouts). Crediting is
// now deferred to the output scheduler's consume point, so in-flight becomes
// true parse backpressure and main's producer flow control pauses the shell
// instead of dropping.

type DeferredPtyAckCredit = {
  credit: () => void
  claimed: boolean
  credited: boolean
}

let currentDeliveryCredit: DeferredPtyAckCredit | null = null

function creditDeferredPtyAck(credit: DeferredPtyAckCredit): void {
  // Why fire-once: split queue chunks and discard paths may both touch the
  // same delivery; the invariant is exactly one credit per delivered chunk.
  if (credit.credited) {
    return
  }
  credit.credited = true
  credit.credit()
}

export function deliverPtyDataWithDeferredCredit(
  creditCallback: () => void,
  deliver: () => void
): void {
  const credit: DeferredPtyAckCredit = {
    credit: creditCallback,
    claimed: false,
    credited: false
  }
  currentDeliveryCredit = credit
  try {
    deliver()
  } finally {
    currentDeliveryCredit = null
    if (!credit.claimed) {
      creditDeferredPtyAck(credit)
    }
  }
}

/** Claims the in-progress delivery's credit for the output scheduler. Returns
 *  a fire-once callback, or null when outside a delivery or already claimed
 *  (only the FIRST scheduler write of a delivery carries the credit). */
export function takeCurrentPtyDeliveryAckCredit(): (() => void) | null {
  const credit = currentDeliveryCredit
  if (!credit || credit.claimed) {
    return null
  }
  credit.claimed = true
  return () => creditDeferredPtyAck(credit)
}
