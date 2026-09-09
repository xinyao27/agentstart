import type { TerminalGitHubPRLink } from '~renderer/runtime/terminal-side-effect-client'
import type {
  TerminalSideEffectBatch,
  TerminalSideEffectFact
} from '~renderer/runtime/terminal-side-effect-client'
// Why: foreground panes and parked watchers share the Rust terminal fact stream;
// exactly one consumer per PTY prevents duplicate attention effects.
import { subscribeRendererTerminalSideEffects } from '~renderer/runtime/terminal-side-effect-client'

export type TerminalSideEffectFactConsumerCallbacks = {
  /** `meta.staleWorkingTitleClear` marks facts derived from the daemon's 3s
   *  stale-title timer — policy must clear title/cache state without
   *  scheduling task-complete notifications or unread attention. */
  onTitleChange?: (
    normalizedTitle: string,
    rawTitle: string,
    meta?: { staleWorkingTitleClear?: boolean }
  ) => void
  onBell?: () => void
  onAgentBecameIdle?: (title: string, meta?: { staleWorkingTitleClear?: boolean }) => void
  onAgentBecameWorking?: () => void
  onAgentExited?: () => void
  /** OSC 133;D — same policy hook the byte-mode commandLifecycle drove
   *  (stale agent-status row drop + interrupt-inference coordination). */
  onCommandFinished?: (bestEffortExitCode: number | null) => void
  onPrLink?: (link: TerminalGitHubPRLink) => void
  /** Command Code output scrape (no hooks): working seeds the status row;
   *  done is settle-checked by the pane policy before completing the turn. */
  onCommandCodeWorking?: (prompt: string) => void
  onCommandCodeDone?: (prompt: string) => void
  // Why: parked consumers receive facts without output bytes; the browser owns the theme reply.
  onMode2031Subscribe?: () => void
}

type ConsumerEntry = {
  callbacks: TerminalSideEffectFactConsumerCallbacks
  /** Output sequence of the last live title fact applied. Replay snapshots at
   *  or before this point are stale and must not regress the title state. */
  lastLiveTitleSeq: bigint | null
  epoch: bigint | null
}

const consumersByPtyId = new Map<string, ConsumerEntry>()
let channelUnsubscribe: (() => void) | null = null

function applyLiveFact(entry: ConsumerEntry, fact: TerminalSideEffectFact, seq: bigint): void {
  switch (fact.kind) {
    case 'title':
      entry.lastLiveTitleSeq = seq
      entry.callbacks.onTitleChange?.(
        fact.normalizedTitle,
        fact.rawTitle,
        fact.staleWorkingTitleClear ? { staleWorkingTitleClear: true } : undefined
      )
      return
    case 'bell':
      entry.callbacks.onBell?.()
      return
    case 'agent-working':
      entry.callbacks.onAgentBecameWorking?.()
      return
    case 'agent-idle':
      entry.callbacks.onAgentBecameIdle?.(
        fact.title,
        fact.staleWorkingTitleClear ? { staleWorkingTitleClear: true } : undefined
      )
      return
    case 'agent-exited':
      entry.callbacks.onAgentExited?.()
      return
    case 'command-finished':
      entry.callbacks.onCommandFinished?.(fact.exitCode)
      return
    case 'pr-link':
      entry.callbacks.onPrLink?.(fact.link)
      return
    case 'command-code-working':
      entry.callbacks.onCommandCodeWorking?.(fact.prompt)
      return
    case 'command-code-done':
      entry.callbacks.onCommandCodeDone?.(fact.prompt)
      return
    case '2031-subscribe':
      entry.callbacks.onMode2031Subscribe?.()
  }
}

function applyBatchToConsumer(entry: ConsumerEntry, batch: TerminalSideEffectBatch): void {
  if (entry.epoch !== batch.epoch) {
    entry.epoch = batch.epoch
    entry.lastLiveTitleSeq = null
  }
  if (batch.replay) {
    // Why: snapshots restore title only; old bells and completion facts must not replay.
    if (entry.lastLiveTitleSeq !== null && batch.seq <= entry.lastLiveTitleSeq) {
      return
    }
    for (const fact of batch.facts) {
      if (fact.kind === 'title') {
        entry.callbacks.onTitleChange?.(fact.normalizedTitle, fact.rawTitle)
      }
    }
    return
  }
  for (const fact of batch.facts) {
    applyLiveFact(entry, fact, batch.seq)
  }
}

function handleSideEffectBatch(batch: TerminalSideEffectBatch): void {
  const entry = consumersByPtyId.get(batch.ptyId)
  if (!entry) {
    return
  }
  applyBatchToConsumer(entry, batch)
}

function ensureSideEffectChannelSubscription(): void {
  if (channelUnsubscribe !== null) {
    return
  }
  channelUnsubscribe = subscribeRendererTerminalSideEffects(handleSideEffectBatch)
}

export type TerminalSideEffectFactConsumerOptions = {
  ptyId: string
  callbacks: TerminalSideEffectFactConsumerCallbacks
}

/**
 * Register the single fact consumer for a PTY. A new registration replaces a
 * stale one for the same PTY (same semantics as the parked watcher registry):
 * two consumers would double-fire bell/completion policy for the same bytes.
 */
export function registerTerminalSideEffectFactConsumer(
  options: TerminalSideEffectFactConsumerOptions
): () => void {
  ensureSideEffectChannelSubscription()
  const entry: ConsumerEntry = {
    callbacks: options.callbacks,
    lastLiveTitleSeq: null,
    epoch: null
  }
  consumersByPtyId.set(options.ptyId, entry)

  return () => {
    if (consumersByPtyId.get(options.ptyId) === entry) {
      consumersByPtyId.delete(options.ptyId)
    }
  }
}
