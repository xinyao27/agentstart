let applying = 0
const writers = new Set<() => void>()

export function registerSessionWriteFlush(flush: () => void): () => void {
  writers.add(flush)
  return () => {
    writers.delete(flush)
  }
}

export function flushPendingSessionWrites(): void {
  for (const flush of writers) {
    flush()
  }
}

export function isApplyingSessionProjection(): boolean {
  return applying > 0
}

export function applySessionProjection(effect: () => void): void {
  applying += 1
  try {
    effect()
  } finally {
    applying -= 1
  }
}
