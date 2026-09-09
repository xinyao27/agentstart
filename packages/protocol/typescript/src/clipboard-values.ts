import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import type {
  ClipboardServiceChunkReceivedResponse,
  ClipboardServiceSavedImagePathResponse,
  ClipboardServiceUploadStartedResponse
} from '../generated/yiru/runtime/v1/clipboard_pb.js'
import { RuntimeProtocolError } from './error.js'

export const CLIPBOARD_PROTOCOL_CAPABILITY = 'clipboard.protobuf.v1' as const

export function clipboardUploadId(response: ClipboardServiceUploadStartedResponse): string {
  return requiredText(response.uploadId, 'Clipboard upload ID')
}

export function clipboardChunkReceivedLength(
  response: ClipboardServiceChunkReceivedResponse
): number {
  const length = Number(response.receivedBase64Length)
  if (!Number.isSafeInteger(length) || length < 0) {
    throw invalidResponse('Clipboard chunk length is outside the nonnegative integer range')
  }
  return length
}

export function clipboardSavedImagePath(response: ClipboardServiceSavedImagePathResponse): string {
  return requiredText(response.path, 'Clipboard image path')
}

function requiredText(value: string, label: string): string {
  if (value.length === 0) {
    throw invalidResponse(`${label} is missing`)
  }
  return value
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
