const COMMAND_CODE_OUTPUT_DONE_SETTLE_MS = 1500

type CommandCodeDoneSettleExecutor = (normalizedPrompt: string) => void

const executorByPaneKey = new Map<string, CommandCodeDoneSettleExecutor>()
const timerByPaneKey = new Map<string, ReturnType<typeof setTimeout>>()

export function setCommandCodeDoneSettleExecutor(
  paneKey: string,
  execute: CommandCodeDoneSettleExecutor
): () => void {
  executorByPaneKey.set(paneKey, execute)
  return () => {
    // Why: reveal registers the successor before its parked watcher releases;
    // stale cleanup must not delete the new writer.
    if (executorByPaneKey.get(paneKey) === execute) {
      executorByPaneKey.delete(paneKey)
    }
  }
}

export function openCommandCodeDoneSettle(paneKey: string, normalizedPrompt: string): void {
  cancelCommandCodeDoneSettle(paneKey)
  timerByPaneKey.set(
    paneKey,
    setTimeout(() => {
      timerByPaneKey.delete(paneKey)
      executorByPaneKey.get(paneKey)?.(normalizedPrompt)
    }, COMMAND_CODE_OUTPUT_DONE_SETTLE_MS)
  )
}

export function cancelCommandCodeDoneSettle(paneKey: string): void {
  const timer = timerByPaneKey.get(paneKey)
  if (timer !== undefined) {
    clearTimeout(timer)
    timerByPaneKey.delete(paneKey)
  }
}
