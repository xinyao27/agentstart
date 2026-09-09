import { requireSuccessfulResponse } from './messages'

export async function executeDaemonBrowserCommand(
  method: string,
  input: unknown,
  authorityId: string | null = null,
  stream?: {
    sendBinary: (
      receiptId: string,
      sequence: number,
      isEnd: boolean,
      payload: Uint8Array<ArrayBufferLike>,
      signal: AbortSignal
    ) => Promise<void>
    signal: AbortSignal
  }
): Promise<unknown> {
  const response: unknown = await chrome.runtime.sendMessage({
    authorityId,
    input,
    method,
    type: 'browser-command'
  })
  requireSuccessfulResponse(response)
  const result =
    typeof response === 'object' && response !== null ? Reflect.get(response, 'result') : undefined
  if (method !== 'browser.download') {
    return result
  }
  if (!stream) {
    throw new Error('browser_download_binary_transport_required')
  }
  return streamDownload(result, stream)
}

async function streamDownload(
  result: unknown,
  stream: {
    sendBinary: (
      receiptId: string,
      sequence: number,
      isEnd: boolean,
      payload: Uint8Array<ArrayBufferLike>,
      signal: AbortSignal
    ) => Promise<void>
    signal: AbortSignal
  }
): Promise<{ byteLength: number; receiptId: string }> {
  const receiptId = readString(result, 'receiptId')
  let completed = false
  let sequence = 0
  let byteLength = 0
  const abort = (): void => {
    void chrome.runtime.sendMessage({ receiptId, type: 'browser-download-abort' }).catch(() => {})
  }
  stream.signal.addEventListener('abort', abort, { once: true })
  try {
    while (true) {
      if (stream.signal.aborted) {
        throw stream.signal.reason
      }
      const response: unknown = await chrome.runtime.sendMessage({
        receiptId,
        type: 'browser-download-read'
      })
      requireSuccessfulResponse(response)
      const chunk = Reflect.get(readObject(response), 'result')
      const base64 = readString(chunk, 'base64', true)
      const bytes = decodeBase64(base64)
      byteLength = readNumber(chunk, 'byteLength')
      if (bytes.byteLength > 0) {
        await stream.sendBinary(receiptId, sequence, false, bytes, stream.signal)
        sequence += 1
      }
      if (Reflect.get(readObject(chunk), 'eof') === true) {
        await stream.sendBinary(receiptId, sequence, true, new Uint8Array(), stream.signal)
        completed = true
        return { byteLength, receiptId }
      }
    }
  } finally {
    stream.signal.removeEventListener('abort', abort)
    if (!completed) {
      abort()
    }
  }
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value)
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index)
  }
  return bytes
}

function readObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown, key: string, allowEmpty = false): string {
  const candidate = Reflect.get(readObject(value), key)
  if (typeof candidate !== 'string' || (!allowEmpty && candidate.length === 0)) {
    throw new Error(`browser_download_response_invalid:${key}`)
  }
  return candidate
}

function readNumber(value: unknown, key: string): number {
  const candidate = Reflect.get(readObject(value), key)
  if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate < 0) {
    throw new Error(`browser_download_response_invalid:${key}`)
  }
  return candidate
}
