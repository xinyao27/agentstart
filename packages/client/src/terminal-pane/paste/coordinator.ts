import { createRedactedPasteDiagnostic } from './diagnostics'
import {
  TERMINAL_PASTE_CHUNK_MAX_BYTES,
  TERMINAL_PASTE_DIRECT_MAX_BYTES,
  TERMINAL_PASTE_MAX_BYTES
} from './limits'
import type {
  TerminalPastePayload,
  TerminalPastePlan,
  TerminalPasteSource,
  TerminalPasteTarget
} from './model'
import { measureTerminalPastePayloadMetadataWithYield } from './payload-metadata'

export { TERMINAL_PASTE_MAX_BYTES } from './limits'
export { executeTerminalPastePlan } from './executor'
export type {
  TerminalPasteExecutionResult,
  TerminalPastePlan,
  TerminalPasteRuntime,
  TerminalPasteSource,
  TerminalPasteTextOptions
} from './model'

type PlanTerminalPasteArgs = {
  text: string
  source: TerminalPasteSource
  target: TerminalPasteTarget
  forceBracketedPaste?: boolean
  forceBracketedPasteForMultiline?: boolean
  terminalBracketedPasteMode?: boolean
  hasRichText?: boolean
  maxDirectBytes?: number
  maxChunkBytes?: number
  maxBytes?: number
}

type PlanTerminalPasteWithYieldArgs = PlanTerminalPasteArgs & {
  measureYieldAfterCodeUnits?: number
  yieldToEventLoop?: () => Promise<void>
}

export async function planTerminalPasteWithYield({
  text,
  source,
  target,
  forceBracketedPaste = false,
  forceBracketedPasteForMultiline = false,
  terminalBracketedPasteMode = false,
  hasRichText = false,
  maxDirectBytes = TERMINAL_PASTE_DIRECT_MAX_BYTES,
  maxChunkBytes = TERMINAL_PASTE_CHUNK_MAX_BYTES,
  maxBytes = TERMINAL_PASTE_MAX_BYTES,
  measureYieldAfterCodeUnits,
  yieldToEventLoop
}: PlanTerminalPasteWithYieldArgs): Promise<TerminalPastePlan> {
  const metadata = await measureTerminalPastePayloadMetadataWithYield(text, {
    stopAfterBytes: maxBytes,
    yieldAfterCodeUnits: measureYieldAfterCodeUnits,
    yieldToEventLoop
  })
  const payload: TerminalPastePayload = {
    plainText: text,
    source,
    byteLength: metadata.byteLength,
    lineCount: metadata.lineCount,
    hasRichText,
    hasControlSequences: metadata.hasControlSequences
  }
  return buildTerminalPastePlan({
    forceBracketedPaste,
    forceBracketedPasteForMultiline,
    maxBytes,
    maxChunkBytes,
    maxDirectBytes,
    payload,
    target,
    terminalBracketedPasteMode
  })
}

function buildTerminalPastePlan({
  payload,
  target,
  forceBracketedPaste,
  forceBracketedPasteForMultiline,
  terminalBracketedPasteMode,
  maxDirectBytes,
  maxChunkBytes,
  maxBytes
}: {
  payload: TerminalPastePayload
  target: TerminalPasteTarget
  forceBracketedPaste: boolean
  forceBracketedPasteForMultiline: boolean
  terminalBracketedPasteMode: boolean
  maxDirectBytes: number
  maxChunkBytes: number
  maxBytes: number
}): TerminalPastePlan {
  const shouldChunk = payload.byteLength > maxDirectBytes
  const effectiveForceBracketedPaste =
    forceBracketedPaste || (forceBracketedPasteForMultiline && payload.lineCount > 1)
  const shouldBracketChunk = effectiveForceBracketedPaste || terminalBracketedPasteMode
  const mode = choosePasteMode({
    byteLength: payload.byteLength,
    forceBracketedPaste: effectiveForceBracketedPaste,
    shouldChunk,
    maxBytes
  })
  const plan: TerminalPastePlan = {
    target,
    payload,
    mode,
    newlinePolicy: effectiveForceBracketedPaste ? 'terminal-cr' : 'preserve',
    runtimeKey: target.runtime.runtimeKey,
    ...(shouldChunk ? { maxChunkBytes } : {}),
    bracketed: mode === 'bracketed-terminal' || (mode === 'chunked' && shouldBracketChunk),
    redactedDiagnostic: '',
    ...(mode === 'reject' ? { rejectReason: 'payload-too-large' } : {})
  }
  return {
    ...plan,
    redactedDiagnostic: createRedactedPasteDiagnostic(plan)
  }
}

function choosePasteMode({
  byteLength,
  forceBracketedPaste,
  shouldChunk,
  maxBytes
}: {
  byteLength: number
  forceBracketedPaste: boolean
  shouldChunk: boolean
  maxBytes: number
}): TerminalPastePlan['mode'] {
  if (byteLength > maxBytes) {
    return 'reject'
  }
  if (shouldChunk) {
    return 'chunked'
  }
  return forceBracketedPaste ? 'bracketed-terminal' : 'direct'
}
