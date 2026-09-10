import { evaluateBrowserValue, sendBrowserCdp } from './cdp'

type ElementAction =
  | 'check'
  | 'clear'
  | 'click'
  | 'dblclick'
  | 'fill'
  | 'focus'
  | 'hover'
  | 'scroll-into-view'
  | 'select'
  | 'select-all'

type ElementActionPayload = {
  action: ElementAction
  element: string
  value?: string
}

export async function runElementAction(
  tabId: number,
  payload: ElementActionPayload
): Promise<unknown> {
  return evaluateBrowserValue(
    tabId,
    `(${executeElementAction.toString()})(${JSON.stringify(payload)})`
  )
}

export async function insertBrowserText(tabId: number, text: string): Promise<void> {
  await sendBrowserCdp(tabId, 'Input.insertText', { text })
}

export async function pressBrowserKey(tabId: number, key: string): Promise<void> {
  const modifiers = keyModifiers(key)
  const normalized = key.split('+').at(-1) ?? key
  await sendBrowserCdp(tabId, 'Input.dispatchKeyEvent', {
    key: normalized,
    modifiers,
    text: normalized.length === 1 ? normalized : undefined,
    type: 'keyDown'
  })
  await sendBrowserCdp(tabId, 'Input.dispatchKeyEvent', {
    key: normalized,
    modifiers,
    type: 'keyUp'
  })
}

export async function scrollBrowserPage(
  tabId: number,
  direction: 'down' | 'up',
  amount: number
): Promise<void> {
  await evaluateBrowserValue(
    tabId,
    `window.scrollBy({behavior:'instant',top:${direction === 'down' ? amount : -amount}}); true`
  )
}

export async function dragBrowserElement(tabId: number, from: string, to: string): Promise<void> {
  await evaluateBrowserValue(
    tabId,
    `(${executeElementDrag.toString()})(${JSON.stringify({ from, to })})`
  )
}

function keyModifiers(key: string): number {
  let modifiers = 0
  if (/Alt/i.test(key)) {
    modifiers |= 1
  }
  if (/Control|Ctrl/i.test(key)) {
    modifiers |= 2
  }
  if (/Meta|Command|Cmd/i.test(key)) {
    modifiers |= 4
  }
  if (/Shift/i.test(key)) {
    modifiers |= 8
  }
  return modifiers
}

function executeElementAction(payload: ElementActionPayload): unknown {
  const resolveElement = (target: string): HTMLElement => {
    const reference = /^@?(e\d+)$/.exec(target)?.[1] ?? null
    let element: Element | null = reference
      ? document.querySelector(`[data-agentstart-browser-ref="${reference}"]`)
      : null
    if (!element) {
      try {
        element = document.querySelector(target)
      } catch {
        element = null
      }
    }
    if (!(element instanceof HTMLElement)) {
      throw new Error(`browser_element_not_found:${target}`)
    }
    return element
  }
  const element = resolveElement(payload.element)
  const dispatchValue = (): void => {
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }
  switch (payload.action) {
    case 'click':
      element.click()
      return payload.element
    case 'dblclick':
      element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
      return payload.element
    case 'hover':
      element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }))
      return payload.element
    case 'focus':
      element.focus()
      return payload.element
    case 'scroll-into-view':
      element.scrollIntoView({ block: 'center', inline: 'center' })
      return payload.element
    case 'clear':
    case 'fill': {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        throw new Error('browser_element_not_editable')
      }
      element.focus()
      element.value = payload.action === 'fill' ? (payload.value ?? '') : ''
      dispatchValue()
      return payload.element
    }
    case 'check':
      if (!(element instanceof HTMLInputElement)) {
        throw new Error('browser_element_not_checkable')
      }
      element.checked = payload.value !== 'false'
      dispatchValue()
      return element.checked
    case 'select':
      if (!(element instanceof HTMLSelectElement)) {
        throw new Error('browser_element_not_selectable')
      }
      element.value = payload.value ?? ''
      dispatchValue()
      return element.value
    case 'select-all':
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        throw new Error('browser_element_not_editable')
      }
      element.focus()
      element.select()
      return payload.element
  }
}

function executeElementDrag(payload: { from: string; to: string }): void {
  const find = (target: string): Element | null => {
    const reference = /^@?(e\d+)$/.exec(target)?.[1] ?? null
    if (reference) {
      return document.querySelector(`[data-agentstart-browser-ref="${reference}"]`)
    }
    return document.querySelector(target)
  }
  const from = find(payload.from)
  const to = find(payload.to)
  if (!from || !to) {
    throw new Error('browser_drag_element_not_found')
  }
  const transfer = new DataTransfer()
  from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }))
  to.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: transfer }))
  to.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: transfer }))
  to.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }))
  from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }))
}
