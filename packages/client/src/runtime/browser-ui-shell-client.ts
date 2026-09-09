import {
  assertClipboardTextWriteWithinLimitWithYield,
  assertClipboardTextWithinLimitWithYield
} from '~renderer/clipboard/text'
import { translate } from '~renderer/i18n/i18n'

import type { ShellUiApi } from './shell-ui-client'

function unavailableSelectionClipboardError(): Error {
  return new Error(
    translate(
      'auto.runtime.webUiShellClient.selectionClipboardUnavailable',
      'Selection clipboard is unavailable in the browser.'
    )
  )
}

function createBrowserShellUIApi(): ShellUiApi {
  let zoomLevel = 0
  return {
    readClipboardText: async (options) =>
      assertClipboardTextWithinLimitWithYield(
        await (navigator.clipboard?.readText?.() ?? ''),
        options
      ),
    readSelectionClipboardText: () => Promise.reject(unavailableSelectionClipboardError()),
    readClipboardImageBase64: async () =>
      (await import('./browser-clipboard')).readBrowserClipboardImageBase64(),
    saveClipboardImageAsTempFile: async (args) =>
      (await import('./browser-clipboard')).saveBrowserClipboardImageAsTempFile(args),
    writeClipboardText: async (text) => {
      await assertClipboardTextWriteWithinLimitWithYield(text)
      await (navigator.clipboard?.writeText?.(text) ?? Promise.resolve())
    },
    writeSelectionClipboardText: () => Promise.reject(unavailableSelectionClipboardError()),
    writeClipboardImage: async (dataUrl) =>
      (await import('./browser-clipboard')).writeBrowserClipboardImage(dataUrl),
    writeClipboardFile: () => Promise.resolve({ ok: false, reason: 'unsupported-platform' }),
    getZoomLevel: () => zoomLevel,
    setZoomLevel: (level) => {
      zoomLevel = level
    }
  }
}

let browserShellUIApi: ShellUiApi | null = null

export function getBrowserShellUIApi(): ShellUiApi {
  browserShellUIApi ??= createBrowserShellUIApi()
  return browserShellUIApi
}
