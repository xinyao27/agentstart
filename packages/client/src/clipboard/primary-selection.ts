import type { ReadClipboardTextOptions } from '~renderer/clipboard/text'
import { shellClient } from '~renderer/runtime/shell-client'

export const PRIMARY_SELECTION_MAX_LENGTH = 65_536
const PRIMARY_SELECTION_MAX_BYTES = PRIMARY_SELECTION_MAX_LENGTH * 4
const PRIMARY_SELECTION_NATIVE_PASTE_SUPPRESSION_MS = 750

let enabled = false
let primarySelectionText = ''
let nativePasteSuppressionUntil = 0

type SelectionClipboardApi = {
  readSelectionClipboardText: (options?: ReadClipboardTextOptions) => Promise<string>
  writeSelectionClipboardText: (text: string) => Promise<void>
}

function isLinuxUserAgent(userAgent: string): boolean {
  return !userAgent.includes('Mac') && !userAgent.includes('Windows') && userAgent.includes('Linux')
}

function getUserAgent(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent
}

function getSelectionClipboardApi(): SelectionClipboardApi | null {
  if (typeof window === 'undefined') {
    return null
  }
  return shellClient.ui
}

function shouldUseSystemPrimarySelectionClipboard(userAgent = getUserAgent()): boolean {
  return isLinuxUserAgent(userAgent) && getSelectionClipboardApi() !== null
}

function canStorePrimarySelectionText(text: string): boolean {
  return enabled && text.length > 0 && text.length <= PRIMARY_SELECTION_MAX_LENGTH
}

export function setPrimarySelectionEnabled(nextEnabled: boolean): void {
  enabled = nextEnabled
  if (!enabled) {
    primarySelectionText = ''
    nativePasteSuppressionUntil = 0
  }
}

// Why: Chromium follows a handled X11 middle click with a native paste event;
// the terminal owns the first insertion, so the follow-up must be swallowed.
export function armPrimarySelectionNativePasteSuppression(now: number = Date.now()): void {
  if (!enabled || !isLinuxUserAgent(getUserAgent())) {
    return
  }
  nativePasteSuppressionUntil = now + PRIMARY_SELECTION_NATIVE_PASTE_SUPPRESSION_MS
}

export function shouldSuppressPrimarySelectionNativePaste(now: number = Date.now()): boolean {
  return enabled && now <= nativePasteSuppressionUntil
}

export function isPrimarySelectionEnabled(): boolean {
  return enabled
}

export function setPrimarySelectionText(text: string): boolean {
  if (!canStorePrimarySelectionText(text)) {
    return false
  }
  primarySelectionText = text
  const selectionClipboardApi = shouldUseSystemPrimarySelectionClipboard()
    ? getSelectionClipboardApi()
    : null
  if (selectionClipboardApi) {
    void selectionClipboardApi.writeSelectionClipboardText(text).catch(() => {})
    return true
  }

  return true
}

export async function readPrimarySelectionText(): Promise<string> {
  if (!enabled) {
    return ''
  }
  const selectionClipboardApi = shouldUseSystemPrimarySelectionClipboard()
    ? getSelectionClipboardApi()
    : null
  if (!selectionClipboardApi) {
    return primarySelectionText
  }
  try {
    return await selectionClipboardApi.readSelectionClipboardText({
      maxBytes: PRIMARY_SELECTION_MAX_BYTES
    })
  } catch {
    return primarySelectionText
  }
}
