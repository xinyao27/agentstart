const PAGE_REGISTRATIONS_KEY = 'browserUsePageRegistrations'

export type PageRegistration = {
  authorityId: string
  backendPageId: string
  generation: string
  sessionProfileId: string | null
  workspaceId: string
  worktreeId: string
}

const pages = new Map<number, PageRegistration>()
const revocationVersions = new Map<number, number>()
export const pageRegistryReady = restorePages()
let mutationOperation = pageRegistryReady

export function registrationForTab(tabId: number): PageRegistration | null {
  return pages.get(tabId) ?? null
}

export function registrationGeneration(tabId: number): string | null {
  return pages.get(tabId)?.generation ?? null
}

export function authorizedRegistrationGeneration(
  tabId: number,
  authorityId: string | null
): string | null {
  const registration = pages.get(tabId)
  return authorityId !== null && registration?.authorityId === authorityId
    ? registration.generation
    : null
}

export async function replacePageRegistration(
  tabId: number,
  registration: PageRegistration,
  cleanup: () => Promise<void>
): Promise<boolean> {
  return transitionPageRegistration(tabId, registration, cleanup)
}

export async function removePageRegistration(
  tabId: number,
  cleanup: () => Promise<void>
): Promise<boolean> {
  return transitionPageRegistration(tabId, null, cleanup)
}

export function discardPageRegistration(tabId: number): void {
  revokePageRegistration(tabId)
  const operation = enqueueMutation(async () => {
    const candidate = withoutRevokedPages(new Map(pages))
    const revocations = new Map(revocationVersions)
    await persistPages(candidate)
    commitPages(candidate)
    clearPersistedRevocations(candidate, revocations)
  })
  void operation.catch(() => undefined)
}

async function transitionPageRegistration(
  tabId: number,
  registration: PageRegistration | null,
  cleanup: () => Promise<void>
): Promise<boolean> {
  const previous = pages.get(tabId) ?? null
  const version = revokePageRegistration(tabId)
  return enqueueMutation(async () => {
    try {
      await cleanup()
    } catch (error) {
      restorePreviousRegistration(tabId, version, previous)
      throw error
    }
    const isCurrent = revocationVersions.get(tabId) === version
    const candidate = withoutRevokedPages(new Map(pages))
    if (isCurrent && registration) {
      candidate.set(tabId, registration)
    }
    const revocations = new Map(revocationVersions)
    try {
      await persistPages(candidate)
    } catch (error) {
      restorePreviousRegistration(tabId, version, previous)
      throw error
    }
    if (revocationVersions.get(tabId) !== version) {
      return false
    }
    revocationVersions.delete(tabId)
    commitPages(candidate)
    clearPersistedRevocations(candidate, revocations)
    return true
  })
}

function restorePreviousRegistration(
  tabId: number,
  version: number,
  previous: PageRegistration | null
): void {
  if (revocationVersions.get(tabId) !== version) {
    return
  }
  revocationVersions.delete(tabId)
  if (previous) {
    pages.set(tabId, previous)
  }
}

function revokePageRegistration(tabId: number): number {
  const version = (revocationVersions.get(tabId) ?? 0) + 1
  revocationVersions.set(tabId, version)
  pages.delete(tabId)
  return version
}

async function restorePages(): Promise<void> {
  const [stored, tabs] = await Promise.all([
    chrome.storage.session.get(PAGE_REGISTRATIONS_KEY),
    chrome.tabs.query({})
  ])
  const liveTabIds = new Set(tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id])))
  const raw = Reflect.get(stored, PAGE_REGISTRATIONS_KEY)
  if (!Array.isArray(raw)) {
    return
  }
  for (const value of raw) {
    const parsed = parseStoredRegistration(value)
    if (parsed && liveTabIds.has(parsed.tabId) && !revocationVersions.has(parsed.tabId)) {
      pages.set(parsed.tabId, parsed.registration)
    }
  }
  const revocations = new Map(revocationVersions)
  await persistPages(pages)
  clearPersistedRevocations(pages, revocations)
}

function enqueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const operation = mutationOperation.catch(() => undefined).then(mutation)
  mutationOperation = operation.then(() => undefined)
  return operation
}

function withoutRevokedPages(
  candidate: ReadonlyMap<number, PageRegistration>
): Map<number, PageRegistration> {
  return new Map([...candidate].filter(([tabId]) => !revocationVersions.has(tabId)))
}

function commitPages(candidate: ReadonlyMap<number, PageRegistration>): void {
  pages.clear()
  for (const [tabId, registration] of candidate) {
    if (!revocationVersions.has(tabId)) {
      pages.set(tabId, registration)
    }
  }
}

function clearPersistedRevocations(
  candidate: ReadonlyMap<number, PageRegistration>,
  revocations: ReadonlyMap<number, number>
): void {
  for (const [tabId, version] of revocations) {
    if (!candidate.has(tabId) && revocationVersions.get(tabId) === version) {
      revocationVersions.delete(tabId)
    }
  }
}

async function persistPages(candidate: ReadonlyMap<number, PageRegistration>): Promise<void> {
  const snapshot = [...candidate].map(([tabId, registration]) => ({ ...registration, tabId }))
  await chrome.storage.session.set({ [PAGE_REGISTRATIONS_KEY]: snapshot })
}

function parseStoredRegistration(
  value: unknown
): { registration: PageRegistration; tabId: number } | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const tabId = Reflect.get(value, 'tabId')
  const authorityId = readString(value, 'authorityId')
  const backendPageId = readString(value, 'backendPageId')
  const generation = readString(value, 'generation')
  const workspaceId = readString(value, 'workspaceId')
  const worktreeId = readString(value, 'worktreeId')
  const sessionProfileId = Reflect.get(value, 'sessionProfileId')
  if (
    !Number.isInteger(tabId) ||
    typeof tabId !== 'number' ||
    tabId < 0 ||
    !authorityId ||
    !backendPageId ||
    !generation ||
    !workspaceId ||
    !worktreeId ||
    (sessionProfileId !== null && typeof sessionProfileId !== 'string')
  ) {
    return null
  }
  return {
    registration: {
      authorityId,
      backendPageId,
      generation,
      sessionProfileId,
      workspaceId,
      worktreeId
    },
    tabId
  }
}

function readString(value: object, key: string): string | null {
  const candidate = Reflect.get(value, key)
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
}
