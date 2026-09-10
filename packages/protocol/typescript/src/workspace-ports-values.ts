import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  WorkspacePortsAttributionConfidence as ProtocolConfidence,
  WorkspacePortsPlatform as ProtocolPlatform,
  WorkspacePortsProtocol as ProtocolProtocol,
  type WorkspacePortsPort as ProtocolPort,
  type WorkspacePortsServiceEvent as ProtocolEvent,
  type WorkspacePortsServiceKillResponse as ProtocolKillResponse,
  type WorkspacePortsServiceScanResponse as ProtocolScanResponse
} from '../generated/agent_start/runtime/v1/workspace_ports_pb.js'
import { RuntimeProtocolError } from './error.js'

export const WORKSPACE_PORTS_PROTOCOL_CAPABILITY = 'workspacePorts.protobuf.v1' as const

export type WorkspacePortAttributionConfidence = 'cwd' | 'command' | 'none'

export type WorkspacePortOwner = {
  worktreeId: string
  repoId: string
  displayName: string
  path: string
  confidence: WorkspacePortAttributionConfidence
}

export type WorkspacePortAdvertisedUrlChangedEvent = {
  type: 'advertisedUrlChanged'
  worktreeId: string
  port: number
}

export type WorkspacePortSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string }
  | WorkspacePortAdvertisedUrlChangedEvent
  | { type: 'end' }

type WorkspacePortBase = {
  id: string
  bindHost: string
  connectHost: string
  port: number
  pid?: number
  processName?: string
  protocol: 'http' | 'https' | 'unknown'
}

export type WorkspacePort =
  | (WorkspacePortBase & {
      kind: 'workspace'
      owner: WorkspacePortOwner
      advertisedUrl?: string
    })
  | (WorkspacePortBase & { kind: 'container' })
  | (WorkspacePortBase & { kind: 'external' })

export type WorkspacePortScanResult = {
  platform:
    | 'aix'
    | 'android'
    | 'cygwin'
    | 'darwin'
    | 'freebsd'
    | 'haiku'
    | 'linux'
    | 'netbsd'
    | 'openbsd'
    | 'sunos'
    | 'win32'
    | 'unknown'
  scannedAt: number
  ports: WorkspacePort[]
  unavailableReason?: string
}

export type WorkspacePortKillResult = { ok: true } | { ok: false; reason: string }

export function decodeWorkspacePortScan(response: ProtocolScanResponse): WorkspacePortScanResult {
  return {
    platform: platform(response.platform),
    scannedAt: milliseconds(response.scannedAt, 'Port scan time'),
    ports: response.ports.map(decodePort),
    ...(response.unavailableReason ? { unavailableReason: response.unavailableReason } : {})
  }
}

export function decodeWorkspacePortKill(response: ProtocolKillResponse): WorkspacePortKillResult {
  return response.ok ? { ok: true } : { ok: false, reason: response.reason ?? '' }
}

export function decodeWorkspacePortEvent(
  event: ProtocolEvent
): WorkspacePortSubscriptionEvent | null {
  switch (event.event.case) {
    case 'ready':
      return {
        type: 'ready',
        subscriptionId: requiredIdentity(event.event.value.subscriptionId, 'Ports subscription ID')
      }
    case 'advertisedUrlChanged':
      return {
        type: 'advertisedUrlChanged',
        worktreeId: requiredIdentity(
          event.event.value.worktreeId,
          'Advertised URL change worktree ID'
        ),
        port: event.event.value.port
      }
    case 'end':
      return { type: 'end' }
    case undefined:
      return null
  }
}

function decodePort(port: ProtocolPort): WorkspacePort {
  const base: WorkspacePortBase = {
    id: requiredIdentity(port.id, 'Workspace port ID'),
    bindHost: port.bindHost,
    connectHost: port.connectHost,
    port: port.port,
    ...(port.pid === undefined ? {} : { pid: port.pid }),
    ...(port.processName ? { processName: port.processName } : {}),
    protocol: protocol(port.protocol)
  }
  const classification = port.classification?.kind
  switch (classification?.case) {
    case 'workspace': {
      if (!classification.value.owner) {
        throw invalidResponse('Workspace port attribution is missing its owner')
      }
      const owner = classification.value.owner
      return {
        ...base,
        kind: 'workspace',
        owner: {
          worktreeId: requiredIdentity(owner.worktreeId, 'Workspace port owner worktree ID'),
          repoId: owner.repoId,
          displayName: owner.displayName,
          path: owner.path,
          confidence: confidence(owner.confidence)
        },
        ...(classification.value.advertisedUrl
          ? { advertisedUrl: classification.value.advertisedUrl }
          : {})
      }
    }
    case 'container':
      return { ...base, kind: 'container' }
    case 'external':
      return { ...base, kind: 'external' }
    case undefined:
      throw invalidResponse('Workspace port classification is missing')
  }
}

// Why: the wire mirrors the OS platform census, but the renderer consumes
// Node's platform spelling, so Windows keeps its `win32` label.
function platform(value: ProtocolPlatform): WorkspacePortScanResult['platform'] {
  switch (value) {
    case ProtocolPlatform.AIX:
      return 'aix'
    case ProtocolPlatform.ANDROID:
      return 'android'
    case ProtocolPlatform.CYGWIN:
      return 'cygwin'
    case ProtocolPlatform.DARWIN:
      return 'darwin'
    case ProtocolPlatform.FREEBSD:
      return 'freebsd'
    case ProtocolPlatform.HAIKU:
      return 'haiku'
    case ProtocolPlatform.LINUX:
      return 'linux'
    case ProtocolPlatform.NETBSD:
      return 'netbsd'
    case ProtocolPlatform.OPENBSD:
      return 'openbsd'
    case ProtocolPlatform.SUNOS:
      return 'sunos'
    case ProtocolPlatform.WINDOWS:
      return 'win32'
    case ProtocolPlatform.UNKNOWN:
    case ProtocolPlatform.UNSPECIFIED:
      return 'unknown'
  }
}

function protocol(value: ProtocolProtocol): WorkspacePortBase['protocol'] {
  switch (value) {
    case ProtocolProtocol.HTTP:
      return 'http'
    case ProtocolProtocol.HTTPS:
      return 'https'
    case ProtocolProtocol.UNKNOWN:
    case ProtocolProtocol.UNSPECIFIED:
      return 'unknown'
  }
}

function confidence(value: ProtocolConfidence): WorkspacePortAttributionConfidence {
  switch (value) {
    case ProtocolConfidence.COMMAND:
      return 'command'
    case ProtocolConfidence.CWD:
      return 'cwd'
    case ProtocolConfidence.NONE:
    case ProtocolConfidence.UNSPECIFIED:
      return 'none'
  }
}

function milliseconds(value: bigint, label: string): number {
  if (value < 0n) {
    throw invalidResponse(`${label} is negative`)
  }
  return Number(value)
}

function requiredIdentity(value: string, label: string): string {
  if (value.length === 0) {
    throw invalidResponse(`${label} is missing`)
  }
  return value
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
