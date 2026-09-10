type BrowserGrabPageContext = {
  sanitizedUrl: string
  title: string
  viewportWidth: number
  viewportHeight: number
  scrollX: number
  scrollY: number
  devicePixelRatio: number
  capturedAt: string
}

type BrowserGrabAccessibility = {
  role: string | null
  accessibleName: string | null
  ariaLabel: string | null
  ariaLabelledBy: string | null
}

type BrowserGrabComputedStyles = {
  display: string
  position: string
  width: string
  height: string
  margin: string
  padding: string
  color: string
  backgroundColor: string
  border: string
  borderRadius: string
  fontFamily: string
  fontSize: string
  fontWeight: string
  lineHeight: string
  textAlign: string
  zIndex: string
}

export type BrowserGrabRect = {
  x: number
  y: number
  width: number
  height: number
}

type BrowserGrabTarget = {
  tagName: string
  selector: string
  elementPath?: string
  fullPath?: string
  cssClasses?: string
  nearbyElements?: string[]
  selectedText?: string | null
  isFixed?: boolean
  reactComponents?: string | null
  sourceFile?: string | null
  textSnippet: string
  htmlSnippet: string
  attributes: Record<string, string>
  accessibility: BrowserGrabAccessibility
  rectViewport: BrowserGrabRect
  rectPage: BrowserGrabRect
  computedStyles: BrowserGrabComputedStyles
}

type BrowserGrabScreenshot = {
  mimeType: 'image/png'
  dataUrl: string
  width: number
  height: number
}

export type BrowserGrabPayload = {
  page: BrowserGrabPageContext
  target: BrowserGrabTarget
  nearbyText: string[]
  ancestorPath: string[]
  screenshot: BrowserGrabScreenshot | null
}

export type BrowserGrabCancelReason = 'user' | 'tab-inactive' | 'navigation' | 'evicted' | 'timeout'

export type BrowserGrabResult =
  | { opId: string; kind: 'selected'; payload: BrowserGrabPayload }
  | { opId: string; kind: 'context-selected'; payload: BrowserGrabPayload }
  | { opId: string; kind: 'cancelled'; reason: BrowserGrabCancelReason }
  | { opId: string; kind: 'error'; reason: string }

export const GRAB_BUDGET = {
  textSnippetMaxLength: 200,
  nearbyTextEntryMaxLength: 200,
  nearbyTextMaxEntries: 10,
  htmlSnippetMaxLength: 4096,
  ancestorPathMaxEntries: 10,
  nearbyElementsMaxEntries: 6,
  nearbyElementMaxLength: 160,
  selectorMaxLength: 700,
  pathMaxLength: 900,
  cssClassesMaxLength: 500,
  selectedTextMaxLength: 500,
  sourceFileMaxLength: 500,
  reactComponentsMaxLength: 500,
  annotationCommentMaxLength: 2000,
  annotationsMaxPerPage: 20,

  screenshotMaxBytes: 2 * 1024 * 1024
} as const

export const GRAB_SAFE_ATTRIBUTE_NAMES = new Set([
  'id',
  'class',
  'name',
  'type',
  'role',
  'href',
  'src',
  'alt',
  'title',
  'placeholder',
  'for',
  'action',
  'method'
])

export const GRAB_SECRET_PATTERNS = [
  'access_token',
  'auth_token',
  'api_key',
  'apikey',
  'client_secret',
  'oauth_state',
  'x-amz-',
  'session_id',
  'sessionid',
  'csrf',
  'secret',
  'password',
  'passwd'
]
