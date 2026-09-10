import type { AppControlClient, StartupDiagnostic } from '@agentstart/protocol'
type AppControlRequest = {
  deadline: number
  protocolClient: AppControlClient | null
  remainingTimeout: (deadline: number) => number
}

type StartupDiagnosticRequest = AppControlRequest & {
  details?: Record<string, unknown>
  event: string
}

export async function restartRuntimeApp(request: AppControlRequest): Promise<void> {
  const client = requireProtocolClient(request.protocolClient)
  await client.restart({ timeoutMs: request.remainingTimeout(request.deadline) })
}

export async function recordRuntimeStartupDiagnostic(
  request: StartupDiagnosticRequest
): Promise<void> {
  const client = requireProtocolClient(request.protocolClient)
  await client.recordStartupDiagnostic(startupDiagnostic(request.event, request.details), {
    timeoutMs: request.remainingTimeout(request.deadline)
  })
}

function requireProtocolClient(client: AppControlClient | null): AppControlClient {
  if (!client) {
    throw new Error('extension_runtime_protocol_unavailable')
  }
  return client
}

function startupDiagnostic(
  event: string,
  details: Record<string, unknown> | undefined
): StartupDiagnostic {
  const rendererElapsedMs = boundedDiagnosticDuration(details?.rendererT)
  const durationMs = boundedDiagnosticDuration(details?.durationMs)
  return {
    event,
    ...(rendererElapsedMs === undefined ? {} : { rendererElapsedMs }),
    ...(durationMs === undefined ? {} : { durationMs })
  }
}

function boundedDiagnosticDuration(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined
  }
  return Math.min(0xffff_ffff, Math.round(value))
}
