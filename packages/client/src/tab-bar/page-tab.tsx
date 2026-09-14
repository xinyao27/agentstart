import { useSortable } from '@dnd-kit/sortable'
import type { WorkspacePageView } from '~renderer/application-shell/state/workspace-page-views'
import {
  pageTabId,
  resolvePageTabLabel
} from '~renderer/application-shell/state/workspace-page-views'
import { translate } from '~renderer/i18n/i18n'
import { useUiLocale } from '~renderer/i18n/use-ui-locale'
import {
  ActivityIcon as Activity,
  BookOpen,
  DeviceMobile as Smartphone,
  GearSix,
  HardDrive
} from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { cn } from '~renderer/ui/class-names'

import type { TabDragItemData } from '../tab-group/use-tab-drag-split'
import { getDropIndicatorClasses, type DropIndicator } from './drop-indicator'
import {
  getTitlebarTabStateClasses,
  TAB_LEADING_ICON_CLASSES,
  TAB_ROOT_CLASSES
} from './tab-chrome-classes'
import { TabCloseButton } from './tab-close-button'
import { TabLabel } from './tab-label'
import { useTabStripPointerActivation } from './tab-strip-pointer-activation'
import { TabActiveSurface, TabHoverSurface } from './tab-surfaces'

// Why: labels live in the page-view state module because the store needs them
// when it creates the tab record; only the icons are a render concern.
const PAGE_TAB_ICONS: Record<WorkspacePageView, React.ComponentType<{ className?: string }>> = {
  home: Activity,
  mobile: Smartphone,
  settings: GearSix,
  skills: BookOpen,
  space: HardDrive
}

/** The page's own icon, so every surface that lists a page tab agrees on it. */
export function PageTabIcon({
  view,
  className
}: {
  view: WorkspacePageView
  className?: string
}): React.JSX.Element {
  const Icon = PAGE_TAB_ICONS[view]
  return <Icon className={className} />
}

// Why: derived from the hook rather than imported, so the chrome's prop types
// track dnd-kit's own return shape without reaching into its internal paths.
type SortableBinding = ReturnType<typeof useSortable>

type PageTabChromeProps = {
  view: WorkspacePageView
  active: boolean
  nodeRef?: (node: HTMLElement | null) => void
  dragAttributes?: SortableBinding['attributes']
  dragListeners?: SortableBinding['listeners']
  dropIndicator?: DropIndicator
  onActivate: () => void
  onPointerDown?: (event: React.PointerEvent) => void
}

// Why: the page tab's markup is one thing; whether it is a drag participant is
// its host's decision. A workspace strip hosts it inside the dnd context, the
// app scope's strip has no split tree to reorder against, so they share this
// surface and differ only in the props they pass.
function PageTabChrome({
  view,
  active,
  nodeRef,
  dragAttributes,
  dragListeners,
  dropIndicator,
  onActivate,
  onPointerDown
}: PageTabChromeProps): React.JSX.Element {
  // Why: translate reads the active locale at render time; this boundary needs
  // its own subscription so the tab label follows language changes.
  useUiLocale()
  const Icon = PAGE_TAB_ICONS[view]
  const closePageTab = useAppStore((state) => state.closePageTab)
  const label = resolvePageTabLabel(view)

  return (
    <div
      ref={nodeRef}
      data-tab-id={pageTabId(view)}
      data-tab-title={label}
      {...dragAttributes}
      {...dragListeners}
      // Why: dnd-kit's attributes default the role to "button"; a tab strip item
      // is a tab, so this is set after the spread on purpose.
      role="tab"
      aria-selected={active}
      className={cn(
        TAB_ROOT_CLASSES,
        getDropIndicatorClasses(dropIndicator ?? null),
        getTitlebarTabStateClasses(active)
      )}
      onClick={onActivate}
      onPointerDown={onPointerDown}
    >
      {active ? <TabActiveSurface /> : <TabHoverSurface />}
      <Icon className={TAB_LEADING_ICON_CLASSES} />
      <TabLabel label={label} showTooltip={false} />
      {/* Why: reserves the hover-close zone so revealing the close button never
        relayouts the label the way an in-flow control would. */}
      <span aria-hidden className="w-2 shrink-0" />
      <TabCloseButton
        ariaLabel={translate(
          'auto.components.tab.bar.SortableTab.6df69d9388',
          'Close tab {{value0}}',
          { value0: label }
        )}
        onClose={() => closePageTab(view)}
      />
    </div>
  )
}

type WorkspacePageStripTabProps = {
  view: WorkspacePageView
  active: boolean
  dragData: TabDragItemData
  dropIndicator?: DropIndicator
}

/**
 * The page's tab inside the workspace tab-strip queue. It is a real unified tab,
 * so it is a drag participant exactly like every other entry: reorder and
 * drop-into-split come from the shared pipeline.
 */
export function WorkspacePageStripTab({
  view,
  active,
  dragData,
  dropIndicator
}: WorkspacePageStripTabProps): React.JSX.Element {
  const openPage = useAppStore((state) => state.openPageTab)
  const { attributes, listeners, setNodeRef } = useSortable({
    id: pageTabId(view),
    data: dragData
  })
  // Why: activation waits for pointer-up so pressing a tab to drag it (reorder
  // or split) does not switch the active tab mid-gesture.
  const { onPointerDown } = useTabStripPointerActivation({
    onActivate: () => openPage(view)
  })

  return (
    <PageTabChrome
      view={view}
      active={active}
      nodeRef={setNodeRef}
      dragAttributes={attributes}
      dragListeners={listeners}
      dropIndicator={dropIndicator}
      onActivate={() => openPage(view)}
      onPointerDown={(event) =>
        onPointerDown(
          event,
          listeners?.onPointerDown as ((event: React.PointerEvent<Element>) => void) | undefined
        )
      }
    />
  )
}

/**
 * The page's tab in the app scope's strip — the strip that hosts the titlebar
 * while no workspace is open. There is no split tree to reorder against in that
 * state, so this variant carries no drag behavior.
 */
export function AppScopePageTab({
  view,
  active
}: {
  view: WorkspacePageView
  active: boolean
}): React.JSX.Element {
  const openPage = useAppStore((state) => state.openPageTab)
  return <PageTabChrome view={view} active={active} onActivate={() => openPage(view)} />
}
