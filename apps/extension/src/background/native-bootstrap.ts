const NATIVE_HOST_NAME = 'com.agentstart.daemon'
const NATIVE_BOOTSTRAP_TIMEOUT_MS = 12_000

export type NativeBootstrapResult = {
  authToken: string
  endpoint: string
  expectedRuntimeId: string | null
  protocolVersion: number
  rpcProtocol: 'agentstart-protobuf-v2'
}

let nativeBootstrapInFlight: Promise<NativeBootstrapResult> | null = null

export function requestNativeBootstrap(): Promise<NativeBootstrapResult> {
  if (nativeBootstrapInFlight) {
    return nativeBootstrapInFlight
  }
  const request = requestNativeBootstrapOnce()
  nativeBootstrapInFlight = request
  void request.then(
    () => {
      if (nativeBootstrapInFlight === request) {
        nativeBootstrapInFlight = null
      }
    },
    () => {
      if (nativeBootstrapInFlight === request) {
        nativeBootstrapInFlight = null
      }
    }
  )
  return request
}

function requestNativeBootstrapOnce(): Promise<NativeBootstrapResult> {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME)
    let settled = false
    const timeout = setTimeout(() => {
      settled = true
      port.disconnect()
      reject(new Error('onboarding:daemon-stopped'))
    }, NATIVE_BOOTSTRAP_TIMEOUT_MS)
    const finish = (): void => {
      settled = true
      clearTimeout(timeout)
      port.disconnect()
    }
    port.onMessage.addListener((message: unknown) => {
      if (!isNativeBootstrapResponse(message)) {
        finish()
        reject(new Error('onboarding:incompatible-version'))
        return
      }
      finish()
      if (!message.ok) {
        reject(new Error(classifyNativeBootstrapFailure(message.error.message)))
        return
      }
      resolve({
        authToken: message.result.authToken,
        endpoint: message.result.endpoint,
        expectedRuntimeId: message.result.runtimeId,
        protocolVersion: message.result.protocolVersion,
        rpcProtocol: message.result.rpcProtocol
      })
    })
    port.onDisconnect.addListener(() => {
      clearTimeout(timeout)
      if (!settled) {
        settled = true
        const detail = readRuntimeErrorMessage()
        reject(
          new Error(
            /native messaging host.*not found|specified native messaging host/i.test(detail)
              ? 'onboarding:missing-cli'
              : 'onboarding:daemon-stopped'
          )
        )
      }
    })
    port.postMessage({ id: crypto.randomUUID(), type: 'bootstrap' })
  })
}

function classifyNativeBootstrapFailure(message: string): string {
  return /schema_unsupported|protocol|incompatible|extension_bootstrap_invalid|invalid_response/i.test(
    message
  )
    ? 'onboarding:incompatible-version'
    : 'onboarding:daemon-stopped'
}

export function requestNativeDirectory(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME)
    let settled = false
    const timeout = setTimeout(() => {
      settled = true
      port.disconnect()
      reject(new Error('native_directory_timeout'))
    }, NATIVE_BOOTSTRAP_TIMEOUT_MS)
    port.onMessage.addListener((message: unknown) => {
      settled = true
      clearTimeout(timeout)
      port.disconnect()
      const result =
        typeof message === 'object' && message !== null ? Reflect.get(message, 'result') : null
      const path =
        typeof result === 'object' && result !== null ? Reflect.get(result, 'path') : null
      if (
        typeof message !== 'object' ||
        message === null ||
        Reflect.get(message, 'ok') !== true ||
        (path !== null && typeof path !== 'string')
      ) {
        reject(new Error('native_directory_invalid_response'))
        return
      }
      resolve(path)
    })
    port.onDisconnect.addListener(() => {
      clearTimeout(timeout)
      if (!settled) {
        settled = true
        const detail = readRuntimeErrorMessage()
        reject(
          new Error(
            /native messaging host.*not found|specified native messaging host/i.test(detail)
              ? 'onboarding:missing-cli'
              : 'onboarding:daemon-stopped'
          )
        )
      }
    })
    port.postMessage({ id: crypto.randomUUID(), type: 'pick-directory' })
  })
}

type NativeBootstrapResponse =
  | {
      ok: true
      result: {
        authToken: string
        endpoint: string
        protocolVersion: number
        rpcProtocol: 'agentstart-protobuf-v2'
        runtimeId: string
      }
    }
  | { ok: false; error: { message: string } }

function isNativeBootstrapResponse(value: unknown): value is NativeBootstrapResponse {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof Reflect.get(value, 'ok') !== 'boolean'
  ) {
    return false
  }
  if (Reflect.get(value, 'ok') === false) {
    const error = Reflect.get(value, 'error')
    return (
      typeof error === 'object' &&
      error !== null &&
      typeof Reflect.get(error, 'message') === 'string'
    )
  }
  const result = Reflect.get(value, 'result')
  const rpcProtocol =
    typeof result === 'object' && result !== null ? Reflect.get(result, 'rpcProtocol') : undefined
  return (
    typeof result === 'object' &&
    result !== null &&
    typeof Reflect.get(result, 'authToken') === 'string' &&
    typeof Reflect.get(result, 'endpoint') === 'string' &&
    typeof Reflect.get(result, 'protocolVersion') === 'number' &&
    rpcProtocol === 'agentstart-protobuf-v2' &&
    typeof Reflect.get(result, 'runtimeId') === 'string'
  )
}

function readRuntimeErrorMessage(): string {
  const error = Reflect.get(chrome.runtime, 'lastError')
  return typeof error === 'object' &&
    error !== null &&
    typeof Reflect.get(error, 'message') === 'string'
    ? Reflect.get(error, 'message')
    : ''
}
