import { evaluateBrowserValue } from './cdp'
import { browserPageId } from './target'

type SnapshotPayload = {
  refs: { name: string; ref: string; role: string }[]
  snapshot: string
  title: string
  url: string
}

export async function captureBrowserSnapshot(tabId: number): Promise<
  SnapshotPayload & {
    browserPageId: string
  }
> {
  const value = await evaluateBrowserValue(tabId, `(${collectBrowserSnapshot.toString()})()`)
  if (typeof value !== 'object' || value === null) {
    throw new Error('browser_snapshot_invalid')
  }
  const refs = Reflect.get(value, 'refs')
  const snapshot = Reflect.get(value, 'snapshot')
  const title = Reflect.get(value, 'title')
  const url = Reflect.get(value, 'url')
  if (
    !Array.isArray(refs) ||
    typeof snapshot !== 'string' ||
    typeof title !== 'string' ||
    typeof url !== 'string'
  ) {
    throw new Error('browser_snapshot_invalid')
  }
  return {
    browserPageId: browserPageId(tabId),
    refs: refs.flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return []
      }
      const name = Reflect.get(entry, 'name')
      const ref = Reflect.get(entry, 'ref')
      const role = Reflect.get(entry, 'role')
      return typeof name === 'string' && typeof ref === 'string' && typeof role === 'string'
        ? [{ name, ref, role }]
        : []
    }),
    snapshot,
    title,
    url
  }
}

function collectBrowserSnapshot(): SnapshotPayload {
  const referenceAttribute = 'data-agentstart-browser-ref'
  const interactiveTags = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'])
  const semanticTags = new Set([
    'ARTICLE',
    'ASIDE',
    'FOOTER',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'HEADER',
    'IMG',
    'LI',
    'MAIN',
    'NAV',
    'P'
  ])
  const interactiveRoles = new Set([
    'button',
    'checkbox',
    'combobox',
    'link',
    'menuitem',
    'option',
    'radio',
    'slider',
    'switch',
    'tab',
    'textbox'
  ])
  const clean = (value: string | null | undefined, limit = 160): string =>
    (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
  const roleFor = (element: Element): string => {
    const explicit = clean(element.getAttribute('role'), 40)
    if (explicit) {
      return explicit
    }
    const tag = element.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) {
      return 'heading'
    }
    const roles: Record<string, string> = {
      a: 'link',
      button: 'button',
      img: 'img',
      input: (element as HTMLInputElement).type === 'checkbox' ? 'checkbox' : 'textbox',
      li: 'listitem',
      main: 'main',
      nav: 'navigation',
      select: 'combobox',
      textarea: 'textbox'
    }
    return roles[tag] ?? tag
  }
  const nameFor = (element: Element): string => {
    const input = element instanceof HTMLInputElement ? element : null
    return clean(
      element.getAttribute('aria-label') ??
        element.getAttribute('alt') ??
        element.getAttribute('title') ??
        input?.placeholder ??
        input?.value ??
        element.textContent
    )
  }
  const isVisible = (element: Element): boolean => {
    const html = element as HTMLElement
    const style = getComputedStyle(html)
    const rect = html.getBoundingClientRect()
    return (
      style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    )
  }

  document
    .querySelectorAll(`[${referenceAttribute}]`)
    .forEach((element) => element.removeAttribute(referenceAttribute))
  const refs: SnapshotPayload['refs'] = []
  const lines: string[] = [`page "${clean(document.title)}" ${location.href}`]
  let referenceIndex = 0
  const elements = Array.from(document.body?.querySelectorAll('*') ?? []).slice(0, 4_000)
  for (const element of elements) {
    if (!isVisible(element)) {
      continue
    }
    const role = roleFor(element)
    const isInteractive =
      interactiveTags.has(element.tagName) ||
      interactiveRoles.has(role) ||
      element.hasAttribute('contenteditable') ||
      element.hasAttribute('tabindex')
    if (!isInteractive && !semanticTags.has(element.tagName)) {
      continue
    }
    const name = nameFor(element)
    if (!name && !isInteractive) {
      continue
    }
    let ref = ''
    if (isInteractive) {
      referenceIndex += 1
      ref = `e${referenceIndex}`
      element.setAttribute(referenceAttribute, ref)
      refs.push({ name, ref, role })
    }
    const state = [
      element.getAttribute('aria-checked') === 'true' ? 'checked' : '',
      element.hasAttribute('disabled') ? 'disabled' : ''
    ].filter(Boolean)
    lines.push(
      `- ${role}${name ? ` "${name.replaceAll('"', '\\"')}"` : ''}${ref ? ` [ref=${ref}]` : ''}${
        state.length ? ` [${state.join(', ')}]` : ''
      }`
    )
    if (lines.length >= 800) {
      lines.push('- … snapshot truncated')
      break
    }
  }
  return { refs, snapshot: lines.join('\n'), title: document.title, url: location.href }
}
