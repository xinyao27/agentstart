import type {
  BrowserGrabAwaitInput,
  BrowserGrabCaptureInput,
  BrowserGrabSetModeInput,
  BrowserPageIdInput
} from './control-input'
import {
  BrowserGrabAwaitInputSchema,
  BrowserGrabCaptureInputSchema,
  BrowserGrabSetModeInputSchema,
  BrowserPageIdInputSchema
} from './control-input'

export function parseGrabSetModeInput(input: object): BrowserGrabSetModeInput {
  const parsed = BrowserGrabSetModeInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error('browser_command_input_invalid')
  }
  return parsed.data
}

export function parseGrabAwaitInput(input: object): BrowserGrabAwaitInput {
  const parsed = BrowserGrabAwaitInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error('browser_command_input_invalid')
  }
  return parsed.data
}

export function parseGrabCaptureInput(input: object): BrowserGrabCaptureInput {
  const parsed = BrowserGrabCaptureInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error('browser_command_input_invalid')
  }
  return parsed.data
}

export function parsePageIdInput(input: object): BrowserPageIdInput {
  const parsed = BrowserPageIdInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error('browser_command_input_invalid')
  }
  return parsed.data
}
