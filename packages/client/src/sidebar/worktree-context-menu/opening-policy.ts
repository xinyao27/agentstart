export const CLOSE_ALL_CONTEXT_MENUS_EVENT = 'agentstart-close-all-context-menus'
const WORKTREE_NATIVE_CONTEXT_MENU_ATTR = 'data-worktree-native-context-menu'

function getTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target
  }
  return target instanceof Node ? target.parentElement : null
}

export function shouldUseNativeContextMenu(target: EventTarget | null): boolean {
  return getTargetElement(target)?.closest(`[${WORKTREE_NATIVE_CONTEXT_MENU_ATTR}]`) != null
}
