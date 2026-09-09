import { terminalMultiplexCrc32c } from '@yiru/protocol/terminal-multiplex/crc32c'
import type { TerminalMultiplexFrame } from '@yiru/protocol/terminal-multiplex/frame'
import { decodeTerminalMultiplexJson } from '@yiru/protocol/terminal-multiplex/json'
import {
  decodeTerminalMultiplexSnapshotChunkRecord,
  decodeTerminalMultiplexSnapshotEndRecord,
  decodeTerminalMultiplexSnapshotStartRecord,
  TERMINAL_MULTIPLEX_SNAPSHOT_CHUNK_DATA_BYTES
} from '@yiru/protocol/terminal-multiplex/snapshot-records'

// Why: docs/reference/terminal-multiplex.md OQ-2 selects one 2 MiB snapshot cap for every lane;
// telemetry can justify raising it later without creating a decoder fallback.
const REMOTE_TERMINAL_SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024

export type RemoteTerminalSnapshot = {
  id: number
  data: string
  cols: number
  rows: number
  wireByteLength: number
  coverageEndSeq: bigint
  pendingDeliveryStartSeq: bigint
  pendingEscapeTailAnsi?: string
  source: 'headless' | 'provider'
  epoch: bigint
  lastTitle: string | null
}

export class RemoteTerminalSnapshotAssembler {
  private id = 0
  private frameSeq = 0n
  private activeBuffer: 0 | 1 = 0
  private source: 0 | 1 = 0
  private cols = 80
  private rows = 24
  private pendingDeliveryStartSeq = 0n
  private sections: [Uint8Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array] | null = null
  private offsets = [0, 0, 0, 0, 0]

  start(frame: TerminalMultiplexFrame): boolean {
    const record = decodeTerminalMultiplexSnapshotStartRecord(frame.payload)
    if (
      !record ||
      record.snapshotId !== frame.correlationId ||
      record.coverageEndSeq !== frame.seq ||
      record.snapshotId === 0 ||
      record.sectionBytes.some((bytes) => bytes > REMOTE_TERMINAL_SNAPSHOT_MAX_BYTES) ||
      record.sectionBytes.reduce((total, bytes) => total + bytes, 0) >
        REMOTE_TERMINAL_SNAPSHOT_MAX_BYTES
    ) {
      return false
    }
    this.id = record.snapshotId
    this.frameSeq = record.coverageEndSeq
    this.activeBuffer = record.activeBuffer
    this.source = record.source
    this.cols = record.cols
    this.rows = record.rows
    this.pendingDeliveryStartSeq = record.pendingDeliveryStartSeq
    this.sections = [
      new Uint8Array(record.sectionBytes[0]),
      new Uint8Array(record.sectionBytes[1]),
      new Uint8Array(record.sectionBytes[2]),
      new Uint8Array(record.sectionBytes[3]),
      new Uint8Array(record.sectionBytes[4])
    ]
    this.offsets = [0, 0, 0, 0, 0]
    return true
  }

  chunk(frame: TerminalMultiplexFrame): boolean {
    const record = decodeTerminalMultiplexSnapshotChunkRecord(frame.payload)
    const section = record?.section
    const target = section === undefined ? undefined : this.sections?.[section]
    if (
      !record ||
      !target ||
      record.snapshotId !== this.id ||
      frame.correlationId !== this.id ||
      frame.seq !== this.frameSeq ||
      record.sectionOffset !== this.offsets[record.section] ||
      record.sectionOffset + record.data.byteLength > target.byteLength ||
      record.data.byteLength > TERMINAL_MULTIPLEX_SNAPSHOT_CHUNK_DATA_BYTES
    ) {
      return false
    }
    target.set(record.data, record.sectionOffset)
    this.offsets[record.section] += record.data.byteLength
    return true
  }

  end(frame: TerminalMultiplexFrame): RemoteTerminalSnapshot | null {
    const record = decodeTerminalMultiplexSnapshotEndRecord(frame.payload)
    const sections = this.sections
    if (
      !record ||
      !sections ||
      record.status !== 0 ||
      record.snapshotId !== this.id ||
      frame.correlationId !== this.id ||
      record.coverageEndSeq !== this.frameSeq ||
      frame.seq !== this.frameSeq ||
      sections.some((section, index) => section.byteLength !== this.offsets[index]) ||
      sections.reduce((total, section) => total + section.byteLength, 0) !==
        record.assembledBytes ||
      terminalMultiplexCrc32c(sections) !== record.crc32c
    ) {
      this.clear()
      return null
    }
    try {
      const text = sections.map((section) =>
        new TextDecoder('utf-8', { fatal: true }).decode(section)
      )
      const metadata = decodeTerminalMultiplexJson(sections[4])
      if (!isSnapshotMetadata(metadata)) {
        throw new Error('Invalid terminal snapshot metadata')
      }
      const data = renderDualScreen(text[0]!, text[1]!, text[2]!, this.activeBuffer)
      const snapshot = {
        id: this.id,
        epoch: frame.epoch,
        data,
        lastTitle: typeof metadata?.lastTitle === 'string' ? metadata.lastTitle : null,
        cols: this.cols,
        rows: this.rows,
        wireByteLength: record.assembledBytes,
        coverageEndSeq: this.frameSeq,
        pendingDeliveryStartSeq: this.pendingDeliveryStartSeq,
        ...(text[3] ? { pendingEscapeTailAnsi: text[3] } : {}),
        source: this.source === 0 ? 'headless' : 'provider'
      } satisfies RemoteTerminalSnapshot
      this.clear()
      return snapshot
    } catch {
      this.clear()
      return null
    }
  }

  clear(): void {
    this.id = 0
    this.sections = null
    this.offsets = [0, 0, 0, 0, 0]
  }
}

function isSnapshotMetadata(value: Record<string, unknown> | null): boolean {
  if (
    !value ||
    (value.cwd !== null && typeof value.cwd !== 'string') ||
    (value.lastTitle !== null && typeof value.lastTitle !== 'string') ||
    !Array.isArray(value.oscLinks) ||
    !isU32(value.kittyKeyboardFlags) ||
    (value.displayMode !== 'auto' && value.displayMode !== 'desktop') ||
    !isU32(value.requestedScrollbackRows)
  ) {
    return false
  }
  return value.oscLinks.every(
    (link) =>
      typeof link === 'object' &&
      link !== null &&
      !Array.isArray(link) &&
      'uri' in link &&
      typeof link.uri === 'string' &&
      'start' in link &&
      isU32(link.start) &&
      'end' in link &&
      isU32(link.end)
  )
}

function isU32(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff
}

function renderDualScreen(
  normalScrollback: string,
  normalScreen: string,
  alternateScreen: string,
  activeBuffer: 0 | 1
): string {
  const normal = `\x1b[?1049l\x1b[2J\x1b[3J\x1b[H${normalScrollback}${normalScreen}`
  const alternate = `\x1b[?1049h\x1b[2J\x1b[H${alternateScreen}`
  return `${normal}${alternate}${activeBuffer === 0 ? '\x1b[?1049l' : ''}`
}
