// Why: limit simultaneous runtime requests while preserving input order.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(limit, items.length))
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await fn(items[index], index)
      }
    })
  )
  return results
}
