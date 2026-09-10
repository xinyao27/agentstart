import type { PdfExportInput } from '@agentstart/client/pdf-export'

const PDF_EXPORT_STORAGE_PREFIX = 'pdfExport:'

void mountExportDocument()

async function mountExportDocument(): Promise<void> {
  const token = new URL(location.href).searchParams.get('token')
  if (!token) {
    await signalReady('', 'PDF export token is missing')
    return
  }
  const storageKey = `${PDF_EXPORT_STORAGE_PREFIX}${token}`
  const stored: unknown = await chrome.storage.session.get(storageKey)
  const input = readExportInput(
    typeof stored === 'object' && stored !== null ? Reflect.get(stored, storageKey) : null
  )
  if (!input) {
    await signalReady(token, 'PDF export document is unavailable')
    return
  }

  const exported = new DOMParser().parseFromString(input.html, 'text/html')
  document.head.replaceChildren(...cloneNodes(exported.head.childNodes))
  document.body.replaceChildren(...cloneNodes(exported.body.childNodes))
  document.title = input.title
  await waitForImages()
  await signalReady(token)
}

function cloneNodes(nodes: NodeListOf<ChildNode>): Node[] {
  return Array.from(nodes, (node) => document.importNode(node, true))
}

function readExportInput(value: unknown): PdfExportInput | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const html = Reflect.get(value, 'html')
  const title = Reflect.get(value, 'title')
  return typeof html === 'string' && typeof title === 'string' ? { html, title } : null
}

async function waitForImages(): Promise<void> {
  await Promise.all(
    Array.from(document.images, (image) => {
      if (image.complete) {
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => {
        image.addEventListener('error', () => resolve(), { once: true })
        image.addEventListener('load', () => resolve(), { once: true })
      })
    })
  )
}

async function signalReady(token: string, error?: string): Promise<void> {
  await chrome.runtime
    .sendMessage({ ...(error ? { error } : {}), token, type: 'html-pdf-export-ready' })
    .catch(() => undefined)
}
