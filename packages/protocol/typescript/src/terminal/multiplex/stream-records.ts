import { z } from 'zod'

import type { TerminalMultiplexFrame } from './frame.js'
import { decodeTerminalMultiplexJson } from './json.js'

const U32_MAX = 0xffffffff

export const TERMINAL_MULTIPLEX_STREAM_RECORD_WIRE = {
  viewport: { columnsMin: 1, columnsMax: 1_000, rowsMin: 1, rowsMax: 500 },
  capabilityVersion: 1,
  snapshotMaxBytes: 2 * 1024 * 1024
} as const

export const TerminalMultiplexViewportRecordSchema = z.object({
  cols: z.number().int().min(1).max(1_000),
  rows: z.number().int().min(1).max(500)
})

export const TerminalMultiplexClientRecordSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['desktop', 'mobile', 'web'])
})

export const TerminalMultiplexDeliveryRecordSchema = z.object({
  visible: z.boolean(),
  interested: z.boolean(),
  priority: z.enum(['parked', 'visible', 'active'])
})

export const TerminalMultiplexCapabilitiesRecordSchema = z.object({
  dualScreenSnapshot: z.literal(1),
  parseAck: z.literal(1),
  explicitWriteAck: z.literal(1)
})

export const TerminalMultiplexSubscribeRecordSchema = z.object({
  terminal: z.string().min(1),
  transportGeneration: z.uuid(),
  client: TerminalMultiplexClientRecordSchema,
  viewport: TerminalMultiplexViewportRecordSchema.optional(),
  lastParsedSeq: z.string().regex(/^(?:0|[1-9]\d*)$/),
  delivery: TerminalMultiplexDeliveryRecordSchema,
  snapshotMaxBytes: z.number().int().min(0).max(U32_MAX),
  capabilities: TerminalMultiplexCapabilitiesRecordSchema
})

export const TerminalMultiplexSubscribedRecordSchema = z.object({
  terminal: z.string().min(1),
  transportGeneration: z.uuid(),
  ptyState: z.enum(['running', 'exited']),
  cols: z.number().int().min(1).max(1_000),
  rows: z.number().int().min(1).max(500),
  displayMode: z.enum(['auto', 'desktop']),
  driver: z.discriminatedUnion('kind', [
    z.object({ kind: z.enum(['idle', 'desktop']) }),
    z.object({ kind: z.literal('mobile'), clientId: z.string().min(1) })
  ]),
  initialState: z.enum(['snapshot', 'resume', 'empty']),
  snapshotId: z.number().int().min(1).max(U32_MAX).optional(),
  truncated: z.boolean()
})

export const TerminalMultiplexResizeRecordSchema = TerminalMultiplexViewportRecordSchema.extend({
  reason: z.enum(['fit', 'user', 'restore-pulse'])
})

export const TerminalMultiplexErrorRecordSchema = z.object({ message: z.string().optional() })

export const TerminalMultiplexRevealRecordSchema = z.object({
  stateVersion: z.number().int().min(1).max(U32_MAX)
})

export const TerminalMultiplexSnapshotRequestRecordSchema = z.object({
  requestedScrollbackRows: z.number().int().min(0).max(U32_MAX),
  snapshotMaxBytes: z.number().int().min(0).max(U32_MAX).optional()
})

export const TerminalMultiplexEndRecordSchema = z.object({
  exitCode: z.number().int().min(-0x80000000).max(0x7fffffff).nullable(),
  reason: z.enum(['exit', 'killed', 'gone', 'transport-replaced']),
  historyKept: z.boolean()
})

export const TerminalMultiplexModelRestoreRecordSchema = z.object({
  reason: z.enum([
    'hidden-drop',
    'pending-cap',
    'ack-stall',
    'sequence-gap',
    'provider-gap',
    'renderer-replaced'
  ]),
  markerSeq: z.string().regex(/^(?:0|[1-9]\d*)$/),
  snapshotFollows: z.boolean()
})

export type TerminalMultiplexSubscribeRecord = Omit<
  z.infer<typeof TerminalMultiplexSubscribeRecordSchema>,
  'lastParsedSeq' | 'delivery'
> & {
  lastParsedSeq: bigint
  delivery: { visible: boolean; interested: boolean; priority: 0 | 1 | 2 }
}

export function decodeTerminalMultiplexSubscribeRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexSubscribeRecord | null {
  const parsed = TerminalMultiplexSubscribeRecordSchema.safeParse(
    decodeTerminalMultiplexJson(payload)
  )
  if (!parsed.success) {
    return null
  }
  const lastParsedSeq = BigInt(parsed.data.lastParsedSeq)
  if (lastParsedSeq > 0xffffffffffffffffn) {
    return null
  }
  const priorities = { parked: 0, visible: 1, active: 2 } as const
  return {
    ...parsed.data,
    lastParsedSeq,
    delivery: {
      ...parsed.data.delivery,
      priority: priorities[parsed.data.delivery.priority]
    }
  }
}

export function decodeTerminalMultiplexResizeRecord(
  payload: Uint8Array<ArrayBufferLike>
): z.infer<typeof TerminalMultiplexResizeRecordSchema> | null {
  const parsed = TerminalMultiplexResizeRecordSchema.safeParse(decodeTerminalMultiplexJson(payload))
  return parsed.success ? parsed.data : null
}

export function decodeTerminalMultiplexEndRecord(
  frame: TerminalMultiplexFrame
): z.infer<typeof TerminalMultiplexEndRecordSchema> | null {
  const parsed = TerminalMultiplexEndRecordSchema.safeParse(
    decodeTerminalMultiplexJson(frame.payload)
  )
  return frame.correlationId === 0 && parsed.success ? parsed.data : null
}

export function decodeTerminalMultiplexModelRestoreRecord(
  frame: TerminalMultiplexFrame
): z.infer<typeof TerminalMultiplexModelRestoreRecordSchema> | null {
  const parsed = TerminalMultiplexModelRestoreRecordSchema.safeParse(
    decodeTerminalMultiplexJson(frame.payload)
  )
  return frame.correlationId === 0 &&
    parsed.success &&
    parsed.data.markerSeq === frame.seq.toString()
    ? parsed.data
    : null
}
