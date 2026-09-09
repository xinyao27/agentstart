import type { TerminalTab } from '@yiru/protocol/workspace/tabs'
import { translate } from '~renderer/i18n/i18n'
import {
  Sidebar as PanelRightClose,
  PushPin as Pin,
  PushPinSlash as PinOff,
  Pencil,
  List as ListX,
  X
} from '~renderer/icons/hugeicons'
import {
  formatShortcutLabel,
  useOptionalShortcutLabel
} from '~renderer/keyboard-input/use-shortcut-label'
import { useAppStore } from '~renderer/store/state'
import { cn } from '~renderer/ui/class-names'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut
} from '~renderer/ui/context-menu'

import { TerminalTabSplitMenuSection } from './terminal-tab-split-menu-section'

const TAB_COLORS = [
  {
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.20baa43c05', 'None')
    },
    value: null
  },
  {
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.cb3eadefd2', 'Blue')
    },
    value: '#3b82f6'
  },
  {
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.c2d8b0991f', 'Purple')
    },
    value: '#a855f7'
  },
  {
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.03cf6dab1a', 'Pink')
    },
    value: '#ec4899'
  },
  {
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.620aec6729', 'Red')
    },
    value: '#ef4444'
  },
  {
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.a47629b3cf', 'Orange')
    },
    value: '#f97316'
  },
  {
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.69682e2ce4', 'Yellow')
    },
    value: '#eab308'
  },
  {
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.be905e9b0a', 'Green')
    },
    value: '#22c55e'
  },
  {
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.845576bed1', 'Teal')
    },
    value: '#14b8a6'
  },
  {
    get label() {
      return translate('auto.components.tab.bar.SortableTabContextMenu.7703990447', 'Gray')
    },
    value: '#9ca3af'
  }
] as const

type SortableTabContextMenuProps = {
  tab: TerminalTab
  unifiedTabId: string
  groupId: string
  isActive: boolean
  tabCount: number
  hasTabsToRight: boolean
  isPinned: boolean
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
  onCloseOthers: (tabId: string) => void
  onCloseToRight: (tabId: string) => void
  onRenameOpen: () => void
  onSetTabColor: (tabId: string, color: string | null) => void
  onTogglePin: () => void
}

export function SortableTabContextMenu({
  tab,
  unifiedTabId,
  groupId,
  isActive,
  tabCount,
  hasTabsToRight,
  isPinned,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onRenameOpen,
  onSetTabColor,
  onTogglePin
}: SortableTabContextMenuProps): React.JSX.Element {
  const keybindings = useAppStore((state) => state.keybindings)
  const splitRightShortcut = formatShortcutLabel('terminal.splitRight', keybindings)
  const splitDownShortcut = formatShortcutLabel('terminal.splitDown', keybindings)

  const closeShortcut = useOptionalShortcutLabel('tab.close')
  const renameShortcut = useOptionalShortcutLabel('tab.rename')

  return (
    <ContextMenuContent className="w-56">
      <TerminalTabSplitMenuSection
        unifiedTabId={unifiedTabId}
        groupId={groupId}
        tabId={tab.id}
        isActive={isActive}
        onActivate={onActivate}
        splitRightShortcut={splitRightShortcut}
        splitDownShortcut={splitDownShortcut}
      />
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onTogglePin}>
        {isPinned ? (
          <PinOff className="size-3.5 shrink-0" />
        ) : (
          <Pin className="size-3.5 shrink-0" />
        )}
        {isPinned
          ? translate('auto.components.tab.bar.SortableTabContextMenu.417722e9c2', 'Unpin Tab')
          : translate('auto.components.tab.bar.SortableTabContextMenu.60f958ec75', 'Pin Tab')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => !isPinned && onClose(tab.id)} disabled={isPinned}>
        <X className="size-3.5" />
        {translate('auto.components.tab.bar.SortableTabContextMenu.89359a36f7', 'Close')}
        {closeShortcut ? <ContextMenuShortcut>{closeShortcut}</ContextMenuShortcut> : null}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onCloseOthers(tab.id)} disabled={tabCount <= 1}>
        <ListX className="size-3.5" />
        {translate('auto.components.tab.bar.SortableTabContextMenu.8d16f9cd30', 'Close Others')}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onCloseToRight(tab.id)} disabled={!hasTabsToRight}>
        <PanelRightClose className="size-3.5" />
        {translate(
          'auto.components.tab.bar.SortableTabContextMenu.c1ee099c7e',
          'Close Tabs To The Right'
        )}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onRenameOpen}>
        <Pencil className="size-3.5" />
        {translate('auto.components.tab.bar.SortableTabContextMenu.2f697b3c31', 'Change Title')}
        {renameShortcut ? <ContextMenuShortcut>{renameShortcut}</ContextMenuShortcut> : null}
      </ContextMenuItem>
      <div className="px-2 pt-1.5 pb-1">
        <div className="text-muted-foreground mb-1.5 text-xs font-medium">
          {translate('auto.components.tab.bar.SortableTabContextMenu.35e8892fd0', 'Tab Color')}
        </div>
        <div className="flex flex-wrap gap-2">
          {TAB_COLORS.map((color) => {
            const isSelected = tab.color === color.value
            return (
              <ContextMenuItem
                key={color.label}
                className={cn(
                  'relative h-4 w-4 min-w-4 p-0 border',
                  // Why: selection reuses the existing edge because Yiru does not use CSS outlines.
                  isSelected
                    ? 'border-ring'
                    : color.value
                      ? 'border-transparent'
                      : 'border-muted-foreground/50 bg-transparent'
                )}
                style={color.value ? { backgroundColor: color.value } : undefined}
                onClick={() => {
                  onSetTabColor(tab.id, color.value)
                }}
              >
                {color.value === null && (
                  <span className="bg-muted-foreground/80 absolute block h-px w-3 rotate-45" />
                )}
              </ContextMenuItem>
            )
          })}
        </div>
      </div>
    </ContextMenuContent>
  )
}
