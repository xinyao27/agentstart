import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import type { ProjectHostSetupJsonValue } from '../generated/yiru/runtime/v1/project_host_setup_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RepoIconValue } from './repo-types.js'

export type ProjectHostSetupPlainJsonValue =
  | null
  | boolean
  | number
  | string
  | ProjectHostSetupPlainJsonValue[]
  | { [key: string]: ProjectHostSetupPlainJsonValue }

// Why: the proto carries the legacy open-shaped repoIcon as a recursive typed
// JSON value, so the decoder rebuilds the discriminated icon union the legacy
// zod contract validated instead of handing callers untyped JSON.
export function projectHostSetupRepoIcon(
  value: ProjectHostSetupJsonValue | undefined
): RepoIconValue | undefined {
  if (value === undefined) {
    return undefined
  }
  const plain = plainJson(value)
  if (!isRecord(plain)) {
    throw invalidResponse('Project host setup repo icon is malformed')
  }
  if (plain.type === 'lucide' && typeof plain.name === 'string') {
    return { type: 'lucide', name: plain.name }
  }
  if (plain.type === 'emoji' && typeof plain.emoji === 'string') {
    return { type: 'emoji', emoji: plain.emoji }
  }
  if (plain.type === 'image' && typeof plain.src === 'string' && isImageSource(plain.source)) {
    return typeof plain.label === 'string'
      ? { type: 'image', src: plain.src, source: plain.source, label: plain.label }
      : { type: 'image', src: plain.src, source: plain.source }
  }
  throw invalidResponse('Project host setup repo icon is malformed')
}

function plainJson(value: ProjectHostSetupJsonValue): ProjectHostSetupPlainJsonValue {
  const kind = value.kind
  switch (kind.case) {
    case undefined:
      return null
    case 'nullValue':
      return null
    case 'boolValue':
      return kind.value
    case 'numberValue':
      return kind.value
    case 'stringValue':
      return kind.value
    case 'listValue':
      return kind.value.values.map(plainJson)
    case 'objectValue':
      return Object.fromEntries(
        kind.value.entries.map((entry) => [
          entry.key,
          entry.value === undefined ? null : plainJson(entry.value)
        ])
      )
  }
}

function isImageSource(
  value: ProjectHostSetupPlainJsonValue
): value is 'upload' | 'file' | 'favicon' | 'github' {
  return value === 'upload' || value === 'file' || value === 'favicon' || value === 'github'
}

function isRecord(
  value: ProjectHostSetupPlainJsonValue
): value is Record<string, ProjectHostSetupPlainJsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
