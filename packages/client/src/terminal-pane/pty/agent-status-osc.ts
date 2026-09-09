import { parseAgentStatusPayload } from '@yiru/protocol/agent/status-parse'
import type { ParsedAgentStatusPayload } from '@yiru/protocol/agent/status-records'

type TerminalChunkScanFlags = { hasEsc: boolean }

const OSC_AGENT_STATUS_PREFIX = '\x1b]9999;'

export type ProcessedAgentStatusChunk = {
  cleanData: string
  payloads: ParsedAgentStatusPayload[]
}

function findAgentStatusTerminator(
  data: string,
  searchFrom: number
): { index: number; length: 1 | 2 } | null {
  const belIndex = data.indexOf('\x07', searchFrom)
  const stIndex = data.indexOf('\x1b\\', searchFrom)
  if (belIndex === -1 && stIndex === -1) {
    return null
  }
  if (belIndex === -1) {
    return { index: stIndex, length: 2 }
  }
  if (stIndex === -1 || belIndex < stIndex) {
    return { index: belIndex, length: 1 }
  }
  return { index: stIndex, length: 2 }
}

// Why: carry partial OSC frames across PTY chunks while stripping only agent status.
export function createAgentStatusOscProcessor(): (
  data: string,
  scanFlags?: TerminalChunkScanFlags
) => ProcessedAgentStatusChunk {
  const MAX_PENDING = 64 * 1024
  let pending = ''

  return (data: string, scanFlags?: TerminalChunkScanFlags): ProcessedAgentStatusChunk => {
    if (pending.length === 0 && scanFlags && !scanFlags.hasEsc) {
      return { cleanData: data, payloads: [] }
    }
    const combined = pending + data
    pending = ''

    const payloads: ParsedAgentStatusPayload[] = []
    let cleanData = ''
    let cursor = 0

    while (cursor < combined.length) {
      const start = combined.indexOf(OSC_AGENT_STATUS_PREFIX, cursor)
      if (start === -1) {
        const tail = combined.slice(cursor)
        const prefixLen = OSC_AGENT_STATUS_PREFIX.length
        let partialPrefixLen = 0
        for (let k = Math.min(prefixLen - 1, tail.length); k > 0; k--) {
          if (tail.endsWith(OSC_AGENT_STATUS_PREFIX.slice(0, k))) {
            partialPrefixLen = k
            break
          }
        }
        if (partialPrefixLen > 0) {
          cleanData += tail.slice(0, tail.length - partialPrefixLen)
          pending = tail.slice(tail.length - partialPrefixLen)
        } else {
          cleanData += tail
        }
        break
      }

      cleanData += combined.slice(cursor, start)
      const payloadStart = start + OSC_AGENT_STATUS_PREFIX.length
      const terminator = findAgentStatusTerminator(combined, payloadStart)

      if (terminator === null) {
        const candidate = combined.slice(start)
        pending = candidate.length > MAX_PENDING ? '' : candidate
        break
      }

      const parsed = parseAgentStatusPayload(combined.slice(payloadStart, terminator.index))
      if (parsed) {
        payloads.push(parsed)
      }
      cursor = terminator.index + terminator.length
    }

    return { cleanData, payloads }
  }
}
