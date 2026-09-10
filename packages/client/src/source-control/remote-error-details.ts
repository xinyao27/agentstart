import {
  formatSubmodulePushFailureDetail,
  stripCredentialsFromMessage
} from '@agentstart/protocol/git/remote-error'
import { translate } from '~renderer/i18n/i18n'

const REMOTE_OPERATION_DETAIL_MAX_LENGTH = 200

// Why: arbitrarily long git stderr lines (for instance, a multi-kilobyte
// server-side pre-receive hook message) should not blow up the toast. Cap the
// detail length so the toast stays readable; the underlying error is still
// rethrown for console/logs if a caller needs the full payload.
export function truncateDetail(detail: string): string {
  if (detail.length <= REMOTE_OPERATION_DETAIL_MAX_LENGTH) {
    return detail
  }
  return `${detail.slice(0, REMOTE_OPERATION_DETAIL_MAX_LENGTH).trimEnd()}...`
}

export function extractPublishFailureDetail(message: string): string | null {
  let remoteDetail: string | null = null

  for (const rawLine of iterateRemoteErrorLines(message)) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }
    if (line.startsWith('fatal:')) {
      return truncateDetail(stripCredentialsFromMessage(line.slice('fatal:'.length).trim()))
    }
    if (remoteDetail === null && line.startsWith('remote:')) {
      remoteDetail = truncateDetail(
        stripCredentialsFromMessage(line.slice('remote:'.length).trim())
      )
    }
  }

  return remoteDetail
}

function* iterateRemoteErrorLines(message: string): Generator<string> {
  let lineStart = 0

  for (let index = 0; index < message.length; index++) {
    const code = message.charCodeAt(index)
    if (code !== 10 && code !== 13) {
      continue
    }

    yield message.slice(lineStart, index)
    if (code === 13 && message.charCodeAt(index + 1) === 10) {
      index++
    }
    lineStart = index + 1
  }

  if (lineStart <= message.length) {
    yield message.slice(lineStart)
  }
}

export function resolveSubmodulePushFailureMessage(
  message: string,
  operationLabel: string
): string | null {
  const detail = formatSubmodulePushFailureDetail(message)
  return detail
    ? translate('sourceControl.remoteError.e240e8af17', '{{operationLabel}} failed. {{detail}}', {
        operationLabel,
        detail: truncateDetail(detail)
      })
    : null
}
