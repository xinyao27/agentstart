/** The code-unit window a failure summary scan reads from raw hook output. */
export const HOOK_FAILURE_SUMMARY_SCAN_CODE_UNITS = 64 * 1024

/** How much raw failure output a recovery prompt embeds. */
export const HOOK_FAILURE_PROMPT_OUTPUT_LIMIT = 12_000

export const HOOK_FAILURE_REPLY_INSTRUCTION =
  'Reply with the root cause, files changed, validation run, final git status, and anything left for the user.'

export const LINT_PATTERN = /\b(?:eslint|oxlint|lint-staged|lint)\b/i

const LOW_SIGNAL_LINE_PATTERN =
  /^(?:npm\s+(?:warn|warning)\b.*(?:env|config)|npm\s+notice\b|husky\s+-\s+deprecated\b)/i

/**
 * The lines of an already-normalized hook failure that a summary should read,
 * with npm noise dropped once a hook or lint signal appears anywhere in the output.
 */
export function hookFailureLines(normalized: string, signalPatterns: readonly RegExp[]): string[] {
  const lines = normalizedNonEmptyLines(normalized)
  const hasSignalLine = lines.some((line) => signalPatterns.some((pattern) => pattern.test(line)))

  if (!hasSignalLine) {
    return lines
  }

  const filtered = lines.filter((line) => !LOW_SIGNAL_LINE_PATTERN.test(line))
  return filtered.length > 0 ? filtered : lines
}

/** Split already-normalized output into trimmed, non-empty lines. */
export function normalizedNonEmptyLines(normalized: string): string[] {
  const lines: string[] = []
  let lineStart = 0
  for (let index = 0; index <= normalized.length; index += 1) {
    if (index < normalized.length && normalized.charCodeAt(index) !== 10) {
      continue
    }
    const line = normalized.slice(lineStart, index).trim()
    if (line.length > 0) {
      lines.push(line)
    }
    lineStart = index + 1
  }
  return lines
}

/**
 * Whether the raw failure output carries more than the summary already shows.
 * Comparison folds whitespace because the two sides reach us through different paths.
 */
export function hasExpandedFailureDetails(
  raw: string,
  summary: string,
  normalize: (value: string) => string
): boolean {
  const normalizedRaw = normalize(raw)

  if (!normalizedRaw) {
    return false
  }

  if (raw.length > HOOK_FAILURE_SUMMARY_SCAN_CODE_UNITS) {
    return true
  }

  return foldComparisonWhitespace(normalizedRaw) !== foldComparisonWhitespace(normalize(summary))
}

function foldComparisonWhitespace(value: string): string {
  let result = ''
  let pendingSpace = false
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (isComparisonWhitespace(code)) {
      pendingSpace = result.length > 0
      continue
    }
    if (pendingSpace) {
      result += ' '
      pendingSpace = false
    }
    result += value[index]
  }
  return result
}

function isComparisonWhitespace(code: number): boolean {
  return (
    code === 32 ||
    (code >= 9 && code <= 13) ||
    code === 160 ||
    code === 5760 ||
    (code >= 8192 && code <= 8202) ||
    code === 8232 ||
    code === 8233 ||
    code === 8239 ||
    code === 8287 ||
    code === 12288 ||
    code === 65279
  )
}

export function truncatePromptText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value
  }

  const omitted = value.length - limit
  const headLength = Math.floor(limit * 0.35)
  const tailLength = limit - headLength
  return [
    value.slice(0, headLength),
    `\n[...${omitted} characters omitted...]\n`,
    value.slice(value.length - tailLength)
  ].join('')
}

/** Add ad hoc user guidance while keeping the required response format last. */
export function appendCustomInstruction(prompt: string, customInstruction: string): string {
  const trimmedInstruction = customInstruction.trim()
  if (!trimmedInstruction) {
    return prompt
  }

  const customInstructionBlock = [
    '',
    'Additional user instruction for this fix:',
    trimmedInstruction,
    ''
  ].join('\n')
  if (!prompt.endsWith(HOOK_FAILURE_REPLY_INSTRUCTION)) {
    return `${prompt}${customInstructionBlock}`
  }

  // Why: keep ad hoc user guidance before the required response format so the
  // final line remains the agent's reporting contract.
  return `${prompt.slice(0, -HOOK_FAILURE_REPLY_INSTRUCTION.length)}${customInstructionBlock}${HOOK_FAILURE_REPLY_INSTRUCTION}`
}
