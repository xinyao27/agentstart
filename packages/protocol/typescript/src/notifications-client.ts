import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  DismissRequestSchema,
  DismissResponseSchema,
  LoadCustomSoundRequestSchema,
  LoadCustomSoundResponseSchema,
  NotificationsService,
  NotificationSoundUnavailableReason as ProtocolUnavailableReason,
  ReportRequestSchema,
  ReportResponseSchema,
  NotificationReportReason as ProtocolReportReason,
  NotificationSource as ProtocolNotificationSource,
  type NotificationSource
} from '../generated/agent_start/runtime/v1/notifications_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const LOAD_CUSTOM_SOUND_PROCEDURE = `/${NotificationsService.typeName}/${NotificationsService.method.loadCustomSound.name}`
const DISMISS_PROCEDURE = `/${NotificationsService.typeName}/${NotificationsService.method.dismiss.name}`
const REPORT_PROCEDURE = `/${NotificationsService.typeName}/${NotificationsService.method.report.name}`

export const NOTIFICATIONS_PROTOCOL_CAPABILITY = 'notifications.protobuf.v1' as const
const MAX_ASSET_BYTES = 10 * 1024 * 1024
const MAX_CHUNK_BYTES = 256 * 1024
const ASSET_ID_PATTERN = /^sha256:[0-9a-f]{64}$/
const SUPPORTED_MIME_TYPES = new Set([
  'audio/aac',
  'audio/flac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav'
])

export type NotificationSoundUnavailableReason =
  | 'missing-path'
  | 'invalid-path'
  | 'unsupported-type'
  | 'too-large'
  | 'read-failed'

export type NotificationReportSource = 'agent-task-complete' | 'terminal-bell' | 'test'

export type NotificationReportReason =
  | 'disabled'
  | 'source-disabled'
  | 'cooldown'
  | 'shell-unavailable'
  | 'suppressed-focus'
  | 'not-supported'
  | 'not-displayed'
  | 'blocked-by-system'

export type NotificationReportInput = Readonly<{
  source: NotificationReportSource
  notificationId?: string
  requireDisplayConfirmation?: boolean
  worktreeId?: string
  paneKey?: string
  repoLabel?: string
  worktreeLabel?: string
  hasMultipleActiveRepos?: boolean
  terminalTitle?: string
  isActiveWorktree?: boolean
  agentType?: string
  agentState?: string
  agentPrompt?: string
  agentToolName?: string
  agentToolInput?: string
  agentLastAssistantMessage?: string
  agentInterrupted?: boolean
}>

export type NotificationReportResult = Readonly<{
  delivered: boolean
  reason: NotificationReportReason | null
}>

export type NotificationDismissResult = Readonly<{ dismissed: number }>

export type NotificationSoundLoadResult =
  | { state: 'loaded'; assetId: string; data: Uint8Array; mimeType: string }
  | { state: 'not-modified' }
  | { state: 'unavailable'; reason: NotificationSoundUnavailableReason }

export class NotificationsClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async loadCustomSound(
    cachedAssetId?: string,
    options?: RuntimeCallOptions
  ): Promise<NotificationSoundLoadResult> {
    if (cachedAssetId !== undefined && !ASSET_ID_PATTERN.test(cachedAssetId)) {
      throw invalidResponse('Notification sound cache identity is invalid')
    }
    const stream = await this.transport.subscribe({
      method: LOAD_CUSTOM_SOUND_PROCEDURE,
      payload: toBinary(
        LoadCustomSoundRequestSchema,
        create(LoadCustomSoundRequestSchema, { cachedAssetId })
      ),
      ...(options ? { options } : {})
    })
    let assetId: string | null = null
    let buffer: Uint8Array | null = null
    let mimeType: string | null = null
    let offset = 0
    let terminal: NotificationSoundLoadResult | null = null
    for await (const payload of stream.events) {
      const response = fromBinary(LoadCustomSoundResponseSchema, payload)
      switch (response.event.case) {
        case 'start': {
          if (assetId !== null || terminal !== null || offset !== 0) {
            throw invalidResponse('Notification sound stream sent an out-of-order start')
          }
          const start = response.event.value
          if (!ASSET_ID_PATTERN.test(start.assetId)) {
            throw invalidResponse('Notification sound asset identity is invalid')
          }
          if (!SUPPORTED_MIME_TYPES.has(start.mimeType)) {
            throw invalidResponse('Notification sound MIME type is invalid')
          }
          if (start.byteLength <= 0 || start.byteLength > BigInt(MAX_ASSET_BYTES)) {
            throw invalidResponse('Notification sound byte length is invalid')
          }
          assetId = start.assetId
          mimeType = start.mimeType
          buffer = new Uint8Array(Number(start.byteLength))
          break
        }
        case 'chunk': {
          const chunk = response.event.value.data
          if (!buffer || terminal !== null || chunk.byteLength === 0) {
            throw invalidResponse('Notification sound stream sent an out-of-order chunk')
          }
          if (chunk.byteLength > MAX_CHUNK_BYTES || offset + chunk.byteLength > buffer.byteLength) {
            throw invalidResponse('Notification sound stream exceeded its declared byte length')
          }
          buffer.set(chunk, offset)
          offset += chunk.byteLength
          break
        }
        case 'notModified':
          if (
            assetId !== null ||
            terminal !== null ||
            offset !== 0 ||
            cachedAssetId === undefined
          ) {
            throw invalidResponse('Notification sound stream sent an invalid cache result')
          }
          terminal = { state: 'not-modified' }
          break
        case 'unavailable':
          if (assetId !== null || terminal !== null || offset !== 0) {
            throw invalidResponse('Notification sound stream sent an out-of-order failure')
          }
          terminal = {
            state: 'unavailable',
            reason: unavailableReason(response.event.value.reason)
          }
          break
        case undefined:
          throw invalidResponse('Notification sound stream sent an empty event')
      }
    }
    if (terminal) {
      return terminal
    }
    if (!assetId || !mimeType || !buffer || offset !== buffer.byteLength) {
      throw invalidResponse('Notification sound stream closed before the asset was complete')
    }
    return { state: 'loaded', assetId, data: buffer, mimeType }
  }

  async dismiss(
    notificationIds: readonly string[],
    options?: RuntimeCallOptions
  ): Promise<NotificationDismissResult> {
    const response = await this.transport.unary({
      method: DISMISS_PROCEDURE,
      payload: toBinary(
        DismissRequestSchema,
        create(DismissRequestSchema, { notificationIds: [...notificationIds] })
      ),
      ...(options ? { options } : {})
    })
    return { dismissed: fromBinary(DismissResponseSchema, response).dismissed }
  }

  async report(
    input: NotificationReportInput,
    options?: RuntimeCallOptions
  ): Promise<NotificationReportResult> {
    const response = await this.transport.unary({
      method: REPORT_PROCEDURE,
      payload: toBinary(
        ReportRequestSchema,
        create(ReportRequestSchema, {
          source: reportSource(input.source),
          agentInterrupted: input.agentInterrupted,
          agentLastAssistantMessage: input.agentLastAssistantMessage,
          agentPrompt: input.agentPrompt,
          agentState: input.agentState,
          agentToolInput: input.agentToolInput,
          agentToolName: input.agentToolName,
          agentType: input.agentType,
          hasMultipleActiveRepos: input.hasMultipleActiveRepos,
          isActiveWorktree: input.isActiveWorktree,
          notificationId: input.notificationId,
          paneKey: input.paneKey,
          repoLabel: input.repoLabel,
          requireDisplayConfirmation: input.requireDisplayConfirmation,
          terminalTitle: input.terminalTitle,
          worktreeId: input.worktreeId,
          worktreeLabel: input.worktreeLabel
        })
      ),
      ...(options ? { options } : {})
    })
    const decoded = fromBinary(ReportResponseSchema, response)
    return { delivered: decoded.delivered, reason: reportReason(decoded.reason) }
  }
}

function reportSource(source: NotificationReportSource): NotificationSource {
  switch (source) {
    case 'agent-task-complete':
      return ProtocolNotificationSource.AGENT_TASK_COMPLETE
    case 'terminal-bell':
      return ProtocolNotificationSource.TERMINAL_BELL
    case 'test':
      return ProtocolNotificationSource.TEST
  }
}

function reportReason(reason: ProtocolReportReason | undefined): NotificationReportReason | null {
  switch (reason) {
    case undefined:
    case ProtocolReportReason.UNSPECIFIED:
      return null
    case ProtocolReportReason.DISABLED:
      return 'disabled'
    case ProtocolReportReason.SOURCE_DISABLED:
      return 'source-disabled'
    case ProtocolReportReason.COOLDOWN:
      return 'cooldown'
    case ProtocolReportReason.SHELL_UNAVAILABLE:
      return 'shell-unavailable'
    case ProtocolReportReason.SUPPRESSED_FOCUS:
      return 'suppressed-focus'
    case ProtocolReportReason.NOT_SUPPORTED:
      return 'not-supported'
    case ProtocolReportReason.NOT_DISPLAYED:
      return 'not-displayed'
    case ProtocolReportReason.BLOCKED_BY_SYSTEM:
      return 'blocked-by-system'
  }
}

function unavailableReason(value: ProtocolUnavailableReason): NotificationSoundUnavailableReason {
  switch (value) {
    case ProtocolUnavailableReason.MISSING_PATH:
      return 'missing-path'
    case ProtocolUnavailableReason.INVALID_PATH:
      return 'invalid-path'
    case ProtocolUnavailableReason.UNSUPPORTED_TYPE:
      return 'unsupported-type'
    case ProtocolUnavailableReason.TOO_LARGE:
      return 'too-large'
    case ProtocolUnavailableReason.READ_FAILED:
    case ProtocolUnavailableReason.UNSPECIFIED:
      return 'read-failed'
    default:
      return 'read-failed'
  }
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
