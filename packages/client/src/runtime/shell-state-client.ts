import {
  ShellCacheClient,
  SHELL_CACHE_PROTOCOL_CAPABILITY,
  ShellOnboardingClient,
  ShellSessionClient,
  SHELL_ONBOARDING_PROTOCOL_CAPABILITY,
  SHELL_SESSION_PROTOCOL_CAPABILITY
} from '@yiru/protocol'
import type { ShellCachePlainJsonValue, ShellSessionDocumentValue } from '@yiru/protocol'
import type { PRInfo } from '@yiru/protocol/hosted-review/pull-request-types'

type ShellGitHubCache = { pr: Record<string, { data: PRInfo | null; fetchedAt: number }> }
import type { ExecutionHostId } from '@yiru/protocol/host/identity'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import type { OnboardingState } from '@yiru/protocol/settings/onboarding'
import type { WorkspaceSessionPatch, WorkspaceSessionState } from '@yiru/protocol/workspace/session'
import { translate } from '~renderer/i18n/i18n'

import { openRuntimeProtocolTarget } from './protocol-target'
import { SessionDocumentClient } from './session-document/client'
import { prepareSessionProjection } from './session-document/projection-identities'
import { openSettingsDocumentTarget } from './settings-protocol-target'
import { readRuntimeStatus } from './status-client'

export type ShellSettingsApi = {
  get: () => Promise<GlobalSettings>
  getSnapshot: () => GlobalSettings | null
  set: (updates: Partial<GlobalSettings>) => Promise<GlobalSettings>
  updatePRBotAuthorOverride: (args: { author: string; isBot: boolean }) => Promise<GlobalSettings>
}

export type ShellSessionApi = {
  get: (hostId?: ExecutionHostId) => Promise<WorkspaceSessionState>
  set: (session: WorkspaceSessionState, hostId?: ExecutionHostId) => Promise<void>
  patch: (patch: WorkspaceSessionPatch, hostId?: ExecutionHostId) => Promise<void>
  flush: () => Promise<void>
  subscribe: (listener: (session: WorkspaceSessionState, hostId?: string) => boolean) => () => void
}

export type ShellOnboardingApi = {
  get: () => Promise<OnboardingState>
  update: (
    updates: Partial<Omit<OnboardingState, 'checklist'>> & {
      checklist?: Partial<OnboardingState['checklist']>
    }
  ) => Promise<OnboardingState>
}

export type ShellCacheApi = {
  getGitHub: () => Promise<ShellGitHubCache>
  setGitHub: (args: { cache: ShellGitHubCache }) => Promise<void>
}

let settingsSnapshot: GlobalSettings | null = null

// Why: the settings document selects the runtime target itself, so its read/write
// is anchored to the fixed local rendering shell, never the active environment.
async function requireSettingsDocumentClient() {
  const client = await openSettingsDocumentTarget({ kind: 'local' })
  if (!client) {
    throw new Error('settings.document.protobuf.v1 capability is not available')
  }
  return client
}

// Why: shell.session is LOCAL-only by contract, so its client anchors to the
// fixed local rendering shell, never the active environment.
async function requireShellSessionClient(): Promise<ShellSessionClient> {
  const target = { kind: 'local' } as const
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(SHELL_SESSION_PROTOCOL_CAPABILITY)) {
    throw new Error(
      translate(
        'session.versionedUnavailable',
        'This runtime needs an update to save workspace sessions safely.'
      )
    )
  }
  return new ShellSessionClient(await openRuntimeProtocolTarget(target))
}

export const shellSettingsApi: ShellSettingsApi = {
  get: async () => {
    const client = await requireSettingsDocumentClient()
    const settings = (await client.getDocument()) as GlobalSettings
    settingsSnapshot = settings
    return settings
  },
  getSnapshot: () => settingsSnapshot,
  set: async (updates) => {
    const client = await requireSettingsDocumentClient()
    const settings = (await client.setDocument({ ...updates })) as GlobalSettings
    settingsSnapshot = settings
    return settings
  },
  updatePRBotAuthorOverride: async (args) => {
    const client = await requireSettingsDocumentClient()
    // Why: the override stays a single authoritative server-side write; its
    // response only carries the nine-field snapshot, so the refreshed full
    // document comes from a follow-up read.
    await client.updatePRBotAuthorOverride(args)
    const settings = (await client.getDocument()) as GlobalSettings
    settingsSnapshot = settings
    return settings
  }
}

const sessionDocuments = new SessionDocumentClient(requireShellSessionClient)

export const shellSessionApi: ShellSessionApi = {
  subscribe: (listener) =>
    sessionDocuments.subscribe(
      (session, hostId) => listener(session as WorkspaceSessionState, hostId),
      prepareSessionProjection
    ),
  get: async (hostId) => (await sessionDocuments.get(hostId)) as WorkspaceSessionState,
  set: (session, hostId) =>
    sessionDocuments.write(session as ShellSessionDocumentValue, hostId, false),
  patch: (patch, hostId) =>
    sessionDocuments.write(patch as ShellSessionDocumentValue, hostId, true),
  flush: () => sessionDocuments.flush()
}

export const shellOnboardingApi: ShellOnboardingApi = {
  get: async () => (await requireShellOnboardingClient()).get(),
  update: async (updates) => (await requireShellOnboardingClient()).update(updates)
}

export const shellCacheApi: ShellCacheApi = {
  getGitHub: async () => {
    const cache = await (await requireShellCacheClient()).getGitHub()
    const pr: ShellGitHubCache['pr'] = {}
    for (const [key, entry] of Object.entries(cache.pr)) {
      // Why: the PR payload is the raw GitHub API document the cache authority
      // never inspects field-by-field, so the open JSON reattaches the
      // workbench type at this boundary.
      pr[key] = {
        data: entry.data as ShellGitHubCache['pr'][string]['data'],
        fetchedAt: entry.fetchedAt
      }
    }
    return { pr }
  },
  setGitHub: (args) => {
    const cache = args.cache
    return requireShellCacheClient().then((client) =>
      client.setGitHub({
        cache: {
          pr: Object.fromEntries(
            Object.entries(cache.pr).map(([key, entry]) => [
              key,
              // Why: the PR payload is the open GitHub document, so the workbench
              // type reattaches only after the plain-JSON wire round trip.
              { data: entry.data as ShellCachePlainJsonValue, fetchedAt: entry.fetchedAt }
            ])
          )
        }
      })
    )
  }
}

// Why: shell.cache and shell.onboarding are LOCAL-only by contract, so their
// clients anchor to the fixed local rendering shell, never the active
// environment — and a missing capability means the daemon predates the
// cutover, an error rather than a legacy retry.
async function requireShellCacheClient(): Promise<ShellCacheClient> {
  const target = { kind: 'local' } as const
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(SHELL_CACHE_PROTOCOL_CAPABILITY)) {
    throw new Error('shell.cache.protobuf.v1 capability is not available')
  }
  return new ShellCacheClient(await openRuntimeProtocolTarget(target))
}

async function requireShellOnboardingClient(): Promise<ShellOnboardingClient> {
  const target = { kind: 'local' } as const
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(SHELL_ONBOARDING_PROTOCOL_CAPABILITY)) {
    throw new Error('shell.onboarding.protobuf.v1 capability is not available')
  }
  return new ShellOnboardingClient(await openRuntimeProtocolTarget(target))
}
