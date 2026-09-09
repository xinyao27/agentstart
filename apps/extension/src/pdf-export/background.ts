import type { PdfExportResult } from '@yiru/client/pdf-export'

import { acquireCdp, releaseCdp, sendCdp } from '../background/cdp/session'

const EXPORT_READY_TIMEOUT_MS = 30_000
const EXPORT_DOWNLOAD_TIMEOUT_MS = 120_000

type ExportReadyResult = { error?: string }

const readyResolvers = new Map<string, (result: ExportReadyResult) => void>()

export function handlePdfExportMessage(
  message: object,
  respond: (response: unknown) => void
): boolean | null {
  const type = Reflect.get(message, 'type')
  if (type === 'html-pdf-export-ready') {
    const token = Reflect.get(message, 'token')
    const error = Reflect.get(message, 'error')
    if (typeof token === 'string') {
      readyResolvers.get(token)?.(typeof error === 'string' ? { error } : {})
    }
    respond({ ok: true })
    return false
  }
  if (type !== 'html-pdf-export') {
    return null
  }
  const token = Reflect.get(message, 'token')
  if (typeof token !== 'string' || !/^[0-9a-f-]{36}$/i.test(token)) {
    respond({ error: 'PDF export token is invalid', ok: false })
    return false
  }
  void exportPdf(token).then(
    (result) => respond({ ok: true, result }),
    (error: unknown) =>
      respond({
        error: error instanceof Error ? error.message : 'Failed to export PDF',
        ok: false
      })
  )
  return true
}

async function exportPdf(token: string): Promise<PdfExportResult> {
  const ready = waitForExportPage(token)
  const tab = await chrome.tabs.create({
    active: false,
    url: chrome.runtime.getURL(`export.html?token=${encodeURIComponent(token)}`)
  })
  if (tab.id === undefined) {
    ready.cancel()
    throw new Error('PDF export tab is unavailable')
  }

  try {
    const page = await ready.promise
    if (page.error) {
      throw new Error(page.error)
    }
    await acquireCdp(tab.id, 'pdf-export')
    try {
      const response = await sendCdp(tab.id, 'Page.printToPDF', {
        marginBottom: 0.75,
        marginLeft: 0.75,
        marginRight: 0.75,
        marginTop: 0.75,
        paperHeight: 11.7,
        paperWidth: 8.3,
        printBackground: true,
        transferMode: 'ReturnAsBase64'
      })
      const data = readPdfData(response)
      return await downloadPdf(data, await readExportTitle(token))
    } finally {
      await releaseCdp(tab.id, 'pdf-export')
    }
  } finally {
    ready.cancel()
    await chrome.tabs.remove(tab.id).catch(() => undefined)
  }
}

function waitForExportPage(token: string): {
  cancel: () => void
  promise: Promise<ExportReadyResult>
} {
  let cancel = (): void => {}
  const promise = new Promise<ExportReadyResult>((resolve, reject) => {
    const timer = setTimeout(
      () => settle(() => reject(new Error('PDF export timed out'))),
      EXPORT_READY_TIMEOUT_MS
    )
    const settle = (complete: () => void): void => {
      clearTimeout(timer)
      readyResolvers.delete(token)
      complete()
    }
    readyResolvers.set(token, (result) => settle(() => resolve(result)))
    cancel = () => settle(() => {})
  })
  return { cancel, promise }
}

async function readExportTitle(token: string): Promise<string> {
  const storageKey = `pdfExport:${token}`
  const stored: unknown = await chrome.storage.session.get(storageKey)
  const value =
    typeof stored === 'object' && stored !== null ? Reflect.get(stored, storageKey) : null
  const title = typeof value === 'object' && value !== null ? Reflect.get(value, 'title') : null
  const sanitized =
    typeof title === 'string' ? title.replaceAll(/[/\\:*?"<>|]/g, '_').slice(0, 100) : ''
  return `${sanitized || 'export'}.pdf`
}

function readPdfData(response: unknown): string {
  const data =
    typeof response === 'object' && response !== null ? Reflect.get(response, 'data') : null
  if (typeof data !== 'string' || data.length === 0) {
    throw new Error('Chrome returned an empty PDF')
  }
  return data
}

async function downloadPdf(data: string, filename: string): Promise<PdfExportResult> {
  let downloadId: number
  try {
    downloadId = await chrome.downloads.download({
      filename,
      saveAs: true,
      url: `data:application/pdf;base64,${data}`
    })
  } catch (error) {
    return isCancellation(error)
      ? { cancelled: true, success: false }
      : { error: error instanceof Error ? error.message : 'PDF download failed', success: false }
  }
  return waitForDownload(downloadId)
}

function waitForDownload(downloadId: number): Promise<PdfExportResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => settle({ error: 'PDF download timed out', success: false }),
      EXPORT_DOWNLOAD_TIMEOUT_MS
    )
    const onChanged = (delta: chrome.downloads.DownloadDelta): void => {
      if (delta.id !== downloadId || !delta.state?.current) {
        return
      }
      if (delta.state.current === 'interrupted') {
        settle({ cancelled: delta.error?.current === 'USER_CANCELED', success: false })
        return
      }
      if (delta.state.current === 'complete') {
        void chrome.downloads.search({ id: downloadId }).then((items) => {
          const item = items[0]
          settle(
            item
              ? { filePath: item.filename, success: true }
              : { error: 'PDF download record is unavailable', success: false }
          )
        })
      }
    }
    const settle = (result: PdfExportResult): void => {
      clearTimeout(timer)
      chrome.downloads.onChanged.removeListener(onChanged)
      resolve(result)
    }
    chrome.downloads.onChanged.addListener(onChanged)
  })
}

function isCancellation(error: unknown): boolean {
  return error instanceof Error && /cancel/i.test(error.message)
}
