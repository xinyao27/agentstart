import {
  SkillDirectoryErrorReason,
  SkillFileErrorReason,
  type SkillDirectoryListing as ProtocolDirectoryListing,
  type SkillFileReadResult as ProtocolFileReadResult
} from '../../generated/yiru/runtime/v1/skills_pb.js'
import { invalidResponse } from './discovery-values.js'

export type SkillDirectoryEntry = { relativePath: string; size: number }

export type SkillDirectoryListing =
  | { ok: true; files: SkillDirectoryEntry[]; truncated: boolean }
  | { ok: false; reason: 'invalid-path' | 'unreadable' }

export type SkillFileReadResult =
  | { ok: true; content: string; truncated: boolean }
  | { ok: false; reason: 'invalid-path' | 'unreadable' | 'binary' }

export function decodeDirectoryListing(
  listing: ProtocolDirectoryListing | undefined
): SkillDirectoryListing {
  const result = listing?.result
  if (!result) {
    throw invalidResponse('Skill directory listing is missing')
  }
  switch (result.case) {
    case 'ok':
      return {
        ok: true,
        files: result.value.files.map((entry) => ({
          relativePath: entry.relativePath,
          size: Number(entry.size)
        })),
        truncated: result.value.truncated
      }
    case 'error':
      return { ok: false, reason: directoryErrorReason(result.value) }
  }
  throw invalidResponse('Skill directory listing is unknown')
}

export function decodeFileReadResult(
  result: ProtocolFileReadResult | undefined
): SkillFileReadResult {
  const read = result?.result
  if (!read) {
    throw invalidResponse('Skill file read result is missing')
  }
  switch (read.case) {
    case 'ok':
      return { ok: true, content: read.value.content, truncated: read.value.truncated }
    case 'error':
      return { ok: false, reason: fileErrorReason(read.value) }
  }
  throw invalidResponse('Skill file read result is unknown')
}

function directoryErrorReason(value: number): 'invalid-path' | 'unreadable' {
  switch (value) {
    case SkillDirectoryErrorReason.INVALID_PATH:
      return 'invalid-path'
    case SkillDirectoryErrorReason.UNREADABLE:
      return 'unreadable'
    case SkillDirectoryErrorReason.UNSPECIFIED:
      throw invalidResponse('Skill directory error reason is missing')
  }
  throw invalidResponse('Skill directory error reason is unknown')
}

function fileErrorReason(value: number): 'invalid-path' | 'unreadable' | 'binary' {
  switch (value) {
    case SkillFileErrorReason.INVALID_PATH:
      return 'invalid-path'
    case SkillFileErrorReason.UNREADABLE:
      return 'unreadable'
    case SkillFileErrorReason.BINARY:
      return 'binary'
    case SkillFileErrorReason.UNSPECIFIED:
      throw invalidResponse('Skill file error reason is missing')
  }
  throw invalidResponse('Skill file error reason is unknown')
}
