export type RuntimeHealthBootstrap = {
  authToken: string
  endpoint: string
  protocolVersion: number
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

export async function verifyRuntimeHealth(
  bootstrap: RuntimeHealthBootstrap,
  timeoutMs = 3_000
): Promise<void> {
  const health = runtimeHealthUrl(bootstrap)
  let response: Response
  try {
    response = await fetch(health, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch {
    throw new Error(
      LOOPBACK_HOSTS.has(health.hostname.toLowerCase())
        ? 'onboarding:loopback-check-failed'
        : 'onboarding:daemon-stopped'
    )
  }
  if (response.status === 426) {
    throw new Error('onboarding:incompatible-version')
  }
  if (!response.ok) {
    throw new Error('onboarding:daemon-stopped')
  }
  const status: unknown = await response.json()
  if (
    typeof status !== 'object' ||
    status === null ||
    Reflect.get(status, 'protocolVersion') !== bootstrap.protocolVersion
  ) {
    throw new Error('onboarding:incompatible-version')
  }
}

function runtimeHealthUrl(bootstrap: RuntimeHealthBootstrap): URL {
  const health = new URL(bootstrap.endpoint)
  health.protocol = health.protocol === 'wss:' ? 'https:' : 'http:'
  health.pathname = '/health'
  health.search = ''
  health.searchParams.set('protocolVersion', String(bootstrap.protocolVersion))
  health.searchParams.set('token', bootstrap.authToken)
  return health
}
