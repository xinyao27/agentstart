import { useSortable } from '@dnd-kit/sortable'
import type { BrowserTab as BrowserTabState } from '@yiru/protocol/workspace/browser-session'
import { YIRU_BROWSER_BLANK_URL } from '@yiru/protocol/workspace/browser-session'
import { useEffect, useState } from 'react'
import { redactKagiSessionToken } from '~renderer/browser/session/kagi-link'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import {
  Globe,
  Copy,
  PushPin as Pin,
  PushPinSlash as PinOff,
  Sidebar as PanelRightClose,
  ArrowSquareOut as ExternalLink,
  X
} from '~renderer/icons/hugeicons'
import { getLiveBrowserUrl } from '~renderer/runtime/browser-live-url'
import { cn } from '~renderer/ui/class-names'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '~renderer/ui/context-menu'

import type { TabDragItemData } from '../tab-group/use-tab-drag-split'
import { getDropIndicatorClasses, type DropIndicator } from './drop-indicator'
import { preventMiddleButtonDefault } from './middle-button-default-guard'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from './sortable-tab'
import {
  getTitlebarTabStateClasses,
  TAB_LEADING_ICON_CLASSES,
  TAB_ROOT_CLASSES
} from './tab-chrome-classes'
import { TabCloseButton } from './tab-close-button'
import { TabLabel } from './tab-label'
import { useTabStripPointerActivation } from './tab-strip-pointer-activation'
import { TAB_CONTAINER_WIDTH_CLASSES } from './tab-width-rules'
import { TabWorkspaceLayoutMenuSection } from './tab-workspace-layout-menu-section'

function formatBrowserTabUrlLabel(url: string): string {
  if (url === YIRU_BROWSER_BLANK_URL || url === 'about:blank') {
    return 'New Tab'
  }
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return url
  }
}

export function getBrowserTabLabel(tab: BrowserTabState): string {
  if (
    !tab.title ||
    tab.title === tab.url ||
    tab.title === YIRU_BROWSER_BLANK_URL ||
    tab.title === 'about:blank'
  ) {
    return formatBrowserTabUrlLabel(tab.url)
  }
  return tab.title || tab.url
}

function isBlankBrowserTab(tab: BrowserTabState): boolean {
  return tab.url === YIRU_BROWSER_BLANK_URL || tab.url === 'about:blank'
}

type FailedFavicon = {
  tabId: string
  faviconUrl: string
}

function BrowserTabFavicon({
  tabId,
  faviconUrl
}: {
  tabId: string
  faviconUrl: string | null
}): React.JSX.Element {
  const displayFaviconUrl = faviconUrl?.trim() ? faviconUrl : null
  const [failedFavicon, setFailedFavicon] = useState<FailedFavicon | null>(null)

  // Why: reset during render so a new favicon identity retries before the tab
  // commits one frame with the stale fallback icon.
  if (
    failedFavicon &&
    (failedFavicon.tabId !== tabId || failedFavicon.faviconUrl !== displayFaviconUrl)
  ) {
    setFailedFavicon(null)
  }

  const currentFaviconFailed =
    failedFavicon?.tabId === tabId && failedFavicon.faviconUrl === displayFaviconUrl

  if (displayFaviconUrl && !currentFaviconFailed) {
    return (
      <img
        src={displayFaviconUrl}
        alt=""
        aria-hidden
        draggable={false}
        className={cn(TAB_LEADING_ICON_CLASSES, 'object-contain')}
        onError={() => setFailedFavicon({ tabId, faviconUrl: displayFaviconUrl })}
      />
    )
  }

  return <Globe className={cn(TAB_LEADING_ICON_CLASSES, 'text-blue-500')} />
}

export default function BrowserTab({
  tab,
  isActive,
  isPinned,
  hasTabsToRight,
  onActivate,
  onClose,
  onCloseToRight,
  onDuplicate,
  onTogglePin,
  dragData,
  dropIndicator
}: {
  tab: BrowserTabState
  isActive: boolean
  isPinned: boolean
  hasTabsToRight: boolean
  onActivate: () => void
  onClose: () => void
  onCloseToRight: () => void
  onDuplicate: () => void
  onTogglePin: () => void
  dragData: TabDragItemData
  dropIndicator?: DropIndicator
}): React.JSX.Element {
  // Why: no transform/transition/isDragging styling — the drag design is
  // that tabs stay visually anchored; only the blue insertion bar moves.
  const { attributes, listeners, setNodeRef } = useSortable({
    id: tab.id,
    data: dragData
  })
  const [menuOpen, setMenuOpen] = useState(false)

  // Why: about:blank and other non-http URLs should not be sent to the
  // system browser. Disable the context menu item instead of silently
  // calling shell.openUrl with an unsupported URL.
  const openInBrowserUrl = redactKagiSessionToken(getLiveBrowserUrl(tab.id) ?? tab.url)
  let isHttpUrl = false
  try {
    const parsed = new URL(openInBrowserUrl)
    isHttpUrl = parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    // invalid URL — leave disabled
  }
  const tabLabel = getBrowserTabLabel(tab)

  useEffect(() => {
    const closeMenu = (): void => setMenuOpen(false)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
  }, [])

  // Why: activating a projected page moves focus to another Chrome tab before
  // Base UI observes an outside click, so close the menu on window blur.
  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const dismiss = (): void => setMenuOpen(false)
    window.addEventListener('blur', dismiss)
    return () => window.removeEventListener('blur', dismiss)
  }, [menuOpen])

  // Why: defer activation to pointer-up so dragging the tab (reorder / move into
  // another pane / split) does not switch the active tab mid-gesture.
  const { onPointerDown: onTabPointerDown } = useTabStripPointerActivation({ onActivate })

  const tabRoot = (
    <div
      ref={setNodeRef}
      data-tab-id={tab.id}
      data-pinned={isPinned ? 'true' : 'false'}
      {...attributes}
      {...listeners}
      className={cn(
        TAB_ROOT_CLASSES,
        getDropIndicatorClasses(dropIndicator ?? null),
        getTitlebarTabStateClasses(isActive)
      )}
      onPointerDown={(e) => {
        onTabPointerDown(
          e,
          listeners?.onPointerDown as ((event: React.PointerEvent<Element>) => void) | undefined
        )
      }}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault()
        }
      }}
      onMouseUp={preventMiddleButtonDefault}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault()
          e.stopPropagation()
          if (isPinned) {
            return
          }
          onClose()
        }
      }}
    >
      {/* Why: the browser tab icon is the only non-terminal, non-editor
          surface in the tab strip. Coloring the Globe blue (matching the
          in-app browser's identity and the default tab insertion bar)
          gives it a distinct, recognizable anchor so users can spot
          browser tabs at a glance even when the strip is saturated. We
          keep full color on both active and inactive tabs — dimming to
          muted-foreground made the icon read as "disabled" in practice. */}
      <BrowserTabFavicon tabId={tab.id} faviconUrl={tab.faviconUrl} />
      {isPinned && <Pin className="text-muted-foreground mr-1 size-3.5 shrink-0" aria-hidden />}
      <TabLabel label={tabLabel} showTooltip={!menuOpen} />
      {tab.loading && !tab.loadError && !isBlankBrowserTab(tab) && (
        <span className="mr-1 size-1.5 shrink-0 bg-sky-500/80" />
      )}
      {!isPinned && (
        <TabCloseButton
          ariaLabel={translate(
            'auto.components.tab.bar.SortableTab.6df69d9388',
            'Close tab {{value0}}',
            { value0: tabLabel }
          )}
          onClose={onClose}
        />
      )}
    </div>
  )

  return (
    <ContextMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <ContextMenuTrigger
        onContextMenu={() => {
          window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
        }}
        render={<div className={TAB_CONTAINER_WIDTH_CLASSES}>{tabRoot}</div>}
      />

      <ContextMenuContent className="border-border/80 min-w-[11rem] p-1">
        <TabWorkspaceLayoutMenuSection
          unifiedTabId={dragData.unifiedTabId}
          groupId={dragData.groupId}
          trailingSeparator
        />
        <ContextMenuItem onClick={onDuplicate}>
          <Copy className="size-4" />
          {translate('auto.components.tab.bar.BrowserTab.5d6e89891f', 'Duplicate Tab')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onTogglePin}>
          {isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          {isPinned
            ? translate('auto.components.tab.bar.BrowserTab.c5aaee8c39', 'Unpin Tab')
            : translate('auto.components.tab.bar.BrowserTab.911542656f', 'Pin Tab')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => !isPinned && onClose()} disabled={isPinned}>
          <X className="size-4" />
          {translate('auto.components.tab.bar.BrowserTab.1611a1324b', 'Close')}
        </ContextMenuItem>
        <ContextMenuItem onClick={onCloseToRight} disabled={!hasTabsToRight}>
          <PanelRightClose className="size-4" />
          {translate('auto.components.tab.bar.BrowserTab.9dd880bd56', 'Close Tabs To The Right')}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={(event) => openHttpLink(openInBrowserUrl, { event })}
          disabled={!isHttpUrl}
        >
          <ExternalLink className="size-4" />
          {translate('auto.components.tab.bar.BrowserTab.6e0bc8f3a8', 'Open In Browser')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
