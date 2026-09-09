import { decodeTerminalMultiplexJson } from './json.js'

export type TerminalMultiplexSideEffectFact =
  | { kind: 'title'; normalizedTitle: string; rawTitle: string; staleWorkingTitleClear?: true }
  | { kind: 'bell' }
  | { kind: 'agent-working' }
  | { kind: 'agent-idle'; title: string; staleWorkingTitleClear?: true }
  | { kind: 'agent-exited' }
  | { kind: 'command-finished'; exitCode: number | null }
  | {
      kind: 'pr-link'
      link: { url: string; slug: { owner: string; repo: string }; number: number }
    }
  | { kind: 'command-code-working'; prompt: string }
  | { kind: 'command-code-done'; prompt: string }
  | { kind: '2031-subscribe' }

export type TerminalMultiplexSideEffectBatch = {
  facts: TerminalMultiplexSideEffectFact[]
  replay: boolean
}

export function decodeTerminalMultiplexSideEffectBatch(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexSideEffectBatch | null {
  const value = decodeTerminalMultiplexJson(payload)
  if (!value || !Array.isArray(value.facts) || typeof value.replay !== 'boolean') {
    return null
  }
  const facts: TerminalMultiplexSideEffectFact[] = []
  for (const candidate of value.facts) {
    const fact = decodeSideEffectFact(candidate)
    if (!fact || (value.replay && fact.kind !== 'title')) {
      return null
    }
    facts.push(fact)
  }
  return { facts, replay: value.replay }
}

function decodeSideEffectFact(value: unknown): TerminalMultiplexSideEffectFact | null {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return null
  }
  const staleWorkingTitleClear =
    value.staleWorkingTitleClear === true
      ? { staleWorkingTitleClear: true as const }
      : value.staleWorkingTitleClear === undefined
        ? {}
        : null
  if (staleWorkingTitleClear === null) {
    return null
  }
  switch (value.kind) {
    case 'title':
      return typeof value.normalizedTitle === 'string' && typeof value.rawTitle === 'string'
        ? {
            kind: 'title',
            normalizedTitle: value.normalizedTitle,
            rawTitle: value.rawTitle,
            ...staleWorkingTitleClear
          }
        : null
    case 'bell':
    case 'agent-working':
    case 'agent-exited':
    case '2031-subscribe':
      return { kind: value.kind }
    case 'agent-idle':
      return typeof value.title === 'string'
        ? { kind: 'agent-idle', title: value.title, ...staleWorkingTitleClear }
        : null
    case 'command-finished':
      return value.exitCode === null || isI32(value.exitCode)
        ? { kind: 'command-finished', exitCode: value.exitCode }
        : null
    case 'pr-link': {
      const link = value.link
      return isRecord(link) &&
        typeof link.url === 'string' &&
        isRecord(link.slug) &&
        typeof link.slug.owner === 'string' &&
        typeof link.slug.repo === 'string' &&
        isU32(link.number)
        ? {
            kind: 'pr-link',
            link: {
              url: link.url,
              slug: { owner: link.slug.owner, repo: link.slug.repo },
              number: link.number
            }
          }
        : null
    }
    case 'command-code-working':
    case 'command-code-done':
      return typeof value.prompt === 'string' ? { kind: value.kind, prompt: value.prompt } : null
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isI32(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= -0x80000000 &&
    value <= 0x7fffffff
  )
}

function isU32(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff
}
