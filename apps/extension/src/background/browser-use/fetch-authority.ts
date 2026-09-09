import { acquireCdp, releaseCdp, sendCdp, subscribeCdp } from '../cdp/session'
import { optionalString, readHeaders, readStringValue } from './command-value'

export type FetchResponseOwner = {
  onClosed: () => void
  onPaused: (params: Record<string, unknown>) => Promise<boolean>
  urlPattern: string
}

type FetchState = {
  acquired: boolean
  credentials: { password: string; username: string } | null
  operation: Promise<void>
  patterns: string[] | null
  requests: {
    headers: Record<string, string>
    id: string
    method: string
    resourceType: string
    url: string
  }[]
  responseOwner: FetchResponseOwner | null
}

const fetchStates = new Map<number, FetchState>()
let isRegistered = false

export function registerFetchAuthority(): void {
  if (isRegistered) {
    return
  }
  isRegistered = true
  subscribeCdp((tabId, method, params) => {
    const state = fetchStates.get(tabId)
    if (!state) {
      return
    }
    if (method === 'Fetch.authRequired') {
      void continueAuthentication(tabId, params, state)
      return
    }
    if (method === 'Fetch.requestPaused') {
      void routePausedRequest(tabId, params, state)
    }
  })
  chrome.tabs.onRemoved.addListener((tabId) => {
    const state = fetchStates.get(tabId)
    if (!state) {
      return
    }
    fetchStates.delete(tabId)
    state.responseOwner?.onClosed()
    if (state.acquired) {
      void releaseCdp(tabId, 'browser-fetch')
    }
  })
  chrome.debugger.onDetach.addListener((source) => {
    if (source.tabId === undefined) {
      return
    }
    const state = fetchStates.get(source.tabId)
    if (!state) {
      return
    }
    fetchStates.delete(source.tabId)
    state.acquired = false
    state.responseOwner?.onClosed()
  })
}

export async function setFetchInterception(tabId: number, patterns: string[] | null) {
  const state = fetchState(tabId)
  await enqueueState(state, async () => {
    if (state.responseOwner) {
      throw new Error('browser_fetch_configuration_busy')
    }
    state.patterns = patterns
    await configureFetch(tabId, state)
  })
}

export async function setFetchCredentials(
  tabId: number,
  credentials: { password: string; username: string } | null
) {
  const state = fetchState(tabId)
  await enqueueState(state, async () => {
    if (state.responseOwner) {
      throw new Error('browser_fetch_configuration_busy')
    }
    state.credentials = credentials
    await configureFetch(tabId, state)
  })
}

export function interceptedRequests(tabId: number) {
  return fetchStates.get(tabId)?.requests ?? []
}

export async function claimFetchResponse(
  tabId: number,
  owner: FetchResponseOwner
): Promise<() => Promise<void>> {
  const state = fetchState(tabId)
  await enqueueState(state, async () => {
    if (state.responseOwner) {
      throw new Error('browser_download_tab_busy')
    }
    state.responseOwner = owner
    await configureFetch(tabId, state)
  })
  return async () => {
    await enqueueState(state, async () => {
      if (state.responseOwner === owner) {
        state.responseOwner = null
        await configureFetch(tabId, state)
      }
    })
  }
}

function fetchState(tabId: number): FetchState {
  registerFetchAuthority()
  const existing = fetchStates.get(tabId)
  if (existing) {
    return existing
  }
  const state: FetchState = {
    acquired: false,
    credentials: null,
    operation: Promise.resolve(),
    patterns: null,
    requests: [],
    responseOwner: null
  }
  fetchStates.set(tabId, state)
  return state
}

async function enqueueState(state: FetchState, apply: () => Promise<void>): Promise<void> {
  const operation = state.operation.catch(() => undefined).then(apply)
  state.operation = operation
  await operation
}

async function configureFetch(tabId: number, state: FetchState): Promise<void> {
  const hasFeatures = Boolean(state.patterns || state.credentials || state.responseOwner)
  if (!hasFeatures) {
    if (state.acquired) {
      await sendCdp(tabId, 'Fetch.disable').catch(() => undefined)
      await releaseCdp(tabId, 'browser-fetch')
      state.acquired = false
    }
    fetchStates.delete(tabId)
    return
  }
  if (!state.acquired) {
    await acquireCdp(tabId, 'browser-fetch')
    state.acquired = true
  }
  const patterns = (state.patterns ?? (state.credentials ? ['*'] : [])).map((urlPattern) => ({
    requestStage: 'Request',
    urlPattern
  }))
  if (state.responseOwner) {
    patterns.push({ requestStage: 'Response', urlPattern: state.responseOwner.urlPattern })
  }
  await sendCdp(tabId, 'Fetch.enable', {
    handleAuthRequests: state.credentials !== null,
    patterns
  })
}

async function routePausedRequest(
  tabId: number,
  params: Record<string, unknown>,
  state: FetchState
): Promise<void> {
  const requestId = Reflect.get(params, 'requestId')
  if (typeof requestId !== 'string') {
    return
  }
  if (Reflect.get(params, 'responseStatusCode') !== undefined) {
    const claimed = state.responseOwner
      ? await state.responseOwner.onPaused(params).catch(() => false)
      : false
    if (claimed) {
      return
    }
    await sendCdp(tabId, 'Fetch.continueRequest', { requestId }).catch(() => undefined)
    return
  }
  const request = Reflect.get(params, 'request')
  if (typeof request === 'object' && request !== null && state.patterns) {
    state.requests.push({
      headers: readHeaders(Reflect.get(request, 'headers')),
      id: requestId,
      method: readStringValue(request, 'method'),
      resourceType: optionalString(params, 'resourceType') ?? '',
      url: readStringValue(request, 'url')
    })
    if (state.requests.length > 500) {
      state.requests.shift()
    }
  }
  await sendCdp(tabId, 'Fetch.continueRequest', { requestId }).catch(() => undefined)
}

async function continueAuthentication(
  tabId: number,
  params: Record<string, unknown>,
  state: FetchState
): Promise<void> {
  const requestId = Reflect.get(params, 'requestId')
  if (typeof requestId !== 'string') {
    return
  }
  await sendCdp(tabId, 'Fetch.continueWithAuth', {
    authChallengeResponse: state.credentials
      ? { response: 'ProvideCredentials', ...state.credentials }
      : { response: 'Default' },
    requestId
  }).catch(() => undefined)
}
