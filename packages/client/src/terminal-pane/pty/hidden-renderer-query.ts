import type { Terminal } from '@xterm/xterm'
import type { PtyDataMeta } from '~renderer/runtime/pty-data-meta'
import { useAppStore } from '~renderer/store/state'
import {
  mode2031SequenceFor,
  resolveTerminalColorSchemeMode,
  scanMode2031Sequences
} from '~renderer/terminal-pane/emulator/color-scheme'
import { parseTerminalOscColorQuery } from '~renderer/terminal/osc-color-reply'
import {
  HIDDEN_STARTUP_RENDERER_QUERY_PENDING_CHARS,
  extractHiddenStartupRendererQueryData,
  findCsiFinalByteIndex,
  isStatefulRendererReplyCsiQuery,
  isStatelessRendererReplyCsiQuery
} from '~renderer/terminal/reply-query-extraction'
import { getSystemPrefersDark } from '~renderer/terminal/theme'

import {
  DEFAULT_DA1_RESPONSE,
  sendTerminalOscColorQueryReplies
} from '../terminal-capability-replies'
import type { PtyConnectionDeps } from './connection-types'

type HiddenRendererQueryOptions = {
  terminal: Terminal
  paneId: number
  paneMode2031Ref: PtyConnectionDeps['paneMode2031Ref']
  paneLastThemeModeRef: PtyConnectionDeps['paneLastThemeModeRef']
  sendImmediate: (data: string) => boolean
  writeStatelessQueryData: (data: string) => void
  writeUnansweredQueryData: (data: string) => void
}

export type HiddenRendererQuery = {
  observeSkipped: (data: string) => void
  observeMode2031: (data: string) => void
  hasPendingModeSequence: () => boolean
  takePendingForForeground: (data: string) => {
    statelessQueryData: string
    statefulQueryData: string
    oscColorQueryData: string
    remainingData: string
    consumedCurrentChars: number
  } | null
  salvageDiscarded: (data: string) => void
  resetPending: () => void
  clearModeState: () => void
}

export function consumePtyDataMetaChars(
  meta: PtyDataMeta | undefined,
  consumedCurrentChars: number
): PtyDataMeta | undefined {
  if (consumedCurrentChars === 0 || typeof meta?.rawLength !== 'number') {
    return meta
  }
  return { ...meta, rawLength: Math.max(0, meta.rawLength - consumedCurrentChars) }
}

export function createHiddenRendererQuery(
  options: HiddenRendererQueryOptions
): HiddenRendererQuery {
  let mode2031ScanTail = ''
  let pendingQuery = ''

  const observeMode2031 = (data: string): void => {
    const scan = scanMode2031Sequences(mode2031ScanTail, data)
    mode2031ScanTail = scan.tail
    if (scan.finalState === 'unsubscribed') {
      options.paneMode2031Ref.current.delete(options.paneId)
      options.paneLastThemeModeRef.current.delete(options.paneId)
    }
    if (scan.finalState !== 'subscribed') {
      return
    }
    const mode = resolveTerminalColorSchemeMode(
      useAppStore.getState().settings,
      getSystemPrefersDark()
    )
    options.paneMode2031Ref.current.set(options.paneId, true)
    options.sendImmediate(mode2031SequenceFor(mode))
    options.paneLastThemeModeRef.current.set(options.paneId, mode)
  }

  const observeSkipped = (data: string): void => {
    const extracted = extractHiddenStartupRendererQueryData(data, pendingQuery)
    pendingQuery = extracted.pending
    if (extracted.oscColorQueryData) {
      sendTerminalOscColorQueryReplies(
        extracted.oscColorQueryData,
        options.terminal,
        options.sendImmediate
      )
    }
    if (extracted.statelessQueryData) {
      options.writeStatelessQueryData(extracted.statelessQueryData)
    }
    observeMode2031(data)
  }

  const splitCsiSequences = (queryData: string): string[] => {
    const sequences: string[] = []
    let offset = queryData.indexOf('\x1b[')
    while (offset !== -1) {
      const finalByteIndex = findCsiFinalByteIndex(queryData, offset + 2)
      if (finalByteIndex === -1) {
        break
      }
      sequences.push(queryData.slice(offset, finalByteIndex + 1))
      offset = queryData.indexOf('\x1b[', finalByteIndex + 1)
    }
    return sequences
  }

  return {
    observeSkipped,
    observeMode2031,
    hasPendingModeSequence: () => mode2031ScanTail.length > 0,
    takePendingForForeground: (data) => {
      const pending = pendingQuery
      pendingQuery = ''
      if (!pending) {
        return null
      }
      const input = `${pending}${data}`
      let statelessQueryData = ''
      let statefulQueryData = ''
      let oscColorQueryData = ''
      let consumedInputChars = pending.length
      let nextPending = ''
      if (input.startsWith('\x1b[')) {
        const finalByteIndex = findCsiFinalByteIndex(input, 2)
        if (finalByteIndex === -1) {
          nextPending = input.slice(0, HIDDEN_STARTUP_RENDERER_QUERY_PENDING_CHARS)
          consumedInputChars = input.length
        } else {
          const sequence = input.slice(0, finalByteIndex + 1)
          if (isStatelessRendererReplyCsiQuery(sequence)) {
            statelessQueryData = sequence
          } else if (isStatefulRendererReplyCsiQuery(sequence)) {
            statefulQueryData = sequence
          }
          consumedInputChars = finalByteIndex + 1
        }
      } else if (input.startsWith('\x1b]')) {
        const query = parseTerminalOscColorQuery(input, 0)
        if (query.kind === 'partial') {
          nextPending = input.slice(0, HIDDEN_STARTUP_RENDERER_QUERY_PENDING_CHARS)
          consumedInputChars = input.length
        } else if (query.kind === 'match') {
          oscColorQueryData = input.slice(0, query.endIndex)
          consumedInputChars = query.endIndex
        }
      } else if (input.length === 1) {
        nextPending = input
        consumedInputChars = input.length
      }
      pendingQuery = nextPending
      const consumedCurrentChars = Math.max(0, consumedInputChars - pending.length)
      return {
        statelessQueryData,
        statefulQueryData,
        oscColorQueryData,
        remainingData: data.slice(consumedCurrentChars),
        consumedCurrentChars
      }
    },
    salvageDiscarded: (data) => {
      if (!data || !data.includes('\x1b')) {
        return
      }
      const extracted = extractHiddenStartupRendererQueryData(data, '')
      if (extracted.oscColorQueryData) {
        sendTerminalOscColorQueryReplies(
          extracted.oscColorQueryData,
          options.terminal,
          options.sendImmediate
        )
      }
      let unanswered = ''
      for (const sequence of splitCsiSequences(
        extracted.statefulQueryData + extracted.statelessQueryData
      )) {
        if (sequence === '\x1b[6n') {
          const buffer = options.terminal.buffer.active
          const row = Math.min(buffer.cursorY + 1, options.terminal.rows)
          const col = Math.min(buffer.cursorX + 1, options.terminal.cols)
          options.sendImmediate(`\x1b[${row};${col}R`)
        } else if (sequence === '\x1b[c' || sequence === '\x1b[0c') {
          options.sendImmediate(DEFAULT_DA1_RESPONSE)
        } else {
          unanswered += sequence
        }
      }
      if (unanswered) {
        options.writeUnansweredQueryData(unanswered)
      }
    },
    resetPending: () => {
      pendingQuery = ''
    },
    clearModeState: () => {
      options.paneMode2031Ref.current.delete(options.paneId)
      options.paneLastThemeModeRef.current.delete(options.paneId)
    }
  }
}
