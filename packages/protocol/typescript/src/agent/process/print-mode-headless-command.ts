const PRINT_MODE_FLAGS = new Set(['--print', '-p'])
const HEADLESS_OUTPUT_FORMATS = new Set(['json', 'stream-json'])

function optionName(token: string): string {
  const eq = token.indexOf('=')
  return eq === -1 ? token : token.slice(0, eq)
}

function optionValue(tokens: readonly string[], index: number): string | null {
  const token = tokens[index]
  const eq = token.indexOf('=')
  if (eq !== -1) {
    return token.slice(eq + 1)
  }
  return tokens[index + 1] ?? null
}

// Why: print mode exits after one response, so it is not an interactive TUI session.
export function isPrintModeHeadlessOneShotCommand(tokens: readonly string[]): boolean {
  for (let index = 1; index < tokens.length; index += 1) {
    // Why: tokens after the option terminator are prompt text, even when they resemble flags.
    if (tokens[index] === '--') {
      return false
    }
    const name = optionName(tokens[index])
    if (PRINT_MODE_FLAGS.has(name)) {
      return true
    }
    if (name === '--output-format') {
      const value = optionValue(tokens, index)?.toLowerCase()
      if (value && HEADLESS_OUTPUT_FORMATS.has(value)) {
        return true
      }
    }
  }
  return false
}
