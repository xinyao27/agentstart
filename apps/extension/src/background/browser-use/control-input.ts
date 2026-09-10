import { z } from 'zod'

const BrowserControlIdSchema = z.string().min(1).max(500)
const BrowserFiniteNumberSchema = z.number().finite()

const BrowserPageRegisterInputSchema = z
  .object({
    backendPageId: BrowserControlIdSchema,
    browserPageId: BrowserControlIdSchema,
    sessionProfileId: BrowserControlIdSchema.nullable().optional(),
    workspaceId: BrowserControlIdSchema,
    worktreeId: BrowserControlIdSchema
  })
  .strict()

const BrowserPageUnregisterInputSchema = z
  .object({
    browserPageId: BrowserControlIdSchema,
    expectedBackendPageId: BrowserControlIdSchema
  })
  .strict()

export const BrowserPageIdInputSchema = z.object({ browserPageId: BrowserControlIdSchema }).strict()

const BrowserViewportOverrideSchema = z
  .object({
    deviceScaleFactor: BrowserFiniteNumberSchema.min(0.1).max(5),
    height: BrowserFiniteNumberSchema.min(1).max(10_000),
    mobile: z.boolean(),
    width: BrowserFiniteNumberSchema.min(1).max(10_000)
  })
  .strict()

const BrowserViewportOverrideInputSchema = BrowserPageIdInputSchema.extend({
  override: BrowserViewportOverrideSchema.nullable()
}).strict()

const BrowserGrabRectSchema = z
  .object({
    height: BrowserFiniteNumberSchema.min(0),
    width: BrowserFiniteNumberSchema.min(0),
    x: BrowserFiniteNumberSchema,
    y: BrowserFiniteNumberSchema
  })
  .strict()

const BrowserAnnotationViewportMarkerSchema = z
  .object({
    id: z.string().min(1).max(100),
    index: z.number().int().min(0).max(99),
    isFixed: z.boolean(),
    rectPage: BrowserGrabRectSchema,
    rectViewport: BrowserGrabRectSchema
  })
  .strict()

const BrowserAnnotationViewportInputSchema = BrowserPageIdInputSchema.extend({
  emitViewport: z.boolean(),
  enabled: z.boolean(),
  markers: z.array(BrowserAnnotationViewportMarkerSchema).max(50),
  token: z.string().regex(/^[a-zA-Z0-9_-]{16,80}$/)
}).strict()

export const BrowserGrabSetModeInputSchema = BrowserPageIdInputSchema.extend({
  enabled: z.boolean()
}).strict()

export const BrowserGrabAwaitInputSchema = BrowserPageIdInputSchema.extend({
  opId: BrowserControlIdSchema
}).strict()

export const BrowserGrabCaptureInputSchema = BrowserPageIdInputSchema.extend({
  rect: BrowserGrabRectSchema
}).strict()

export type BrowserPageRegisterInput = z.output<typeof BrowserPageRegisterInputSchema>
export type BrowserPageUnregisterInput = z.output<typeof BrowserPageUnregisterInputSchema>
export type BrowserPageIdInput = z.output<typeof BrowserPageIdInputSchema>
export type BrowserViewportOverrideInput = z.output<typeof BrowserViewportOverrideInputSchema>
export type BrowserAnnotationViewportInput = z.output<typeof BrowserAnnotationViewportInputSchema>
export type BrowserGrabSetModeInput = z.output<typeof BrowserGrabSetModeInputSchema>
export type BrowserGrabAwaitInput = z.output<typeof BrowserGrabAwaitInputSchema>
export type BrowserGrabCaptureInput = z.output<typeof BrowserGrabCaptureInputSchema>
