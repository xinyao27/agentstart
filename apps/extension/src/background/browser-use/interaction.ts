import { evaluateBrowserValue, sendBrowserCdp } from './cdp'
import {
  dragBrowserElement,
  insertBrowserText,
  pressBrowserKey,
  runElementAction,
  scrollBrowserPage
} from './dom'
import { downloadBrowserFile } from './download'
import {
  findPageElement,
  highlightPageElement,
  readPageState,
  readPageValue,
  waitForBrowserCondition
} from './page-state'
import { captureBrowserSnapshot } from './snapshot'
import { readBrowserCommandInput, resolveBrowserTab } from './target'

export async function executeBrowserInteraction(
  method: string,
  rawInput: unknown
): Promise<unknown> {
  const input = readBrowserCommandInput(rawInput)
  const tab = await resolveBrowserTab(input)
  if (tab.id === undefined) {
    throw new Error('browser_tab_id_missing')
  }
  const tabId = tab.id
  switch (method) {
    case 'browser.snapshot':
      return captureBrowserSnapshot(tabId)
    case 'browser.click':
      return { clicked: await elementAction(tabId, input, 'click') }
    case 'browser.dblclick':
      return { clicked: await elementAction(tabId, input, 'dblclick') }
    case 'browser.download':
      return downloadBrowserFile(tabId, input)
    case 'browser.fill':
      return fillBrowserElement(tabId, input)
    case 'browser.type':
      await insertBrowserText(tabId, readString(input, 'input'))
      return { typed: true }
    case 'browser.upload':
      return uploadBrowserFiles(tabId, input)
    case 'browser.keyboardInsertText':
      await insertBrowserText(tabId, readString(input, 'text'))
      return { inserted: true }
    case 'browser.select':
      return selectBrowserElement(tabId, input)
    case 'browser.scroll':
      return scrollCommand(tabId, input)
    case 'browser.screenshot':
      return captureScreenshot(tabId, input, false)
    case 'browser.fullScreenshot':
      return captureScreenshot(tabId, input, true)
    case 'browser.pdf':
      return capturePdf(tabId)
    case 'browser.eval':
      return evaluateCommand(tabId, tab, input)
    case 'browser.hover':
      return { hovered: await elementAction(tabId, input, 'hover') }
    case 'browser.drag':
      return dragCommand(tabId, input)
    case 'browser.wait':
      return waitCommand(tabId, input)
    case 'browser.check':
      return checkCommand(tabId, input)
    case 'browser.focus':
      return { focused: await elementAction(tabId, input, 'focus') }
    case 'browser.clear':
      return { cleared: await elementAction(tabId, input, 'clear') }
    case 'browser.selectAll':
      return { selected: await elementAction(tabId, input, 'select-all') }
    case 'browser.keypress':
      return keypressCommand(tabId, input)
    case 'browser.scrollIntoView':
      return { scrolled: await elementAction(tabId, input, 'scroll-into-view') }
    case 'browser.get':
      return getBrowserValue(tabId, input)
    case 'browser.is':
      return readBrowserState(tabId, input)
    case 'browser.find':
      return findBrowserElement(tabId, input)
    case 'browser.highlight':
      return highlightBrowserElement(tabId, input)
    default:
      throw new Error(`browser_interaction_command_unsupported:${method}`)
  }
}

async function elementAction(
  tabId: number,
  input: Record<string, unknown>,
  action: 'clear' | 'click' | 'dblclick' | 'focus' | 'hover' | 'scroll-into-view' | 'select-all'
): Promise<string> {
  await runElementAction(tabId, { action, element: readString(input, 'element') })
  return readString(input, 'element')
}

async function fillBrowserElement(tabId: number, input: Record<string, unknown>) {
  const element = readString(input, 'element')
  await runElementAction(tabId, {
    action: 'fill',
    element,
    value: readString(input, 'value', true)
  })
  return { filled: element }
}

async function selectBrowserElement(tabId: number, input: Record<string, unknown>) {
  const element = readString(input, 'element')
  await runElementAction(tabId, {
    action: 'select',
    element,
    value: readString(input, 'value', true)
  })
  return { selected: element }
}

async function uploadBrowserFiles(tabId: number, input: Record<string, unknown>) {
  const element = readString(input, 'element')
  const files = Reflect.get(input, 'files')
  if (!Array.isArray(files) || !files.every((file) => typeof file === 'string')) {
    throw new Error('browser_upload_files_invalid')
  }
  const document = await sendBrowserCdp(tabId, 'DOM.getDocument', { depth: 0 })
  const root = readNestedRecord(document, 'root')
  const nodeId = root ? Reflect.get(root, 'nodeId') : null
  if (typeof nodeId !== 'number') {
    throw new Error('browser_dom_root_missing')
  }
  const reference = /^@?(e\d+)$/.exec(element)?.[1] ?? null
  const selector = reference ? `[data-agentstart-browser-ref="${reference}"]` : element
  const match = await sendBrowserCdp(tabId, 'DOM.querySelector', { nodeId, selector })
  const matchedNodeId = readNestedNumber(match, 'nodeId')
  if (matchedNodeId === 0) {
    throw new Error(`browser_element_not_found:${element}`)
  }
  await sendBrowserCdp(tabId, 'DOM.setFileInputFiles', { files, nodeId: matchedNodeId })
  return { uploaded: files.length }
}

async function scrollCommand(tabId: number, input: Record<string, unknown>) {
  const direction = Reflect.get(input, 'direction')
  if (direction !== 'down' && direction !== 'up') {
    throw new Error('browser_scroll_direction_invalid')
  }
  const amount = readNumber(input, 'amount') ?? 600
  await scrollBrowserPage(tabId, direction, amount)
  return { scrolled: direction }
}

async function captureScreenshot(
  tabId: number,
  input: Record<string, unknown>,
  captureBeyondViewport: boolean
) {
  const format = Reflect.get(input, 'format') === 'jpeg' ? 'jpeg' : 'png'
  const response = await sendBrowserCdp(tabId, 'Page.captureScreenshot', {
    captureBeyondViewport,
    format,
    fromSurface: true
  })
  const data = readNestedString(response, 'data')
  return { data, format }
}

async function capturePdf(tabId: number) {
  const response = await sendBrowserCdp(tabId, 'Page.printToPDF', {
    printBackground: true,
    transferMode: 'ReturnAsBase64'
  })
  return { data: readNestedString(response, 'data') }
}

async function evaluateCommand(
  tabId: number,
  tab: chrome.tabs.Tab,
  input: Record<string, unknown>
) {
  const result = await evaluateBrowserValue(tabId, readString(input, 'expression'))
  return {
    origin: tab.url ? new URL(tab.url).origin : '',
    result: typeof result === 'string' ? result : JSON.stringify(result ?? null)
  }
}

async function dragCommand(tabId: number, input: Record<string, unknown>) {
  const from = readString(input, 'from')
  const to = readString(input, 'to')
  await dragBrowserElement(tabId, from, to)
  return { dragged: { from, to } }
}

async function waitCommand(tabId: number, input: Record<string, unknown>) {
  const timeout = Math.min(readNumber(input, 'timeout') ?? 5_000, 30_000)
  const payload = {
    fn: readOptionalString(input, 'fn'),
    selector: readOptionalString(input, 'selector'),
    state: readOptionalString(input, 'state'),
    text: readOptionalString(input, 'text'),
    timeout,
    url: readOptionalString(input, 'url')
  }
  await evaluateBrowserValue(
    tabId,
    `(${waitForBrowserCondition.toString()})(${JSON.stringify(payload)})`
  )
  return { waited: true }
}

async function checkCommand(tabId: number, input: Record<string, unknown>) {
  const checked = Reflect.get(input, 'checked') !== false
  await runElementAction(tabId, {
    action: 'check',
    element: readString(input, 'element'),
    value: String(checked)
  })
  return { checked }
}

async function keypressCommand(tabId: number, input: Record<string, unknown>) {
  const key = readString(input, 'key')
  await pressBrowserKey(tabId, key)
  return { pressed: key }
}

async function getBrowserValue(tabId: number, input: Record<string, unknown>): Promise<unknown> {
  const payload = {
    selector: readOptionalString(input, 'selector'),
    what: readString(input, 'what')
  }
  return evaluateBrowserValue(tabId, `(${readPageValue.toString()})(${JSON.stringify(payload)})`)
}

async function readBrowserState(tabId: number, input: Record<string, unknown>): Promise<unknown> {
  const payload = { selector: readString(input, 'selector'), what: readString(input, 'what') }
  return evaluateBrowserValue(tabId, `(${readPageState.toString()})(${JSON.stringify(payload)})`)
}

async function findBrowserElement(tabId: number, input: Record<string, unknown>): Promise<unknown> {
  const payload = {
    action: readString(input, 'action'),
    locator: readString(input, 'locator'),
    text: readOptionalString(input, 'text'),
    value: readString(input, 'value')
  }
  return evaluateBrowserValue(tabId, `(${findPageElement.toString()})(${JSON.stringify(payload)})`)
}

async function highlightBrowserElement(tabId: number, input: Record<string, unknown>) {
  const selector = readString(input, 'selector')
  await evaluateBrowserValue(
    tabId,
    `(${highlightPageElement.toString()})(${JSON.stringify(selector)})`
  )
  return { highlighted: selector }
}

function readString(input: Record<string, unknown>, key: string, allowEmpty = false): string {
  const value = Reflect.get(input, key)
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new Error(`browser_command_value_missing:${key}`)
  }
  return value
}

function readOptionalString(input: Record<string, unknown>, key: string): string | null {
  const value = Reflect.get(input, key)
  return typeof value === 'string' ? value : null
}

function readNumber(input: Record<string, unknown>, key: string): number | null {
  const value = Reflect.get(input, key)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readNestedString(value: unknown, key: string): string {
  const nested = typeof value === 'object' && value !== null ? Reflect.get(value, key) : null
  if (typeof nested !== 'string') {
    throw new Error(`browser_cdp_value_missing:${key}`)
  }
  return nested
}

function readNestedNumber(value: unknown, key: string): number {
  const nested = typeof value === 'object' && value !== null ? Reflect.get(value, key) : null
  if (typeof nested !== 'number') {
    throw new Error(`browser_cdp_value_missing:${key}`)
  }
  return nested
}

function readNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const nested = Reflect.get(value, key)
  return typeof nested === 'object' && nested !== null ? nested : null
}
