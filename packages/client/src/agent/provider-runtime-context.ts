import type { GlobalSettings } from '@yiru/protocol/settings/global/model'

export function getProviderRuntimeContextKey(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
): string {
  const environmentId = settings?.activeRuntimeEnvironmentId?.trim()
  const baseKey = environmentId ? `runtime:${environmentId}` : 'local'
  return `${baseKey}#${providerRuntimeSessionGeneration}`
}

let providerRuntimeSessionGeneration = 0

export function bumpProviderRuntimeSessionGeneration(): number {
  providerRuntimeSessionGeneration += 1
  return providerRuntimeSessionGeneration
}
