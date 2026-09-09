import { executeBrowserCommand } from './command'
import { abortBrowserDownload, readBrowserDownload } from './download'

export function handleBrowserUseMessage(
  message: object,
  respond: (response: unknown) => void
): boolean | null {
  const messageType = Reflect.get(message, 'type')
  if (messageType === 'browser-download-read' || messageType === 'browser-download-abort') {
    const receiptId = Reflect.get(message, 'receiptId')
    if (typeof receiptId !== 'string') {
      respond({ error: 'browser_download_receipt_invalid', ok: false })
      return false
    }
    const operation =
      messageType === 'browser-download-read'
        ? readBrowserDownload(receiptId)
        : abortBrowserDownload(receiptId).then(() => ({ aborted: true }))
    void operation.then(
      (result) => respond({ ok: true, result }),
      (error: unknown) =>
        respond({ error: error instanceof Error ? error.message : String(error), ok: false })
    )
    return true
  }
  if (messageType !== 'browser-command') {
    return null
  }
  const method = Reflect.get(message, 'method')
  if (typeof method !== 'string' || !method.startsWith('browser.')) {
    respond({ error: 'browser_command_method_invalid', ok: false })
    return false
  }
  const authorityId = Reflect.get(message, 'authorityId')
  if (authorityId !== null && typeof authorityId !== 'string') {
    respond({ error: 'browser_command_authority_invalid', ok: false })
    return false
  }
  void executeBrowserCommand(method, Reflect.get(message, 'input'), authorityId).then(
    (result) => respond({ ok: true, result }),
    (error: unknown) =>
      respond({ error: error instanceof Error ? error.message : String(error), ok: false })
  )
  return true
}
