import { acquireCdp, releaseCdp, sendCdp } from './cdp/session'

type Respond = (response: unknown) => void

export function handleVisualCaptureMessage(message: object, respond: Respond): boolean | null {
  const type = Reflect.get(message, 'type')
  if (type !== 'visual-capture' && type !== 'visual-highlight') {
    return null
  }
  const tabId = Reflect.get(message, 'tabId')
  if (typeof tabId !== 'number' || !Number.isInteger(tabId)) {
    respond({ error: 'invalid_tab_id', ok: false })
    return false
  }
  const task =
    type === 'visual-capture'
      ? captureTab(tabId).then((imageDataUrl) => ({ imageDataUrl, ok: true }))
      : highlightChanges(tabId, Reflect.get(message, 'regions')).then(() => ({ ok: true }))
  void task.then(respond, (error: unknown) =>
    respond({ error: error instanceof Error ? error.message : String(error), ok: false })
  )
  return true
}

async function highlightChanges(tabId: number, value: unknown): Promise<void> {
  const regions = parseRegions(value)
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [regions],
    // Why: chrome-types still declares ScriptInjection.func as zero-argument even though Chrome
    // passes the JSON-serializable `args` array supported since Chrome 92.
    func: renderHighlights as () => void
  })
}

function renderHighlights(
  changes: { height: number; width: number; x: number; y: number }[]
): void {
  document.getElementById('agentstart-visual-diff')?.remove()
  const overlay = document.createElement('div')
  overlay.id = 'agentstart-visual-diff'
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483645;pointer-events:none;overflow:hidden'
  for (const change of changes) {
    const region = document.createElement('div')
    region.style.cssText = `position:absolute;left:${change.x * 100}%;top:${change.y * 100}%;width:${change.width * 100}%;height:${change.height * 100}%;background:rgba(239,68,68,.22);outline:2px solid rgb(220,38,38)`
    overlay.append(region)
  }
  document.documentElement.append(overlay)
  setTimeout(() => overlay.remove(), 5_000)
}

function parseRegions(value: unknown): { height: number; width: number; x: number; y: number }[] {
  if (!Array.isArray(value) || value.length > 64) {
    throw new Error('visual_highlight_regions_invalid')
  }
  return value.map((region) => {
    if (typeof region !== 'object' || region === null) {
      throw new Error('visual_highlight_regions_invalid')
    }
    const result = {
      height: Reflect.get(region, 'height'),
      width: Reflect.get(region, 'width'),
      x: Reflect.get(region, 'x'),
      y: Reflect.get(region, 'y')
    }
    if (
      Object.values(result).some(
        (coordinate) => typeof coordinate !== 'number' || coordinate < 0 || coordinate > 1
      )
    ) {
      throw new Error('visual_highlight_regions_invalid')
    }
    return result
  })
}

async function captureTab(tabId: number): Promise<string> {
  const tab = await chrome.tabs.get(tabId)
  if (!tab.active || !tab.url || !isLocalPreviewUrl(tab.url)) {
    throw new Error('visual_capture_requires_local_preview')
  }
  await acquireCdp(tabId, 'visual-capture')
  try {
    const response = await sendCdp(tabId, 'Page.captureScreenshot', {
      captureBeyondViewport: false,
      format: 'png',
      fromSurface: true
    })
    const data =
      typeof response === 'object' && response !== null ? Reflect.get(response, 'data') : null
    if (typeof data !== 'string') {
      throw new Error('visual_capture_response_invalid')
    }
    return `data:image/png;base64,${data}`
  } finally {
    await releaseCdp(tabId, 'visual-capture')
  }
}

function isLocalPreviewUrl(rawUrl: string): boolean {
  const url = new URL(rawUrl)
  return (
    ['http:', 'https:'].includes(url.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
  )
}
