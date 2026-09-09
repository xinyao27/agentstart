import { generationFailure, type GenerationFailure } from '../failure'

export const CUSTOM_PROMPT_PLACEHOLDER = '{prompt}'

export type TokenizeCustomCommandResult = { ok: true; tokens: string[] } | GenerationFailure

// Why: deliberately POSIX-shell-style only for *grouping* (single + double
// quotes, backslash escapes inside double quotes). We do NOT expand `$VAR`,
// command substitution, backticks, globs, or `~`. The user's intent is
// "spawn this exact CLI" — adding shell semantics on top would create
// surprising behavior across platforms (especially Windows) and a security
// surface we don't need.
export function tokenizeCustomCommandTemplate(template: string): TokenizeCustomCommandResult {
  const tokens: string[] = []
  let current = ''
  let inToken = false
  let quote: '"' | "'" | null = null
  let i = 0

  while (i < template.length) {
    const ch = template[i]
    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < template.length) {
        current += template[i + 1]
        i += 2
        continue
      }
      if (ch === quote) {
        quote = null
        i++
        // Why: leaving a quoted region still keeps the token open — `a"b"c`
        // tokenizes as a single arg `abc`.
        inToken = true
        continue
      }
      current += ch
      i++
      continue
    }

    if (ch === '"' || ch === "'") {
      quote = ch
      inToken = true
      i++
      continue
    }

    if (ch === '\\' && i + 1 < template.length) {
      current += template[i + 1]
      inToken = true
      i += 2
      continue
    }

    if (/\s/.test(ch)) {
      if (inToken) {
        tokens.push(current)
        current = ''
        inToken = false
      }
      i++
      continue
    }

    current += ch
    inToken = true
    i++
  }

  if (quote) {
    return generationFailure({ code: 'unclosed-quote' })
  }
  if (inToken) {
    tokens.push(current)
  }
  return { ok: true, tokens }
}

export type CustomCommandPlan =
  | { ok: true; binary: string; args: string[]; stdinPayload: string | null }
  | GenerationFailure

/**
 * Parses a user-supplied command template into a spawn-ready binary + argv,
 * substituting `{prompt}` with the agent prompt. When the template contains
 * no `{prompt}`, the prompt is delivered via stdin (mirrors `claude -p`).
 *
 * Quoting is a tokenizer-level concern only — we use argv (no shell), so the
 * substituted prompt is always passed as a single argument regardless of
 * whether the template wrote `{prompt}` or `"{prompt}"`.
 */
export function planCustomCommand(template: string, prompt: string): CustomCommandPlan {
  const tokenized = tokenizeCustomCommandTemplate(template)
  if (!tokenized.ok) {
    return tokenized
  }
  if (tokenized.tokens.length === 0) {
    return generationFailure({ code: 'custom-command-empty', location: 'plain' })
  }
  const [binary, ...rest] = tokenized.tokens
  if (!binary) {
    return generationFailure({ code: 'binary-required', kind: 'custom' })
  }

  const substitute = (token: string): string =>
    token.includes(CUSTOM_PROMPT_PLACEHOLDER)
      ? token.split(CUSTOM_PROMPT_PLACEHOLDER).join(prompt)
      : token
  const usesPlaceholder = tokenized.tokens.some((t) => t.includes(CUSTOM_PROMPT_PLACEHOLDER))
  if (usesPlaceholder) {
    return {
      ok: true,
      binary: substitute(binary),
      args: rest.map(substitute),
      stdinPayload: null
    }
  }
  return { ok: true, binary, args: rest, stdinPayload: prompt }
}
