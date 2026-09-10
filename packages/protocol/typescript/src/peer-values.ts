import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import type { Status } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  PeerKind,
  ProtocolVersion,
  TransportFeature
} from '../generated/agent_start/protocol/v1/frame_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RuntimePeerInfo } from './transport.js'

export const PROTOCOL_VERSION = ProtocolVersion.V2
export const DEFAULT_TIMEOUT_MS = 30_000
export const INITIAL_CALL_CREDIT_BYTES = 1024 * 1024
export const MAX_FRAME_BYTES = 1024 * 1024
export const MAX_PENDING_RESPONSE_BYTES = 8 * 1024 * 1024
export const MAX_PENDING_REQUEST_BYTES = 8 * 1024 * 1024
export const MAX_PENDING_SEND_BYTES = 16 * 1024 * 1024
export const MAX_PENDING_SEND_BATCHES = 256
export const MAX_LOCALLY_CANCELLED_CALLS = 1024
const MAX_PENDING_CALLS = 128

export function ensureCallAdmission(
  isClosed: boolean,
  isReady: boolean,
  pendingCount: number
): void {
  if (isClosed) {
    throw new RuntimeProtocolError(StatusCode.UNAVAILABLE, 'Runtime connection closed')
  }
  if (!isReady) {
    throw new RuntimeProtocolError(
      StatusCode.UNAVAILABLE,
      'Runtime protocol handshake is incomplete'
    )
  }
  if (pendingCount >= MAX_PENDING_CALLS) {
    throw new RuntimeProtocolError(
      StatusCode.RESOURCE_EXHAUSTED,
      'Runtime protocol has too many pending calls'
    )
  }
}

export function resolvePeerKind(kind: RuntimePeerInfo['kind']): PeerKind {
  switch (kind) {
    case 'chrome-extension':
      return PeerKind.CHROME_EXTENSION
    case 'ios-app':
      return PeerKind.IOS_APP
  }
}

export function resolveTransportFeatures(info: RuntimePeerInfo): readonly TransportFeature[] {
  if (info.kind !== 'chrome-extension') {
    return []
  }
  return info.reverseCalls
    ? [TransportFeature.ROUTED_CALLS, TransportFeature.REVERSE_CALLS]
    : [TransportFeature.ROUTED_CALLS]
}

export function boundedTimeout(timeoutMs: number | undefined, fallbackMs?: number): number {
  const requested = timeoutMs ?? fallbackMs
  if (requested === undefined) {
    return 0
  }
  if (!Number.isFinite(requested)) {
    throw new RuntimeProtocolError(
      StatusCode.INVALID_ARGUMENT,
      'Runtime call timeout must be finite'
    )
  }
  return Math.max(1, Math.min(Math.ceil(requested), 0xffff_ffff))
}

export function statusError(
  status?: Pick<Status, 'code' | 'message'>
): RuntimeProtocolError | null {
  if (!status || status.code === StatusCode.OK_UNSPECIFIED) {
    return null
  }
  const code =
    status.code >= StatusCode.CANCELLED && status.code <= StatusCode.UNAUTHENTICATED
      ? status.code
      : StatusCode.UNKNOWN
  return new RuntimeProtocolError(code, status.message)
}
