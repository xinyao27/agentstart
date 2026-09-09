import type { AgentInterruptInputIntent } from '~renderer/terminal-pane/agent/interrupt-intent'

type TerminalInputIntentInput = {
  interruptInference: {
    flushPending: () => boolean | Promise<boolean>
    observeInputIntent: (intent: AgentInterruptInputIntent) => void
  }
  onAcceptedInput: (data: string, intent: AgentInterruptInputIntent | null) => void
  onTitleOnlyInterrupt: () => void
}

export function createTerminalInputIntent({
  interruptInference,
  onAcceptedInput,
  onTitleOnlyInterrupt
}: TerminalInputIntentInput) {
  let pendingIntent: AgentInterruptInputIntent | null = null
  let clearIntentTimer: ReturnType<typeof setTimeout> | null = null
  let pendingWrite: Promise<void> | null = null

  const clear = (): void => {
    pendingIntent = null
    if (clearIntentTimer !== null) {
      clearTimeout(clearIntentTimer)
      clearIntentTimer = null
    }
  }
  const setPending = (intent: AgentInterruptInputIntent): void => {
    clear()
    pendingIntent = intent
    clearIntentTimer = setTimeout(clear, 0)
  }
  const inferExact = (data: string): AgentInterruptInputIntent | null => {
    if (data === '\x03') {
      return 'ctrl-c'
    }
    if (data === '\x1b') {
      return 'plain-escape'
    }
    return null
  }
  const inputMatches = (intent: AgentInterruptInputIntent, data: string): boolean =>
    (intent === 'plain-escape' && data === '\x1b') || (intent === 'ctrl-c' && data === '\x03')

  return {
    clear,
    dispose: () => {
      clear()
      pendingWrite = null
    },
    flushPendingInference: (): boolean | Promise<boolean> =>
      pendingWrite
        ? pendingWrite.then(() => interruptInference.flushPending())
        : interruptInference.flushPending(),
    getPending: () => pendingIntent,
    inferExact,
    observeAccepted: (data: string, intent: AgentInterruptInputIntent | null = null) =>
      onAcceptedInput(data, intent),
    observeSent: (data: string, intent = pendingIntent): void => {
      if (intent && inputMatches(intent, data)) {
        interruptInference.observeInputIntent(intent)
        onTitleOnlyInterrupt()
      }
    },
    setPending,
    setPendingWrite: (promise: Promise<void>): void => {
      pendingWrite = promise
      void promise.finally(() => {
        if (pendingWrite === promise) {
          pendingWrite = null
        }
      })
    }
  }
}

export type TerminalInputIntent = ReturnType<typeof createTerminalInputIntent>
