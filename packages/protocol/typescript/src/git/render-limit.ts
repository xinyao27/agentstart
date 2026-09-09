import type { DiffLineCounts, LargeDiffRenderLimit as LimitedDiff } from './diff-values'

export const MAX_RENDERED_DIFF_LINES_PER_SIDE = 120_000
export const MAX_RENDERED_DIFF_COMBINED_CHARACTERS = 6_000_000

export type LargeDiffRenderLimitReason = LimitedDiff['reason']
export type LargeDiffRenderLimit =
  | { limited: false; lineCounts: DiffLineCounts; characterCount: number }
  | LimitedDiff

type BoundedLineCount = {
  count: number
  exceeded: boolean
}

export function countLinesEmptyAsZeroUpToLimit(
  content: string,
  maxLines: number
): BoundedLineCount {
  if (content.length === 0) {
    return { count: 0, exceeded: false }
  }

  let lineCount = 1
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) !== 10) {
      continue
    }
    lineCount += 1
    if (lineCount > maxLines) {
      return { count: lineCount, exceeded: true }
    }
  }
  return { count: lineCount, exceeded: false }
}

type LargeDiffRenderLimitInput = {
  originalContent: string
  modifiedContent: string
}

export function getLargeDiffRenderLimit({
  originalContent,
  modifiedContent
}: LargeDiffRenderLimitInput): LargeDiffRenderLimit {
  const characterCount = originalContent.length + modifiedContent.length
  const limits = {
    maxLinesPerSide: MAX_RENDERED_DIFF_LINES_PER_SIDE,
    maxCombinedCharacters: MAX_RENDERED_DIFF_COMBINED_CHARACTERS
  }

  if (characterCount > MAX_RENDERED_DIFF_COMBINED_CHARACTERS) {
    return {
      limited: true,
      reason: 'character-count',
      lineCounts: null,
      characterCount,
      limits
    }
  }

  const originalLineCount = countLinesEmptyAsZeroUpToLimit(
    originalContent,
    MAX_RENDERED_DIFF_LINES_PER_SIDE
  )
  const modifiedLineCount = countLinesEmptyAsZeroUpToLimit(
    modifiedContent,
    MAX_RENDERED_DIFF_LINES_PER_SIDE
  )

  if (originalLineCount.exceeded || modifiedLineCount.exceeded) {
    return {
      limited: true,
      reason: 'line-count',
      lineCounts: {
        original: originalLineCount.count,
        modified: modifiedLineCount.count
      },
      lineCountsAreMinimum: {
        original: originalLineCount.exceeded,
        modified: modifiedLineCount.exceeded
      },
      characterCount,
      limits
    }
  }

  return {
    limited: false,
    lineCounts: {
      original: originalLineCount.count,
      modified: modifiedLineCount.count
    },
    characterCount
  }
}
