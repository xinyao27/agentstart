import { registerCdpRecovery, sendCdp, sendCdpRecoveryCommand } from '../cdp/session'
import { claimDownloadCandidate } from './download-candidate'

const MAX_DOWNLOAD_BYTES = 1024 * 1024 * 1024
const DOWNLOAD_RECOVERY_KEY_PREFIX = 'browserDownload.v1:'

type PersistedDownloadOperation = {
  handle: string | null
  receiptId: string
  requestId: string
}

type DownloadOperation = {
  byteLength: number
  failure: Error | null
  handle: string
  receiptId: string
  reading: boolean
  release: () => Promise<void>
  requestId: string
  tabId: number
}

const operations = new Map<string, DownloadOperation>()
const operationByTab = new Map<number, string>()
let listenersRegistered = false

registerBrowserDownloadListeners()

function registerBrowserDownloadListeners(): void {
  if (listenersRegistered) {
    return
  }
  listenersRegistered = true
  registerCdpRecovery({
    complete: forgetPersistedDownload,
    prepare: recoverPersistedDownload
  })
  chrome.tabs.onRemoved.addListener((tabId) => {
    const receiptId = operationByTab.get(tabId)
    const operation = receiptId ? operations.get(receiptId) : undefined
    if (operation) {
      forgetOperation(operation)
    }
    void forgetPersistedDownload(tabId)
  })
}

export async function downloadBrowserFile(
  tabId: number,
  input: Record<string, unknown>
): Promise<{ receiptId: string }> {
  const selector = requireString(input, 'selector')
  const receiptId = requireReceiptId(input)
  if (operationByTab.has(tabId) || operations.has(receiptId)) {
    throw new Error('browser_download_tab_busy')
  }
  const candidate = await claimDownloadCandidate(tabId, selector)
  let handle: string | null = null
  try {
    await rememberPersistedDownload(tabId, {
      handle,
      receiptId,
      requestId: candidate.requestId
    })
    const stream = await sendCdp(tabId, 'Fetch.takeResponseBodyAsStream', {
      requestId: candidate.requestId
    })
    handle = readString(stream, 'stream')
    await rememberPersistedDownload(tabId, {
      handle,
      receiptId,
      requestId: candidate.requestId
    })
    const operation: DownloadOperation = {
      byteLength: 0,
      failure: null,
      handle,
      receiptId,
      reading: false,
      release: candidate.release,
      requestId: candidate.requestId,
      tabId
    }
    candidate.failOnAmbiguity((error) => {
      operation.failure = error
    })
    operations.set(receiptId, operation)
    operationByTab.set(tabId, receiptId)
    return { receiptId }
  } catch (error) {
    const wasAborted = await abortPersistedRequest(tabId, candidate.requestId, handle)
    if (wasAborted) {
      await forgetPersistedDownload(tabId)
      await candidate.release()
    }
    throw error
  }
}

export async function readBrowserDownload(receiptId: string): Promise<{
  base64: string
  byteLength: number
  eof: boolean
}> {
  const operation = requireOperation(receiptId)
  if (operation.reading) {
    throw new Error('browser_download_read_in_progress')
  }
  operation.reading = true
  try {
    return await readOperation(operation)
  } finally {
    operation.reading = false
  }
}

async function readOperation(operation: DownloadOperation): Promise<{
  base64: string
  byteLength: number
  eof: boolean
}> {
  if (operation.failure) {
    const error = operation.failure
    await abortOperation(operation)
    throw error
  }
  const result = await sendCdp(operation.tabId, 'IO.read', {
    handle: operation.handle,
    size: 64 * 1024
  })
  const data = readString(result, 'data', true)
  const base64 =
    Reflect.get(readObject(result), 'base64Encoded') === true ? data : utf8ToBase64(data)
  const chunkBytes = base64ByteLength(base64)
  operation.byteLength += chunkBytes
  if (operation.byteLength > MAX_DOWNLOAD_BYTES) {
    await abortOperation(operation)
    throw new Error('browser_download_too_large')
  }
  const eof = Reflect.get(readObject(result), 'eof') === true
  if (eof) {
    await finishOperation(operation)
  }
  return { base64, byteLength: operation.byteLength, eof }
}

export async function abortBrowserDownload(receiptId: string): Promise<void> {
  const operation = operations.get(receiptId)
  if (operation) {
    await abortOperation(operation)
  }
}

async function finishOperation(operation: DownloadOperation): Promise<void> {
  await closeOperation(operation)
}

async function abortOperation(operation: DownloadOperation): Promise<void> {
  await closeOperation(operation)
}

async function closeOperation(operation: DownloadOperation): Promise<void> {
  forgetOperation(operation)
  const wasAborted = await abortPersistedRequest(
    operation.tabId,
    operation.requestId,
    operation.handle
  )
  if (!wasAborted) {
    throw new Error('browser_download_abort_failed')
  }
  await forgetPersistedDownload(operation.tabId)
  await operation.release()
}

async function recoverPersistedDownload(tabId: number): Promise<boolean> {
  const key = recoveryKey(tabId)
  const stored: unknown = await chrome.storage.session.get(key)
  const raw = readObject(stored)[key]
  if (raw === undefined) {
    return true
  }
  const persisted = parsePersistedDownload(raw)
  if (!persisted) {
    return false
  }
  const wasAborted = await abortPersistedRequest(tabId, persisted.requestId, persisted.handle)
  if (wasAborted) {
    await forgetPersistedDownload(tabId)
  }
  return wasAborted
}

async function abortPersistedRequest(
  tabId: number,
  requestId: string,
  handle: string | null
): Promise<boolean> {
  if (handle) {
    await sendCdpRecoveryCommand(tabId, 'IO.close', { handle })
  }
  return sendCdpRecoveryCommand(tabId, 'Fetch.failRequest', {
    errorReason: 'Aborted',
    requestId
  })
}

async function rememberPersistedDownload(
  tabId: number,
  operation: PersistedDownloadOperation
): Promise<void> {
  await chrome.storage.session.set({ [recoveryKey(tabId)]: operation })
}

async function forgetPersistedDownload(tabId: number): Promise<void> {
  await chrome.storage.session.remove(recoveryKey(tabId))
}

function parsePersistedDownload(value: unknown): PersistedDownloadOperation | null {
  const record = readObject(value)
  const handle = Reflect.get(record, 'handle')
  const receiptId = Reflect.get(record, 'receiptId')
  const requestId = Reflect.get(record, 'requestId')
  if (
    (handle !== null && typeof handle !== 'string') ||
    typeof receiptId !== 'string' ||
    typeof requestId !== 'string' ||
    receiptId.length === 0 ||
    requestId.length === 0
  ) {
    return null
  }
  return { handle, receiptId, requestId }
}

function recoveryKey(tabId: number): string {
  return `${DOWNLOAD_RECOVERY_KEY_PREFIX}${tabId}`
}

function forgetOperation(operation: DownloadOperation): void {
  operations.delete(operation.receiptId)
  if (operationByTab.get(operation.tabId) === operation.receiptId) {
    operationByTab.delete(operation.tabId)
  }
}

function requireOperation(receiptId: string): DownloadOperation {
  const operation = operations.get(receiptId)
  if (!operation) {
    throw new Error('browser_download_receipt_not_found')
  }
  return operation
}

function requireReceiptId(input: Record<string, unknown>): string {
  const receiptId = requireString(input, 'receiptId')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receiptId)) {
    throw new Error('browser_download_receipt_invalid')
  }
  return receiptId
}

function requireString(input: Record<string, unknown>, key: string): string {
  return readString(input, key)
}

function readString(value: unknown, key: string, allowEmpty = false): string {
  const candidate = Reflect.get(readObject(value), key)
  if (typeof candidate !== 'string' || (!allowEmpty && candidate.length === 0)) {
    throw new Error(`browser_download_value_missing:${key}`)
  }
  return candidate
}

function readObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ByteLength(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return Math.floor((value.length * 3) / 4) - padding
}
