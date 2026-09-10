import type { TerminalTab } from '@agentstart/protocol/workspace/tabs'
import { useSortable } from '@dnd-kit/sortable'
import { useEffect, useRef, useState } from 'react'
import { stripLeadingAgentTitleDecoration } from '~renderer/agent/title/decoration'
import { translate } from '~renderer/i18n/i18n'
import { PushPin as Pin, ArrowsIn as Minimize2 } from '~renderer/icons/hugeicons'
import { isImeCompositionKeyDown } from '~renderer/keyboard-input/ime-composition'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'
import { useTabAgent } from '~renderer/tab-bar/use-tab-agent'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { ContextMenu, ContextMenuTrigger } from '~renderer/ui/context-menu'
import { Input } from '~renderer/ui/input'

import type { TabDragItemData } from '../tab-group/use-tab-drag-split'
import { getDropIndicatorClasses, type DropIndicator } from './drop-indicator'
import { preventMiddleButtonDefault } from './middle-button-default-guard'
import { SortableTabContextMenu } from './sortable-tab-context-menu'
import { getTitlebarTabStateClasses, TAB_ROOT_CLASSES } from './tab-chrome-classes'
import { TabCloseButton } from './tab-close-button'
import { TabLabel } from './tab-label'
import { useTabStripPointerActivation } from './tab-strip-pointer-activation'
import { TAB_CONTAINER_WIDTH_CLASSES } from './tab-width-rules'
import {
  hasUnreadAgentCompletionForTerminalTab,
  isTerminalTabActivityLive,
  resolveTerminalTabActivityStatus
} from './terminal-tab-activity-status'
import { TerminalTabLeadingIcon } from './terminal-tab-leading-icon'

type SortableTabProps = {
  tab: TerminalTab
  unifiedTabId: string
  groupId: string
  tabCount: number
  hasTabsToRight: boolean
  isActive: boolean
  isPinned: boolean
  isExpanded: boolean
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
  onCloseOthers: (tabId: string) => void
  onCloseToRight: (tabId: string) => void
  onSetCustomTitle: (tabId: string, title: string | null) => void
  onSetTabColor: (tabId: string, color: string | null) => void
  onTogglePin: () => void
  onToggleExpand: (tabId: string) => void
  dragData: TabDragItemData
  dropIndicator?: DropIndicator
}

export const CLOSE_ALL_CONTEXT_MENUS_EVENT = 'agentstart-close-all-context-menus'

export default function SortableTab({
  tab,
  unifiedTabId,
  groupId,
  tabCount,
  hasTabsToRight,
  isActive,
  isPinned,
  isExpanded,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onSetCustomTitle,
  onSetTabColor,
  onTogglePin,
  onToggleExpand,
  dragData,
  dropIndicator
}: SortableTabProps): React.JSX.Element {
  // Why: agent-completion unread is pane-keyed and exists even when the
  // experimental generic terminal-attention setting is off. Collapse both
  // sources to one per-tab primitive so unrelated tabs do not re-render.
  const hasUnreadActivity = useAppStore(
    (s) =>
      s.unreadTerminalTabs[tab.id] === true ||
      hasUnreadAgentCompletionForTerminalTab(s.unreadAgentCompletionPanes, tab.id)
  )
  // Why: the resolver returns a WorktreeStatus primitive, so unrelated agent
  // updates can't repaint this tab. The per-tab pane bucketing it reads is
  // memoized once per store snapshot, so this stays O(1) per tab per write.
  const activityStatus = useAppStore((s) =>
    resolveTerminalTabActivityStatus({
      tab,
      agentStatusByPaneKey: s.agentStatusByPaneKey,
      agentStatusEpoch: s.agentStatusEpoch,
      ptyIdsByTabId: s.ptyIdsByTabId
    })
  )
  const renamingTabId = useAppStore((s) => s.renamingTabId)
  const setRenamingTabId = useAppStore((s) => s.setRenamingTabId)

  // Why: createTab stamps the shell used at creation time, so changing the
  // default shell later does not repaint existing tabs as a different shell.
  // Older persisted tabs without this field fall back to the generic icon.
  const shellForIcon = tab.shellOverride

  // Why: hook status and title evidence make the tab icon reflect the
  // coding harness currently running in the pane, not just the launch command.
  const tabAgent = useTabAgent(tab)

  // Why: when a provider icon is already shown, stripping the agent's own
  // leading status glyph keeps the tab from presenting two icons for one agent.
  const displayTitle =
    tab.customTitle ?? (tabAgent ? stripLeadingAgentTitleDecoration(tab.title) : tab.title)

  const { attributes, listeners, setNodeRef } = useSortable({
    id: tab.id,
    // Why: carry the resolved agent into the drag overlay so dragged tabs keep
    // the same provider glyph as the tab strip without another store lookup.
    data: { ...dragData, agent: tabAgent }
  })

  // Why: intentionally no transform/transition/opacity here. The PR's
  // design is that tabs stay visually anchored during a drag — only the
  // blue insertion bar moves. Siblings also don't shift (see
  // SortableContext in tab-bar.tsx, which omits a strategy for that reason).
  const [menuOpen, setMenuOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  // Why: a live working/needs-input state is newer and more specific than an
  // unread event from the prior turn. It owns the icon until the turn ends;
  // the unread completion bell then returns if the tab is still unvisited.
  const showUnreadActivity =
    hasUnreadActivity && !isEditing && !isTerminalTabActivityLive(activityStatus)
  const [renameValue, setRenameValue] = useState('')
  const renameFocusFrameRef = useRef<number | null>(null)
  // Why: React's synthetic onBlur fires during the Input's unmount when isEditing flips
  // to false. Without this guard, pressing Escape (or committing via Enter) would cause
  // the blur handler to run commitRename a second time and overwrite the title with the
  // uncommitted edits the user just discarded. This ref lets cancelRename/commitRename
  // mark the rename as already resolved so the unmount-driven blur is a no-op.
  const committedOrCancelledRef = useRef(false)

  const handleRenameOpen = useEventCallback(() => {
    committedOrCancelledRef.current = false
    // Why: snapshot the current title once on open. If the underlying tab.title
    // changes mid-edit (e.g., a shell writes a new title via OSC escape), we
    // intentionally do NOT refresh renameValue — the user's in-progress edit
    // takes precedence so their keystrokes are never silently overwritten.
    setRenameValue(tab.customTitle ?? tab.title)
    setIsEditing(true)
  })

  const commitRename = () => {
    if (committedOrCancelledRef.current) {
      return
    }
    committedOrCancelledRef.current = true
    const trimmed = renameValue.trim()
    onSetCustomTitle(tab.id, trimmed.length > 0 ? trimmed : null)
    setIsEditing(false)
  }

  const cancelRename = () => {
    committedOrCancelledRef.current = true
    setIsEditing(false)
  }

  const setRenameInputElement = (input: HTMLInputElement | null) => {
    if (renameFocusFrameRef.current !== null) {
      cancelAnimationFrame(renameFocusFrameRef.current)
      renameFocusFrameRef.current = null
    }
    if (!input) {
      return
    }
    // Why: defer past Radix menu teardown/focus restore while still keying off
    // input mount only; terminal title updates must not re-select in-progress text.
    renameFocusFrameRef.current = requestAnimationFrame(() => {
      renameFocusFrameRef.current = null
      input.focus()
      input.select()
    })
  }

  // Why: the tab.rename shortcut can't reach this component's local editing
  // state directly, so it sets renamingTabId in the store; the matching tab
  // opens its editor and immediately clears the flag so it fires once.
  useEffect(() => {
    if (renamingTabId !== tab.id) {
      return
    }
    handleRenameOpen()
    setRenamingTabId(null)
  }, [renamingTabId, tab.id, handleRenameOpen, setRenamingTabId])

  useEffect(() => {
    const closeMenu = (): void => setMenuOpen(false)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
  }, [])

  // Why: focus can leave the document without an outside pointer event, so
  // window blur also dismisses the menu.
  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const dismiss = (): void => setMenuOpen(false)
    window.addEventListener('blur', dismiss)
    return () => window.removeEventListener('blur', dismiss)
  }, [menuOpen])

  // Why: while editing, suppress dnd-kit drag listeners and tab-activation/double-click
  // handlers so typing/clicking inside the inline input doesn't start a drag, re-open the
  // editor, or steal focus away from the input. We still spread `attributes` unconditionally
  // so dnd-kit's a11y attributes (aria-roledescription, etc.) remain on the element — only
  // the pointer listeners are gated so a drag can't start while typing.
  const dragListeners = isEditing ? undefined : listeners
  const handleActivate = () => {
    onActivate(tab.id)
  }
  // Why: defer activation to pointer-up so pressing a tab to drag it (reorder /
  // move into another pane / split) does not switch the active tab or steal
  // terminal focus mid-gesture. See tab-strip-pointer-activation.
  const { onPointerDown: onTabPointerDown } = useTabStripPointerActivation({
    onActivate: handleActivate,
    disabled: isEditing
  })
  const tabTitle = tab.customTitle ?? tab.title
  const tabRoot = (
    <div
      ref={setNodeRef}
      data-tab-id={tab.id}
      data-tab-title={tabTitle}
      data-pinned={isPinned ? 'true' : 'false'}
      data-agent-activity-status={activityStatus}
      {...attributes}
      {...dragListeners}
      // Why: on unread activity, tint the whole tab with a subtle amber
      // wash so the signal is visible at a glance even when the small
      // bell icon is easy to miss in a long tab bar. Active tabs keep
      // their existing highlight — the amber wash layers on top so the
      // tab still reads as "selected + has activity". The wash is
      // rendered as an absolutely-positioned child below so the ::after
      // pseudo-element stays free for the drop indicator.
      className={cn(
        TAB_ROOT_CLASSES,
        getDropIndicatorClasses(dropIndicator ?? null),
        getTitlebarTabStateClasses(isActive)
      )}
      onDoubleClick={(e) => {
        if (isEditing) {
          return
        }
        e.stopPropagation()
        handleRenameOpen()
      }}
      onPointerDown={(e) => {
        onTabPointerDown(
          e,
          dragListeners?.onPointerDown as ((event: React.PointerEvent<Element>) => void) | undefined
        )
      }}
      onMouseDown={(e) => {
        // Why: prevent default browser middle-click behavior (auto-scroll)
        // but do NOT close here — closing removes the element before mouseup,
        // causing the mouseup to fall through to the terminal and trigger
        // an X11 primary selection paste on Linux.
        if (e.button === 1) {
          e.preventDefault()
        }
      }}
      onMouseUp={preventMiddleButtonDefault}
      onAuxClick={(e) => {
        if (isEditing) {
          return
        }
        if (e.button === 1) {
          e.preventDefault()
          e.stopPropagation()
          if (isPinned) {
            return
          }
          onClose(tab.id)
        }
      }}
    >
      {showUnreadActivity && (
        // Why: a real DOM child leaves both drop-indicator pseudo-elements
        // available and keeps pointer events reaching the tab beneath it.
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-amber-500/10" />
      )}
      <TerminalTabLeadingIcon
        agent={tabAgent}
        activityStatus={activityStatus}
        shell={shellForIcon}
        showUnreadActivity={showUnreadActivity}
        isActive={isActive}
      />
      {isPinned && !isEditing && (
        <Pin className="text-muted-foreground mr-1 size-3.5 shrink-0" aria-hidden />
      )}
      {isEditing ? (
        <Input
          ref={setRenameInputElement}
          data-tab-rename-input="true"
          size="inline-edit"
          value={renameValue}
          aria-label={translate(
            'auto.components.tab.bar.SortableTab.ab19f603eb',
            'Rename tab {{value0}}',
            { value0: tabTitle }
          )}
          onChange={(event) => setRenameValue(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            // Why: an Enter that only confirms a CJK IME candidate must not
            // commit the rename; wait for a non-composition Enter.
            if (isImeCompositionKeyDown(event)) {
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              commitRename()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              cancelRename()
            }
          }}
          // Why: stop pointer/mouse events from bubbling to the outer div, which
          // would otherwise trigger tab activation or start a dnd-kit drag while
          // the user is trying to click inside the input.
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => {
            // Why: stop propagation so the outer tab's activation/drag handlers
            // don't fire on clicks inside the input. Also preventDefault on middle
            // click (button 1) to block Linux X11 primary-selection paste into the
            // rename field, matching the outer tab's behavior.
            event.stopPropagation()
            if (event.button === 1) {
              event.preventDefault()
            }
          }}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onAuxClick={(event) => event.stopPropagation()}
          // Why: the base Input applies w-full min-w-0, which lets flex
          // shrink it to ~0 when many tabs compete for horizontal space.
          // Force a minimum width that matches the normal title box so the
          // rename input stays usable even when the tab bar is saturated.
          className="mr-1 min-w-[72px] flex-1"
          spellCheck={false}
        />
      ) : (
        <TabLabel label={displayTitle} showTooltip={!menuOpen} />
      )}
      {tab.color && !isEditing && (
        <span className="mr-1.5 size-2 shrink-0" style={{ backgroundColor: tab.color }} />
      )}
      {isExpanded &&
        !isEditing && (
          // Why: hover-close occupies this same trailing overlay position; hide
          // collapse only when that close control exists so hit targets never stack.
          <Button
            variant="quiet"
            size="icon-xs"
            className={cn(
              'focus-visible:bg-muted ',
              'mr-1 flex size-4 border-0',
              !isPinned ? 'group-hover:pointer-events-none group-hover:opacity-0' : '',
              isActive
                ? ' hover:bg-muted'
                : 'text-transparent group-hover:text-muted-foreground hover:!text-foreground hover:!bg-muted'
            )}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(tab.id)
            }}
            title={translate('auto.components.tab.bar.SortableTab.fdb2691425', 'Collapse pane')}
            aria-label={translate(
              'auto.components.tab.bar.SortableTab.fdb2691425',
              'Collapse pane'
            )}
          >
            <Minimize2 className="size-3.5" />
          </Button>
        )}
      {!isEditing && !isPinned && (
        <TabCloseButton
          ariaLabel={translate(
            'auto.components.tab.bar.SortableTab.6df69d9388',
            'Close tab {{value0}}',
            { value0: tabTitle }
          )}
          onClose={() => onClose(tab.id)}
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

      <SortableTabContextMenu
        tab={tab}
        unifiedTabId={unifiedTabId}
        groupId={groupId}
        isActive={isActive}
        tabCount={tabCount}
        hasTabsToRight={hasTabsToRight}
        isPinned={isPinned}
        onActivate={onActivate}
        onClose={onClose}
        onCloseOthers={onCloseOthers}
        onCloseToRight={onCloseToRight}
        onRenameOpen={handleRenameOpen}
        onSetTabColor={onSetTabColor}
        onTogglePin={onTogglePin}
      />
    </ContextMenu>
  )
}
