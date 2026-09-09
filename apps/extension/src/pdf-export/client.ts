import type { PdfExportInput, PdfExportResult } from '@yiru/client/pdf-export'

import { requestBrowserPermissions } from '../browser/permission'

const PDF_EXPORT_STORAGE_PREFIX = 'pdfExport:'

export async function exportHtmlToPdf(input: PdfExportInput): Promise<PdfExportResult> {
  if (!input.html.trim()) {
    return { error: 'No content to export', success: false }
  }
  if (!(await requestBrowserPermissions({ permissions: ['downloads'] }))) {
    return { cancelled: true, success: false }
  }

  const token = crypto.randomUUID()
  const storageKey = `${PDF_EXPORT_STORAGE_PREFIX}${token}`
  await chrome.storage.session.set({ [storageKey]: input })
  try {
    const response: unknown = await chrome.runtime.sendMessage({ token, type: 'html-pdf-export' })
    return readExportResult(response)
  } finally {
    await chrome.storage.session.remove(storageKey)
  }
}

function readExportResult(response: unknown): PdfExportResult {
  if (typeof response !== 'object' || response === null) {
    return { error: 'PDF export returned no result', success: false }
  }
  const result = Reflect.get(response, 'result')
  if (Reflect.get(response, 'ok') !== true || typeof result !== 'object' || result === null) {
    const error = Reflect.get(response, 'error')
    return {
      error: typeof error === 'string' ? error : 'Failed to export PDF',
      success: false
    }
  }
  if (Reflect.get(result, 'success') === true) {
    const filePath = Reflect.get(result, 'filePath')
    return typeof filePath === 'string'
      ? { filePath, success: true }
      : { error: 'PDF download path is unavailable', success: false }
  }
  const cancelled = Reflect.get(result, 'cancelled')
  const error = Reflect.get(result, 'error')
  return {
    ...(cancelled === true ? { cancelled: true } : {}),
    ...(typeof error === 'string' ? { error } : {}),
    success: false
  }
}
