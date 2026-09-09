import { bindPanePtyId, getFitOverrideForPty } from '../pane-manager/mobile-fit-overrides'
import { markPaneContainerPtyId } from '../pane-manager/pane-pty-binding-dom'
import type { TerminalSideEffectFactConsumerCallbacks } from '../terminal-side-effect-facts-handler'
import { registerTerminalSideEffectFactConsumer } from '../terminal-side-effect-facts-handler'

type PaneBindingOptions = {
  paneId: number
  tabId: string
  container: HTMLElement
  getIsDisposed: () => boolean
  fit: () => void
  callbacks: TerminalSideEffectFactConsumerCallbacks
}

export type PaneBinding = {
  bind: (ptyId: string) => void
  clear: () => void
  dropFacts: () => void
  getPtyId: () => string | null
  getBoundAt: () => number | null
}

export function createPaneBinding(options: PaneBindingOptions): PaneBinding {
  let activePtyId: string | null = null
  let boundAt: number | null = null
  let unregisterFacts: (() => void) | null = null

  const dropFacts = (): void => {
    unregisterFacts?.()
    unregisterFacts = null
  }
  return {
    bind: (ptyId) => {
      bindPanePtyId(options.paneId, ptyId, options.tabId)
      markPaneContainerPtyId(options.container, ptyId)
      if (getFitOverrideForPty(ptyId)) {
        options.fit()
      }
      activePtyId = ptyId
      // Why: liveness snapshots started before this bind cannot retire the
      // newly attached PTY when their stale result lands.
      boundAt = performance.now()
      if (!options.getIsDisposed()) {
        dropFacts()
        unregisterFacts = registerTerminalSideEffectFactConsumer({
          ptyId,
          callbacks: options.callbacks
        })
      }
    },
    clear: () => {
      bindPanePtyId(options.paneId, null, options.tabId)
      activePtyId = null
      boundAt = null
      delete options.container.dataset.ptyId
    },
    dropFacts,
    getPtyId: () => activePtyId,
    getBoundAt: () => boundAt
  }
}
