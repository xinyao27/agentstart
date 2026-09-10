export type WebLinkMouseEvent = Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey'>

export function shouldOpenWebLinkInAgentStartBrowser(
  event: WebLinkMouseEvent | undefined
): boolean {
  if (!event || event.button !== 0) {
    return false
  }
  return navigator.userAgent.includes('Mac')
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey
}
