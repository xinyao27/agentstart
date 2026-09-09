import type { DaemonConnectionSettings } from '@yiru/client/extension-settings'

import type { NativeBootstrapResult } from './background/native-bootstrap'
import { readEnterprisePolicy } from './enterprise-policy'

const CURRENT_PROTOCOL_VERSION = 2
const ENDPOINT_KEY = 'daemonEndpoint'
const TOKEN_KEY = 'daemonAuthToken'
const PROTOCOL_VERSION_KEY = 'daemonProtocolVersion'
const RPC_PROTOCOL = 'yiru-protobuf-v2' satisfies NativeBootstrapResult['rpcProtocol']

export async function readDaemonConnectionSettings(): Promise<DaemonConnectionSettings> {
  const [synced, session, local, policy] = await Promise.all([
    chrome.storage.sync.get(ENDPOINT_KEY),
    chrome.storage.session.get(TOKEN_KEY),
    chrome.storage.local.get([TOKEN_KEY, PROTOCOL_VERSION_KEY]),
    readEnterprisePolicy()
  ])
  const sessionToken = readString(session, TOKEN_KEY)
  const legacyToken = readString(local, TOKEN_KEY)
  if (!sessionToken && legacyToken) {
    await chrome.storage.session.set({ [TOKEN_KEY]: legacyToken })
  }
  if (legacyToken) {
    await chrome.storage.local.remove(TOKEN_KEY)
  }
  return {
    authToken: sessionToken ?? legacyToken ?? '',
    endpoint: policy.daemonEndpoint ?? readString(synced, ENDPOINT_KEY) ?? '',
    protocolVersion:
      policy.protocolVersion ?? readNumber(local, PROTOCOL_VERSION_KEY) ?? CURRENT_PROTOCOL_VERSION
  }
}

export async function readCustomRuntimeBootstrap(): Promise<NativeBootstrapResult | null> {
  const settings = await readDaemonConnectionSettings()
  if (!settings.endpoint || !settings.authToken) {
    return null
  }
  validateSettings(settings)
  return {
    ...settings,
    expectedRuntimeId: null,
    rpcProtocol: RPC_PROTOCOL
  }
}

export async function saveDaemonConnectionSettings(
  settings: DaemonConnectionSettings
): Promise<void> {
  validateSettings(settings)
  const policy = await readEnterprisePolicy()
  if (policy.daemonEndpoint && settings.endpoint !== policy.daemonEndpoint) {
    throw new Error('daemon_endpoint_managed')
  }
  if (policy.protocolVersion && settings.protocolVersion !== policy.protocolVersion) {
    throw new Error('daemon_protocol_version_managed')
  }
  await Promise.all([
    chrome.storage.sync.set({ [ENDPOINT_KEY]: settings.endpoint.trim() }),
    chrome.storage.session.set({ [TOKEN_KEY]: settings.authToken.trim() }),
    chrome.storage.local.set({ [PROTOCOL_VERSION_KEY]: settings.protocolVersion })
  ])
  await chrome.storage.local.remove(TOKEN_KEY)
}

export async function clearDaemonConnectionSettings(): Promise<void> {
  await Promise.all([
    chrome.storage.sync.remove(ENDPOINT_KEY),
    chrome.storage.session.remove(TOKEN_KEY),
    chrome.storage.local.remove([TOKEN_KEY, PROTOCOL_VERSION_KEY])
  ])
}

function validateSettings(settings: DaemonConnectionSettings): void {
  const endpoint = new URL(settings.endpoint.trim())
  if (
    (endpoint.protocol !== 'ws:' && endpoint.protocol !== 'wss:') ||
    !settings.authToken.trim() ||
    !Number.isInteger(settings.protocolVersion) ||
    settings.protocolVersion !== CURRENT_PROTOCOL_VERSION
  ) {
    throw new Error('daemon_connection_settings_invalid')
  }
}

function readString(value: object, key: string): string | null {
  const entry = Reflect.get(value, key)
  return typeof entry === 'string' ? entry : null
}

function readNumber(value: object, key: string): number | null {
  const entry = Reflect.get(value, key)
  return typeof entry === 'number' ? entry : null
}
