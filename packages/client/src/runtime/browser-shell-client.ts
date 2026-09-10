import type { ShellPlatformOutcomeValue } from '@agentstart/protocol'

import type { ShellPlatformApi } from './shell-platform-client'

const unavailablePathResult: ShellPlatformOutcomeValue = {
  ok: false,
  reason: 'remote-runtime-unsupported'
}

function openBrowserTarget(target: string): void {
  window.open(target, '_blank', 'noopener,noreferrer')
}

function pickBrowserFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.hidden = true
    document.body.append(input)
    let settled = false
    const settle = (file: File | null): void => {
      if (settled) {
        return
      }
      settled = true
      window.removeEventListener('focus', handleWindowFocus)
      input.remove()
      resolve(file)
    }
    const handleWindowFocus = (): void => {
      setTimeout(() => {
        if (!input.files?.length) {
          settle(null)
        }
      })
    }
    input.addEventListener('change', () => settle(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', () => settle(null), { once: true })
    window.addEventListener('focus', handleWindowFocus, { once: true })
    input.click()
  })
}

function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('invalid_file_result'))
    }
    reader.readAsDataURL(file)
  })
}

const browserShellApi: ShellPlatformApi = {
  openPath: async (path) => openBrowserTarget(path),
  openInFileManager: () => Promise.resolve(unavailablePathResult),
  openInExternalEditor: () => Promise.resolve(unavailablePathResult),
  openUrl: async (url) => openBrowserTarget(url),
  openFilePath: () => Promise.resolve(false),
  openFileUri: async (uri) => openBrowserTarget(uri),
  pathExists: () => Promise.reject(new Error('Local shell paths are unavailable in the browser.')),
  // Why: these signatures can only return native absolute paths. A browser
  // FileSystemHandle cannot be represented without lying about its identity.
  pickAttachment: () => Promise.resolve(null),
  pickImage: () => Promise.resolve(null),
  pickAudio: () => Promise.resolve(null),
  pickDirectory: () => Promise.resolve(null),
  // Why: this picker returns content rather than an absolute path, so the browser
  // adapter can provide a real restricted equivalent.
  pickRepoIconImage: async () => {
    const file = await pickBrowserFile('image/*')
    if (!file) {
      return null
    }
    return { dataUrl: await readFileDataUrl(file), fileName: file.name }
  }
}

export function getBrowserShellApi(): ShellPlatformApi {
  return browserShellApi
}
