import { isExtensionBootstrapResponse, type ExtensionBootstrapResult } from '../bootstrap-response'

export async function requestRuntimeBootstrap(): Promise<ExtensionBootstrapResult> {
  const response: unknown = await chrome.runtime.sendMessage({ type: 'bootstrap' })
  if (!isExtensionBootstrapResponse(response) || !response.ok) {
    throw new Error(
      typeof response === 'object' &&
        response !== null &&
        typeof Reflect.get(response, 'error') === 'string'
        ? Reflect.get(response, 'error')
        : 'extension_bootstrap_invalid'
    )
  }
  return response.result
}
