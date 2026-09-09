// Why: these spellings are persisted and parsed by every client, including iOS;
// the protocol seam must remain the only place that can mint them.
const RUNTIME_PTY_ID_PREFIX = 'runtime:'
const RUNTIME_PTY_OWNER_SEPARATOR = '@@'
const SSH_PTY_ID_PREFIX = 'ssh:'
const SSH_PTY_ID_SEPARATOR = '@@'

export type DurablePtyId = string & { readonly __durablePtyId: unique symbol }
export type RuntimePtyId = string & { readonly __runtimePtyId: unique symbol }

export type RuntimePtyIdParts = {
  environmentId: string | null
  handle: string
}

export type SshPtyIdParts = {
  connectionId: string
  relayPtyId: string
}

export type ClassifiedTerminalId =
  | ({ id: RuntimePtyId; kind: 'runtime' } & RuntimePtyIdParts)
  | ({ id: DurablePtyId; kind: 'ssh' } & SshPtyIdParts)
  | { id: DurablePtyId; kind: 'durable' }

export type TerminalIdIndex = ReadonlyMap<RuntimePtyId, DurablePtyId>

// Why: the brands have no wire representation; these casts are the single seam
// where validated or classified strings acquire their persistence role.
function durablePtyId(raw: string): DurablePtyId {
  return raw as DurablePtyId
}

function runtimePtyId(raw: string): RuntimePtyId {
  return raw as RuntimePtyId
}

function isCanonicalPart(value: string): boolean {
  return value.length > 0 && value.trim() === value
}

export function encodeRuntimePtyId(handle: string, environmentId?: string | null): RuntimePtyId {
  if (!isCanonicalPart(handle)) {
    throw new Error('runtime_terminal_handle_invalid')
  }
  if (environmentId === undefined || environmentId === null) {
    return runtimePtyId(`${RUNTIME_PTY_ID_PREFIX}${encodeURIComponent(handle)}`)
  }
  if (!isCanonicalPart(environmentId)) {
    throw new Error('runtime_terminal_environment_invalid')
  }
  return runtimePtyId(
    `${RUNTIME_PTY_ID_PREFIX}${encodeURIComponent(environmentId)}${RUNTIME_PTY_OWNER_SEPARATOR}${encodeURIComponent(handle)}`
  )
}

export function parseRuntimePtyId(ptyId: string): RuntimePtyIdParts | null {
  if (!ptyId.startsWith(RUNTIME_PTY_ID_PREFIX)) {
    return null
  }
  const rest = ptyId.slice(RUNTIME_PTY_ID_PREFIX.length)
  const separatorIndex = rest.indexOf(RUNTIME_PTY_OWNER_SEPARATOR)
  let parts: RuntimePtyIdParts
  try {
    parts =
      separatorIndex === -1
        ? { environmentId: null, handle: decodeURIComponent(rest) }
        : {
            environmentId: decodeURIComponent(rest.slice(0, separatorIndex)),
            handle: decodeURIComponent(
              rest.slice(separatorIndex + RUNTIME_PTY_OWNER_SEPARATOR.length)
            )
          }
  } catch {
    return null
  }
  if (
    !isCanonicalPart(parts.handle) ||
    (parts.environmentId !== null && !isCanonicalPart(parts.environmentId))
  ) {
    return null
  }
  const canonicalPtyId = encodeRuntimePtyId(parts.handle, parts.environmentId)
  return canonicalPtyId === ptyId ? parts : null
}

export function isRuntimePtyId(ptyId: string | null | undefined): ptyId is RuntimePtyId {
  return typeof ptyId === 'string' && parseRuntimePtyId(ptyId) !== null
}

export function runtimePtyHandle(ptyId: string): string | null {
  return parseRuntimePtyId(ptyId)?.handle ?? null
}

export function runtimePtyEnvironmentId(ptyId: string): string | null {
  return parseRuntimePtyId(ptyId)?.environmentId ?? null
}

export function parseSshPtyId(ptyId: string): SshPtyIdParts | null {
  if (!ptyId.startsWith(SSH_PTY_ID_PREFIX)) {
    return null
  }
  const separatorIndex = ptyId.indexOf(SSH_PTY_ID_SEPARATOR, SSH_PTY_ID_PREFIX.length)
  if (separatorIndex === -1) {
    return null
  }
  const encodedConnectionId = ptyId.slice(SSH_PTY_ID_PREFIX.length, separatorIndex)
  const relayPtyId = ptyId.slice(separatorIndex + SSH_PTY_ID_SEPARATOR.length)
  if (!encodedConnectionId || !relayPtyId) {
    return null
  }
  try {
    return {
      connectionId: decodeURIComponent(encodedConnectionId),
      relayPtyId
    }
  } catch {
    return null
  }
}

export function encodeSshPtyId(connectionId: string, relayPtyId: string): DurablePtyId {
  const parsed = parseSshPtyId(relayPtyId)
  if (parsed) {
    if (parsed.connectionId !== connectionId) {
      throw new Error(`PTY ${relayPtyId} belongs to SSH connection "${parsed.connectionId}"`)
    }
    return durablePtyId(relayPtyId)
  }
  return durablePtyId(
    `${SSH_PTY_ID_PREFIX}${encodeURIComponent(connectionId)}${SSH_PTY_ID_SEPARATOR}${relayPtyId}`
  )
}

export function relaySshPtyId(connectionId: string, ptyId: string): string {
  const parsed = parseSshPtyId(ptyId)
  if (!parsed) {
    return ptyId
  }
  if (parsed.connectionId !== connectionId) {
    throw new Error(`PTY ${ptyId} belongs to SSH connection "${parsed.connectionId}"`)
  }
  return parsed.relayPtyId
}

export function classifyTerminalId(raw: string): ClassifiedTerminalId {
  const runtime = parseRuntimePtyId(raw)
  if (runtime) {
    return { id: runtimePtyId(raw), kind: 'runtime', ...runtime }
  }
  const ssh = parseSshPtyId(raw)
  if (ssh) {
    return { id: durablePtyId(raw), kind: 'ssh', ...ssh }
  }
  return { id: durablePtyId(raw), kind: 'durable' }
}

export function persistenceTerminalId(id: string, index: TerminalIdIndex): DurablePtyId | null {
  const classified = classifyTerminalId(id)
  switch (classified.kind) {
    case 'runtime':
      return index.get(classified.id) ?? null
    case 'ssh':
    case 'durable':
      return classified.id
  }
}
