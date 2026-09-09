import type { ExtensionUnavailableReason } from '@yiru/client/extension-bootstrap'

type ExtensionBootstrapResponse =
  | {
      ok: true
      result: ExtensionBootstrapResult
    }
  | { ok: false; error: string }

export type ExtensionBootstrapResult = {
  authToken: string
  endpoint: string
  expectedRuntimeId: string | null
  protocolVersion: number
  rpcProtocol: 'yiru-protobuf-v2'
}

export function classifyUnavailableResponse(value: unknown): ExtensionUnavailableReason {
  const error =
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'error') === 'string'
      ? Reflect.get(value, 'error')
      : ''
  return classifyUnavailableError(error)
}

export function classifyUnavailableError(error: unknown): ExtensionUnavailableReason {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  switch (message) {
    case 'onboarding:missing-cli':
      return 'missing-cli'
    case 'onboarding:daemon-stopped':
      return 'daemon-stopped'
    case 'onboarding:incompatible-version':
      return 'incompatible-version'
    case 'onboarding:loopback-blocked':
      return 'loopback-blocked'
    default:
      return 'unknown'
  }
}

export function isExtensionBootstrapResponse(value: unknown): value is ExtensionBootstrapResponse {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof Reflect.get(value, 'ok') !== 'boolean'
  ) {
    return false
  }
  if (Reflect.get(value, 'ok') === false) {
    return typeof Reflect.get(value, 'error') === 'string'
  }
  return isExtensionBootstrapResult(Reflect.get(value, 'result'))
}

function isExtensionBootstrapResult(result: unknown): result is ExtensionBootstrapResult {
  const rpcProtocol =
    typeof result === 'object' && result !== null ? Reflect.get(result, 'rpcProtocol') : undefined
  const expectedRuntimeId =
    typeof result === 'object' && result !== null
      ? Reflect.get(result, 'expectedRuntimeId')
      : undefined
  return (
    typeof result === 'object' &&
    result !== null &&
    typeof Reflect.get(result, 'authToken') === 'string' &&
    typeof Reflect.get(result, 'endpoint') === 'string' &&
    (expectedRuntimeId === null || typeof expectedRuntimeId === 'string') &&
    typeof Reflect.get(result, 'protocolVersion') === 'number' &&
    rpcProtocol === 'yiru-protobuf-v2'
  )
}
