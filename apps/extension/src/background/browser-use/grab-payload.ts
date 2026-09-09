import type { BrowserGrabPayload, BrowserGrabRect } from './grab/model'
import { GRAB_BUDGET, GRAB_SAFE_ATTRIBUTE_NAMES, GRAB_SECRET_PATTERNS } from './grab/model'

const SAFE_GRAB_URL_PROTOCOLS = new Set(['http:', 'https:', 'file:'])
const ATTRIBUTE_SCAN_LIMIT = 32
const SAFE_ATTRIBUTE_ENTRY_LIMIT = 16
const ATTRIBUTE_NAME_MAX_LENGTH = 64
const ATTRIBUTE_VALUE_MAX_LENGTH = 500

export function clampGrabPayload(raw: unknown): BrowserGrabPayload | null {
  // Why: CDP returnByValue crosses an untrusted page boundary, so every nested
  // value is narrowed again before it can reach workbench state.
  const obj = readRecord(raw)
  if (!obj) {
    return null
  }
  const page = readRecord(obj.page)
  if (!page) {
    return null
  }
  const target = readRecord(obj.target)
  if (!target) {
    return null
  }

  const clampStr = (s: unknown, max: number): string => {
    const str = typeof s === 'string' ? s : ''
    if (str.length <= max) {
      return str
    }
    const suffix = ' (truncated)'
    return max <= suffix.length
      ? str.slice(0, max)
      : `${str.slice(0, max - suffix.length)}${suffix}`
  }

  const clampArray = (arr: unknown, maxEntries: number, maxEntryLength: number): string[] => {
    const items = Array.isArray(arr) ? arr : []
    return items.slice(0, maxEntries).map((item) => clampStr(item, maxEntryLength))
  }

  const safeStr = (s: unknown, max = 500): string => clampStr(s, max)

  const safeNum = (n: unknown, fallback = 0): number =>
    typeof n === 'number' && Number.isFinite(n) ? n : fallback

  // Why: page code can replace the guest extractor, so redaction is repeated
  // after the CDP boundary instead of trusting guest-side filtering.
  const containsSecret = (val: string): boolean => {
    const lower = val.toLowerCase()
    return GRAB_SECRET_PATTERNS.some((p) => lower.includes(p))
  }

  const sanitizeUrl = (rawUrl: unknown): string => {
    const str = typeof rawUrl === 'string' ? rawUrl : ''
    if (!str) {
      return ''
    }
    try {
      const url = new URL(str)
      if (url.protocol === 'about:') {
        return url.toString() === 'about:blank' ? 'about:blank' : ''
      }
      if (!SAFE_GRAB_URL_PROTOCOLS.has(url.protocol)) {
        return ''
      }
      url.search = ''
      url.hash = ''
      return url.toString()
    } catch {
      // Why: raw parse failures may still contain executable schemes or tokens.
      return ''
    }
  }

  const safeAttributes = (attrs: unknown): Record<string, string> => {
    const values = readRecord(attrs)
    if (!values) {
      return {}
    }
    const filtered: Record<string, string> = {}
    let accepted = 0
    let inspected = 0
    for (const key in values) {
      if (inspected >= ATTRIBUTE_SCAN_LIMIT || accepted >= SAFE_ATTRIBUTE_ENTRY_LIMIT) {
        break
      }
      inspected += 1
      if (
        !Object.prototype.hasOwnProperty.call(values, key) ||
        key.length > ATTRIBUTE_NAME_MAX_LENGTH
      ) {
        continue
      }
      const name = key.toLowerCase()
      const isAria = name.startsWith('aria-')
      const isSafe = GRAB_SAFE_ATTRIBUTE_NAMES.has(name)
      if (!isAria && !isSafe) {
        continue
      }
      const value = values[key]
      const strValue = safeStr(value, ATTRIBUTE_VALUE_MAX_LENGTH)
      if (containsSecret(strValue)) {
        filtered[name] = '[redacted]'
      } else if ((name === 'href' || name === 'src' || name === 'action') && strValue) {
        filtered[name] = sanitizeUrl(strValue)
      } else if (name === 'class') {
        filtered[name] = safeStr(value, 200)
      } else {
        filtered[name] = safeStr(value, 500)
      }
      accepted += 1
    }
    return filtered
  }

  const safeMetadataStr = (value: unknown, max: number): string => {
    const strValue = safeStr(value, max)
    return strValue && containsSecret(strValue) ? '[redacted]' : strValue
  }

  const safeNullableMetadataStr = (value: unknown, max: number): string | null =>
    safeMetadataStr(value, max) || null

  const safeMetadataArray = (
    arr: unknown,
    maxEntries: number,
    maxEntryLength: number
  ): string[] => {
    const items = Array.isArray(arr) ? arr : []
    return items
      .slice(0, maxEntries)
      .map((item) => safeMetadataStr(item, maxEntryLength))
      .filter(Boolean)
  }

  const safeRect = (r: unknown): BrowserGrabRect => {
    const rect = readRecord(r)
    if (!rect) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }
    return {
      x: safeNum(rect.x),
      y: safeNum(rect.y),
      width: safeNum(rect.width),
      height: safeNum(rect.height)
    }
  }

  const accessibility = readRecord(target.accessibility)
  const computedStyles = readRecord(target.computedStyles)

  return {
    page: {
      sanitizedUrl: sanitizeUrl(page.sanitizedUrl),
      title: safeStr(page.title, 500),
      viewportWidth: safeNum(page.viewportWidth),
      viewportHeight: safeNum(page.viewportHeight),
      scrollX: safeNum(page.scrollX),
      scrollY: safeNum(page.scrollY),
      devicePixelRatio: safeNum(page.devicePixelRatio, 1),
      capturedAt: safeStr(page.capturedAt, 100)
    },
    target: {
      tagName: safeStr(target.tagName, 50),
      selector: safeStr(target.selector, GRAB_BUDGET.selectorMaxLength),
      elementPath: safeMetadataStr(target.elementPath, GRAB_BUDGET.pathMaxLength),
      fullPath: safeMetadataStr(target.fullPath, GRAB_BUDGET.pathMaxLength),
      cssClasses: safeMetadataStr(target.cssClasses, GRAB_BUDGET.cssClassesMaxLength),
      nearbyElements: safeMetadataArray(
        target.nearbyElements,
        GRAB_BUDGET.nearbyElementsMaxEntries,
        GRAB_BUDGET.nearbyElementMaxLength
      ),
      selectedText: safeMetadataStr(target.selectedText, GRAB_BUDGET.selectedTextMaxLength) || null,
      isFixed: target.isFixed === true,
      reactComponents: safeNullableMetadataStr(
        target.reactComponents,
        GRAB_BUDGET.reactComponentsMaxLength
      ),
      sourceFile: safeNullableMetadataStr(target.sourceFile, GRAB_BUDGET.sourceFileMaxLength),
      textSnippet: clampStr(target.textSnippet, GRAB_BUDGET.textSnippetMaxLength),
      htmlSnippet: clampStr(target.htmlSnippet, GRAB_BUDGET.htmlSnippetMaxLength),
      attributes: safeAttributes(target.attributes),
      accessibility: {
        role: safeNullableMetadataStr(accessibility?.role, 500),
        accessibleName: safeNullableMetadataStr(accessibility?.accessibleName, 500),
        ariaLabel: safeNullableMetadataStr(accessibility?.ariaLabel, 500),
        ariaLabelledBy: safeNullableMetadataStr(accessibility?.ariaLabelledBy, 500)
      },
      rectViewport: safeRect(target.rectViewport),
      rectPage: safeRect(target.rectPage),
      computedStyles: {
        display: safeStr(computedStyles?.display),
        position: safeStr(computedStyles?.position),
        width: safeStr(computedStyles?.width),
        height: safeStr(computedStyles?.height),
        margin: safeStr(computedStyles?.margin),
        padding: safeStr(computedStyles?.padding),
        color: safeStr(computedStyles?.color),
        backgroundColor: safeStr(computedStyles?.backgroundColor),
        border: safeStr(computedStyles?.border),
        borderRadius: safeStr(computedStyles?.borderRadius),
        fontFamily: safeStr(computedStyles?.fontFamily),
        fontSize: safeStr(computedStyles?.fontSize),
        fontWeight: safeStr(computedStyles?.fontWeight),
        lineHeight: safeStr(computedStyles?.lineHeight),
        textAlign: safeStr(computedStyles?.textAlign),
        zIndex: safeStr(computedStyles?.zIndex)
      }
    },
    nearbyText: clampArray(
      obj.nearbyText,
      GRAB_BUDGET.nearbyTextMaxEntries,
      GRAB_BUDGET.nearbyTextEntryMaxLength
    ),
    ancestorPath: clampArray(obj.ancestorPath, GRAB_BUDGET.ancestorPathMaxEntries, 200),
    screenshot: null
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
