import type { CommunityAdapter } from '@agentstart/client/extension-bootstrap'

import { readEnterprisePolicy } from '../enterprise-policy'

const STORAGE_KEY = 'communityAdapters'
const SCRIPT_PREFIX = 'agentstart-community-adapter-'
const MAX_ADAPTERS = 50
const MAX_CODE_CHARS = 50_000

export async function readCommunityAdapters(): Promise<CommunityAdapter[]> {
  const stored: unknown = await chrome.storage.local.get(STORAGE_KEY)
  const value =
    typeof stored === 'object' && stored !== null ? Reflect.get(stored, STORAGE_KEY) : null
  return parseAdapters(value)
}

export async function saveCommunityAdapter(
  input: Omit<CommunityAdapter, 'id'> & { id?: string }
): Promise<CommunityAdapter[]> {
  if ((await readEnterprisePolicy()).disableCommunityAdapters) {
    throw new Error('community_adapters_disabled_by_policy')
  }
  const adapter = validateAdapter({ ...input, id: input.id || crypto.randomUUID() })
  const granted = await chrome.permissions.request({
    origins: [adapter.match],
    permissions: ['userScripts']
  })
  if (!granted) {
    throw new Error('community_adapter_permission_denied')
  }
  await requireUserScriptsApi()
  const registered = await chrome.userScripts.getScripts({ ids: [scriptId(adapter.id)] })
  const registration = {
    id: scriptId(adapter.id),
    js: [{ code: adapter.code }],
    matches: [adapter.match],
    runAt: 'document_idle',
    world: 'USER_SCRIPT'
  } satisfies chrome.userScripts.RegisteredUserScript
  await (registered.length > 0
    ? chrome.userScripts.update([registration])
    : chrome.userScripts.register([registration]))
  const current = await readCommunityAdapters()
  const next = [...current.filter((candidate) => candidate.id !== adapter.id), adapter].slice(
    -MAX_ADAPTERS
  )
  await chrome.storage.local.set({ [STORAGE_KEY]: next })
  return next
}

export async function removeCommunityAdapter(id: string): Promise<CommunityAdapter[]> {
  if (!isAdapterId(id)) {
    throw new Error('community_adapter_id_invalid')
  }
  if (chrome.userScripts) {
    await chrome.userScripts.unregister({ ids: [scriptId(id)] }).catch(() => undefined)
  }
  const next = (await readCommunityAdapters()).filter((adapter) => adapter.id !== id)
  await chrome.storage.local.set({ [STORAGE_KEY]: next })
  return next
}

export async function restoreCommunityAdapters(): Promise<void> {
  if ((await readEnterprisePolicy()).disableCommunityAdapters || !chrome.userScripts) {
    return
  }
  try {
    await requireUserScriptsApi()
    const adapters = await readCommunityAdapters()
    const registered = await chrome.userScripts.getScripts()
    const registeredIds = new Set(registered.map((script) => script.id))
    const missing = adapters
      .filter((adapter) => !registeredIds.has(scriptId(adapter.id)))
      .map((adapter) => ({
        id: scriptId(adapter.id),
        js: [{ code: adapter.code }],
        matches: [adapter.match],
        runAt: 'document_idle',
        world: 'USER_SCRIPT'
      })) satisfies chrome.userScripts.RegisteredUserScript[]
    if (missing.length > 0) {
      await chrome.userScripts.register(missing)
    }
  } catch {
    // Why: Chrome disables this API behind a per-extension toggle; restoration failure must not
    // prevent the background worker from starting.
  }
}

async function requireUserScriptsApi(): Promise<void> {
  if (!chrome.userScripts) {
    throw new Error('community_adapter_toggle_required')
  }
  await chrome.userScripts.getScripts()
}

function parseAdapters(value: unknown): CommunityAdapter[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.slice(-MAX_ADAPTERS).flatMap((entry) => {
    try {
      return [validateAdapter(entry)]
    } catch {
      return []
    }
  })
}

function validateAdapter(value: unknown): CommunityAdapter {
  if (
    typeof value !== 'object' ||
    value === null ||
    !isAdapterId(Reflect.get(value, 'id')) ||
    typeof Reflect.get(value, 'name') !== 'string' ||
    typeof Reflect.get(value, 'match') !== 'string' ||
    typeof Reflect.get(value, 'code') !== 'string'
  ) {
    throw new Error('community_adapter_invalid')
  }
  const name = Reflect.get(value, 'name').trim()
  const match = normalizeMatchPattern(Reflect.get(value, 'match'))
  const code = Reflect.get(value, 'code').trim()
  if (!name || name.length > 100 || !code || code.length > MAX_CODE_CHARS) {
    throw new Error('community_adapter_invalid')
  }
  return { code, id: Reflect.get(value, 'id'), match, name }
}

function normalizeMatchPattern(value: string): string {
  const match = /^(https?):\/\/([^/*]+)\/\*$/.exec(value.trim())
  if (!match) {
    throw new Error('community_adapter_match_invalid')
  }
  const url = new URL(`${match[1]}://${match[2]}`)
  if (url.username || url.password || !url.hostname) {
    throw new Error('community_adapter_match_invalid')
  }
  return `${url.origin}/*`
}

function isAdapterId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value)
}

function scriptId(id: string): string {
  return `${SCRIPT_PREFIX}${id}`
}
