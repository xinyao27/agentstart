import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  BrowserReplayEventKind as ProtocolReplayEventKind,
  type BrowserReplayRecording as ProtocolReplayRecording
} from '../generated/yiru/runtime/v1/browser_replay_pb.js'
import { RuntimeProtocolError } from './error.js'

export const BROWSER_REPLAY_PROTOCOL_CAPABILITY = 'browserReplay.protobuf.v1' as const

export type BrowserReplayEventKind = 'click' | 'input' | 'keydown'

export type BrowserReplayEvent = {
  at: number
  key?: string
  kind: BrowserReplayEventKind
  selector: string
  value?: string
}

export type BrowserReplayRecording = {
  createdAt: number
  endedAt: number
  events: BrowserReplayEvent[]
  id: string
  pageTitle: string
  pageUrl: string
  projectId: string
  startedAt: number
  videoArtifactId?: string
}

export function replayEventKind(kind: ProtocolReplayEventKind): BrowserReplayEventKind {
  switch (kind) {
    case ProtocolReplayEventKind.CLICK:
      return 'click'
    case ProtocolReplayEventKind.INPUT:
      return 'input'
    case ProtocolReplayEventKind.KEYDOWN:
      return 'keydown'
    case ProtocolReplayEventKind.UNSPECIFIED:
      throw invalidResponse('Browser replay event kind is unspecified')
  }
  throw invalidResponse('Browser replay event kind is unknown')
}

export function encodeReplayEventKind(kind: BrowserReplayEventKind): ProtocolReplayEventKind {
  switch (kind) {
    case 'click':
      return ProtocolReplayEventKind.CLICK
    case 'input':
      return ProtocolReplayEventKind.INPUT
    case 'keydown':
      return ProtocolReplayEventKind.KEYDOWN
  }
}

export function browserReplayRecording(
  recording: ProtocolReplayRecording | undefined
): BrowserReplayRecording {
  if (!recording) {
    throw invalidResponse('Browser replay recording is missing')
  }
  return {
    createdAt: Number(recording.createdAt),
    endedAt: recording.endedAt,
    events: recording.events.map((event) => ({
      at: event.at,
      key: event.key,
      kind: replayEventKind(event.kind),
      selector: event.selector,
      value: event.value
    })),
    id: recording.id,
    pageTitle: recording.pageTitle,
    pageUrl: recording.pageUrl,
    projectId: recording.projectId,
    startedAt: recording.startedAt,
    videoArtifactId: recording.videoArtifactId
  }
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
