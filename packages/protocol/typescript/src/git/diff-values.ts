import {
  GitDiffKind,
  GitDiffLimitReason,
  type GitDiffResult as ProtocolDiffResult
} from '../../generated/agent_start/runtime/v1/git_common_pb.js'

export type DiffLineCounts = { original: number; modified: number }
export type DiffLineCountMinimums = { original: boolean; modified: boolean }
export type LargeDiffRenderLimit = {
  limited: true
  reason: 'line-count' | 'character-count'
  lineCounts: DiffLineCounts | null
  lineCountsAreMinimum?: DiffLineCountMinimums
  characterCount: number
  limits: { maxLinesPerSide: number; maxCombinedCharacters: number }
}

export type GitDiffTextResult = {
  kind: 'text'
  originalContent: string
  modifiedContent: string
  originalIsBinary: false
  modifiedIsBinary: false
  largeDiffRenderLimit?: LargeDiffRenderLimit
}

// Why: the renderer treats "exactly which side is binary" as proven wire data,
// so the binary result keeps the same at-least-one-side-true union the workbench
// runtime type uses instead of two loose booleans.
export type GitDiffBinaryResult = {
  kind: 'binary'
  originalContent: string
  modifiedContent: string
  isImage?: boolean
  mimeType?: string
  modifiedDeleted?: boolean
} & (
  | { originalIsBinary: true; modifiedIsBinary: boolean }
  | {
      originalIsBinary: boolean
      modifiedIsBinary: true
    }
)

export type GitDiffResult = GitDiffTextResult | GitDiffBinaryResult

export function gitDiffResultFromProto(diff: ProtocolDiffResult): GitDiffResult {
  if (diff.kind === GitDiffKind.BINARY) {
    const base = {
      kind: 'binary' as const,
      originalContent: diff.originalContent,
      modifiedContent: diff.modifiedContent,
      ...(diff.isImage !== undefined ? { isImage: diff.isImage } : {}),
      ...(diff.mimeType ? { mimeType: diff.mimeType } : {}),
      ...(diff.modifiedDeleted !== undefined ? { modifiedDeleted: diff.modifiedDeleted } : {})
    }
    // Why: the daemon only sends kind=binary when at least one side is binary,
    // so the fallback pins the guaranteed flag instead of widening to boolean.
    return diff.originalIsBinary
      ? { ...base, originalIsBinary: true, modifiedIsBinary: diff.modifiedIsBinary }
      : { ...base, originalIsBinary: diff.originalIsBinary, modifiedIsBinary: true }
  }
  const limit = diff.largeDiffRenderLimit
  return {
    kind: 'text',
    originalContent: diff.originalContent,
    modifiedContent: diff.modifiedContent,
    originalIsBinary: false,
    modifiedIsBinary: false,
    ...(limit
      ? {
          largeDiffRenderLimit: {
            limited: true,
            reason:
              limit.reason === GitDiffLimitReason.LINE_COUNT ? 'line-count' : 'character-count',
            lineCounts: limit.lineCounts
              ? {
                  original: Number(limit.lineCounts.original),
                  modified: Number(limit.lineCounts.modified)
                }
              : null,
            ...(limit.lineCountsAreMinimum
              ? {
                  lineCountsAreMinimum: {
                    original: limit.lineCountsAreMinimum.original,
                    modified: limit.lineCountsAreMinimum.modified
                  }
                }
              : {}),
            characterCount: Number(limit.characterCount),
            limits: {
              maxLinesPerSide: Number(limit.limits?.maxLinesPerSide ?? 0),
              maxCombinedCharacters: Number(limit.limits?.maxCombinedCharacters ?? 0)
            }
          }
        }
      : {})
  }
}
