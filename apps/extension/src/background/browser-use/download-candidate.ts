import { sendCdp } from '../cdp/session'
import { evaluateBrowserValue, sendBrowserCdp } from './cdp'
import { runElementAction } from './dom'
import { claimFetchResponse, type FetchResponseOwner } from './fetch-authority'

const CANDIDATE_QUIET_MS = 150
const CANDIDATE_TIMEOUT_MS = 10_000

type DownloadCandidate = {
  requestId: string
  url: string
}

type ElementProvenance = {
  downloadAttribute: boolean
  url: string | null
}

export type ClaimedDownload = {
  failOnAmbiguity: (fail: (error: Error) => void) => void
  release: () => Promise<void>
  requestId: string
}

export async function claimDownloadCandidate(
  tabId: number,
  selector: string
): Promise<ClaimedDownload> {
  const [frameId, provenance] = await Promise.all([
    mainFrameId(tabId),
    describeElement(tabId, selector)
  ])
  const gate = candidateGate(tabId, frameId, provenance)
  const release = await claimFetchResponse(tabId, gate.owner)
  try {
    await runElementAction(tabId, { action: 'click', element: selector })
    const candidate = await gate.wait()
    return {
      failOnAmbiguity: gate.failOnAmbiguity,
      release,
      requestId: candidate.requestId
    }
  } catch (error) {
    await gate.cancel()
    await release()
    throw error
  }
}

function candidateGate(
  tabId: number,
  frameId: string,
  provenance: ElementProvenance
): {
  cancel: () => Promise<void>
  failOnAmbiguity: (fail: (error: Error) => void) => void
  owner: FetchResponseOwner
  wait: () => Promise<DownloadCandidate>
} {
  let candidate: DownloadCandidate | null = null
  let failSelected: ((error: Error) => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let settleResolve: ((candidate: DownloadCandidate) => void) | null = null
  let settleReject: ((error: Error) => void) | null = null
  const pending = new Promise<DownloadCandidate>((resolve, reject) => {
    settleResolve = resolve
    settleReject = reject
  })
  const owner: FetchResponseOwner = {
    onClosed: () => settleReject?.(new Error('browser_download_tab_closed')),
    onPaused: async (params) => {
      if (!isCandidate(params, frameId, provenance)) {
        return false
      }
      const requestId = readString(params, 'requestId')
      const url = readString(readObject(Reflect.get(params, 'request')), 'url')
      if (failSelected) {
        failSelected(new Error('browser_download_ambiguous'))
        await continueRequest(tabId, requestId)
        return true
      }
      if (candidate) {
        clearCandidateTimer()
        await Promise.all([
          continueRequest(tabId, requestId),
          continueRequest(tabId, candidate.requestId)
        ])
        settleReject?.(new Error('browser_download_ambiguous'))
        return true
      }
      candidate = { requestId, url }
      timer = setTimeout(() => {
        timer = null
        if (candidate) {
          settleResolve?.(candidate)
        }
      }, CANDIDATE_QUIET_MS)
      return true
    },
    urlPattern: provenance.url ?? '*'
  }
  return {
    cancel: async () => {
      clearCandidateTimer()
      if (candidate && !failSelected) {
        await continueRequest(tabId, candidate.requestId)
      }
    },
    failOnAmbiguity: (fail) => {
      failSelected = fail
    },
    owner,
    wait: async () => {
      const timeout = setTimeout(
        () => settleReject?.(new Error('browser_download_candidate_timeout')),
        CANDIDATE_TIMEOUT_MS
      )
      try {
        return await pending
      } finally {
        clearTimeout(timeout)
      }
    }
  }
  function clearCandidateTimer(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
}

function isCandidate(
  params: Record<string, unknown>,
  frameId: string,
  provenance: ElementProvenance
): boolean {
  const request = readObject(Reflect.get(params, 'request'))
  const status = Reflect.get(params, 'responseStatusCode')
  const headers = readResponseHeaders(Reflect.get(params, 'responseHeaders'))
  const disposition = headers.get('content-disposition')?.toLowerCase() ?? ''
  const url = readString(request, 'url')
  return (
    Reflect.get(params, 'frameId') === frameId &&
    Reflect.get(params, 'resourceType') === 'Document' &&
    readString(request, 'method') === 'GET' &&
    typeof status === 'number' &&
    status >= 200 &&
    status < 300 &&
    (provenance.url === null || provenance.url === url) &&
    (provenance.downloadAttribute || disposition.includes('attachment'))
  )
}

async function mainFrameId(tabId: number): Promise<string> {
  const result = await sendBrowserCdp(tabId, 'Page.getFrameTree')
  const frameTree = readObject(Reflect.get(readObject(result), 'frameTree'))
  return readString(readObject(Reflect.get(frameTree, 'frame')), 'id')
}

async function describeElement(tabId: number, selector: string): Promise<ElementProvenance> {
  const value = await evaluateBrowserValue(
    tabId,
    `(${describeDownloadElement.toString()})(${JSON.stringify(selector)})`
  )
  const object = readObject(value)
  return {
    downloadAttribute: Reflect.get(object, 'downloadAttribute') === true,
    url: typeof Reflect.get(object, 'url') === 'string' ? readString(object, 'url') : null
  }
}

function describeDownloadElement(selector: string): ElementProvenance {
  const reference = /^@?(e\d+)$/.exec(selector)?.[1] ?? null
  const element = reference
    ? document.querySelector(`[data-agentstart-browser-ref="${reference}"]`)
    : document.querySelector(selector)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`browser_element_not_found:${selector}`)
  }
  const anchor = element.closest('a[href]')
  return {
    downloadAttribute: anchor instanceof HTMLAnchorElement && anchor.hasAttribute('download'),
    url: anchor instanceof HTMLAnchorElement ? anchor.href : null
  }
}

async function continueRequest(tabId: number, requestId: string): Promise<void> {
  await sendCdp(tabId, 'Fetch.continueRequest', { requestId }).catch(() => undefined)
}

function readString(value: unknown, key: string): string {
  const candidate = Reflect.get(readObject(value), key)
  if (typeof candidate !== 'string' || candidate.length === 0) {
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

function readResponseHeaders(value: unknown): Map<string, string> {
  const headers = new Map<string, string>()
  if (!Array.isArray(value)) {
    return headers
  }
  for (const entry of value) {
    const object = readObject(entry)
    const name = Reflect.get(object, 'name')
    const headerValue = Reflect.get(object, 'value')
    if (typeof name === 'string' && typeof headerValue === 'string') {
      headers.set(name.toLowerCase(), headerValue)
    }
  }
  return headers
}
