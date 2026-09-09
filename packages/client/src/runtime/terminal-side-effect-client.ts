import type { TerminalMultiplexSideEffectFact } from '@yiru/protocol/terminal-multiplex/side-effects'

export type TerminalSideEffectFact = TerminalMultiplexSideEffectFact
export type TerminalGitHubPRLink = Extract<TerminalSideEffectFact, { kind: 'pr-link' }>['link']
export type TerminalSideEffectBatch = {
  ptyId: string
  seq: bigint
  epoch: bigint
  facts: TerminalSideEffectFact[]
  replay?: boolean
  worktreeId?: string
  tabId?: string
  paneKey?: string
  connectionId?: string | null
}

const subscribers = new Set<(batch: TerminalSideEffectBatch) => void>()

export function subscribeRendererTerminalSideEffects(
  callback: (batch: TerminalSideEffectBatch) => void
): () => void {
  subscribers.add(callback)
  return () => subscribers.delete(callback)
}

export function publishRendererTerminalSideEffects(batch: TerminalSideEffectBatch): void {
  for (const subscriber of subscribers) {
    subscriber(batch)
  }
}
