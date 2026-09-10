import {
  TERMINAL_OUTPUT_BACKLOG_MIN_CAP_CHARS,
  terminalOutputBacklogCapChars
} from '@agentstart/protocol/terminal/scrollback-policy'
import { recordRendererCrashBreadcrumb } from '~renderer/crash-report/breadcrumb-recorder'

import {
  ALWAYS_REFRESH_FOREGROUND_SYNCHRONOUSLY,
  FOREGROUND_COALESCE_DELAY_MS,
  FOREGROUND_HOLD_SAFETY_DELAY_MS,
  MAX_BACKGROUND_QUEUE_CHUNKS,
  type QueueEntry,
  type TerminalOutputTarget,
  type WriteTerminalOutputOptions
} from './terminal-output-model'
import { fireQueuedAckCredits } from './terminal-output-write-batch'

const BACKGROUND_BACKLOG_WARNING =
  '\x18\x1b[0m\r\n[AgentStart skipped hidden terminal output because the backlog grew too large.]\r\n'
const FOREGROUND_BACKLOG_WARNING =
  '\x18\x1b[0m\r\n[AgentStart skipped a burst of terminal output because the backlog grew too large.]\r\n'

let maxQueueChars = TERMINAL_OUTPUT_BACKLOG_MIN_CAP_CHARS

export function configureTerminalOutputBacklogCap(scrollbackRows: unknown): void {
  maxQueueChars = terminalOutputBacklogCapChars(scrollbackRows)
}

export function createQueueEntry(
  terminal: TerminalOutputTarget,
  options: WriteTerminalOutputOptions
): QueueEntry {
  return {
    terminal,
    chunks: [],
    chunkIndex: 0,
    queuedChars: 0,
    onBackgroundBacklogDropped: options.onBackgroundBacklogDropped,
    backgroundBacklogDropped: false,
    highPriority: true,
    foregroundHold: false,
    foregroundHoldSafetyDelayMs: FOREGROUND_HOLD_SAFETY_DELAY_MS,
    foregroundCoalesce: false,
    foregroundCoalesceDelayMs: FOREGROUND_COALESCE_DELAY_MS,
    foregroundHoldSafetyTimer: null,
    foregroundCoalesceTimer: null
  }
}

export function clearForegroundHoldSafety(entry: QueueEntry): void {
  if (entry.foregroundHoldSafetyTimer === null) {
    return
  }
  clearTimeout(entry.foregroundHoldSafetyTimer)
  entry.foregroundHoldSafetyTimer = null
  entry.foregroundHoldSafetyDelayMs = FOREGROUND_HOLD_SAFETY_DELAY_MS
}

export function clearForegroundCoalesce(entry: QueueEntry): void {
  if (entry.foregroundCoalesceTimer !== null) {
    clearTimeout(entry.foregroundCoalesceTimer)
    entry.foregroundCoalesceTimer = null
  }
  entry.foregroundCoalesce = false
  entry.foregroundCoalesceDelayMs = FOREGROUND_COALESCE_DELAY_MS
}

export function scheduleForegroundHoldSafety(entry: QueueEntry, onReady: () => void): void {
  clearForegroundHoldSafety(entry)
  entry.foregroundHoldSafetyTimer = setTimeout(() => {
    entry.foregroundHoldSafetyTimer = null
    entry.foregroundHold = false
    clearForegroundCoalesce(entry)
    onReady()
  }, entry.foregroundHoldSafetyDelayMs)
}

export function scheduleForegroundCoalesceRelease(
  entry: QueueEntry,
  onReady: () => void,
  options?: { rescheduleEarlier?: boolean }
): void {
  if (entry.foregroundCoalesceTimer !== null) {
    if (options?.rescheduleEarlier !== true) {
      entry.foregroundCoalesce = true
      return
    }
    clearTimeout(entry.foregroundCoalesceTimer)
    entry.foregroundCoalesceTimer = null
  }
  entry.foregroundCoalesce = true
  entry.foregroundCoalesceTimer = setTimeout(() => {
    entry.foregroundCoalesceTimer = null
    entry.foregroundCoalesce = false
    onReady()
  }, entry.foregroundCoalesceDelayMs)
}

export function isEntryDrainable(entry: QueueEntry): boolean {
  return !entry.foregroundHold && !entry.foregroundCoalesce
}

export function discardDetachedQueueEntry(entry: QueueEntry): void {
  fireQueuedAckCredits(entry)
  entry.chunks.length = 0
  entry.chunkIndex = 0
  entry.queuedChars = 0
  entry.highPriority = false
  clearForegroundHoldSafety(entry)
  clearForegroundCoalesce(entry)
}

export function queueCapExceeded(entry: QueueEntry): boolean {
  return (
    entry.queuedChars > maxQueueChars ||
    entry.chunks.length - entry.chunkIndex > MAX_BACKGROUND_QUEUE_CHUNKS
  )
}

export function replaceBacklogWithWarning(entry: QueueEntry, foreground = false): void {
  const warning = foreground ? FOREGROUND_BACKLOG_WARNING : BACKGROUND_BACKLOG_WARNING
  const shouldNotify = !entry.backgroundBacklogDropped
  if (shouldNotify) {
    recordRendererCrashBreadcrumb('terminal_output_backlog_dropped', {
      foreground,
      droppedChars: entry.queuedChars,
      capChars: maxQueueChars
    })
  }
  let beforeWrite: QueueEntry['chunks'][number]['beforeWrite']
  for (let index = entry.chunks.length - 1; index >= entry.chunkIndex; index -= 1) {
    if (entry.chunks[index]?.beforeWrite) {
      beforeWrite = entry.chunks[index].beforeWrite
      break
    }
  }
  clearForegroundHoldSafety(entry)
  fireQueuedAckCredits(entry)
  entry.chunks = [
    {
      data: warning,
      foreground: false,
      forceForegroundRefresh: false,
      followupForegroundRefresh: false,
      shouldRefreshForegroundSynchronously: ALWAYS_REFRESH_FOREGROUND_SYNCHRONOUSLY,
      stripTransientCursorShows: false,
      beforeWrite
    }
  ]
  entry.chunkIndex = 0
  entry.queuedChars = warning.length
  entry.backgroundBacklogDropped = true
  entry.highPriority = true
  entry.foregroundHold = false
  clearForegroundCoalesce(entry)
  if (shouldNotify) {
    entry.onBackgroundBacklogDropped?.()
  }
}

export function hasQueuedChunks(entry: QueueEntry): boolean {
  return entry.chunkIndex < entry.chunks.length
}
