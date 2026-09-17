import type { ReadClipboardTextOptions } from '~renderer/clipboard/text'
export type ShellUiApi = {
  readClipboardText: (options?: ReadClipboardTextOptions) => Promise<string>
  readSelectionClipboardText: (options?: ReadClipboardTextOptions) => Promise<string>
  readClipboardImageBase64: () => Promise<string | null>
  saveClipboardImageAsTempFile: (args?: {
    connectionId?: string | null
    runtimeEnvironmentId?: string | null
  }) => Promise<string | null>
  saveImageBlobAsTempFile: (
    blob: Blob,
    args?: { connectionId?: string | null; runtimeEnvironmentId?: string | null }
  ) => Promise<string>
  writeClipboardText: (text: string) => Promise<void>
  writeSelectionClipboardText: (text: string) => Promise<void>
  writeClipboardImage: (dataUrl: string) => Promise<void>
  writeClipboardFile: (
    args: { filePath: string } | string
  ) => Promise<{ ok: boolean; reason?: string }>
  getZoomLevel: () => number
  setZoomLevel: (level: number) => void
}
