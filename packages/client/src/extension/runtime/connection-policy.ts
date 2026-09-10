export function remainingRuntimeConnectTimeout(deadline: number): number {
  const timeoutMs = Math.ceil(deadline - performance.now())
  if (timeoutMs <= 0) {
    throw new Error('extension_runtime_connection_timed_out')
  }
  return timeoutMs
}
