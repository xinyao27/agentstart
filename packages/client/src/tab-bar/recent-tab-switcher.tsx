import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { translate } from '~renderer/i18n/i18n'
import {
  FileText,
  GitBranch,
  GitDiff as GitCompare,
  Globe as Globe2,
  TerminalWindow as TerminalSquare
} from '~renderer/icons/hugeicons'
import { getShortcutPlatform } from '~renderer/keyboard-input/use-shortcut-label'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'
import { cn } from '~renderer/ui/class-names'
import {
  isRecentTabSwitcherCommitRelease,
  matchesRecentTabSwitcherChord
} from '~renderer/window-shortcut-policy'

import { activateCyclableTab } from './ipc-tab-switch'
import {
  buildRecentTabSwitcherModel,
  getNextRecentTabSwitcherIndex,
  normalizeCtrlTabOrderMode,
  type RecentTabSwitcherItem
} from './recent-tab-switching'

type SwitcherState = {
  items: RecentTabSwitcherItem[]
  selectedIndex: number
}

function consumeKeyboardEvent(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()
}

function TabIcon({ item }: { item: RecentTabSwitcherItem }): React.JSX.Element {
  const className = 'size-4 shrink-0 text-muted-foreground'
  if (item.type === 'terminal') {
    return <TerminalSquare className={className} />
  }
  if (item.type === 'browser') {
    return <Globe2 className={className} />
  }
  if (item.contentType === 'git-graph') {
    return <GitBranch className={className} />
  }
  if (
    item.contentType === 'diff' ||
    item.contentType === 'conflict-review' ||
    item.contentType === 'check-details'
  ) {
    return <GitCompare className={className} />
  }
  return <FileText className={className} />
}

export default function RecentTabSwitcher(): React.JSX.Element | null {
  const [switcher, setSwitcher] = useState<SwitcherState | null>(null)
  const switcherRef = useRef<SwitcherState | null>(null)

  const setSwitcherState = (next: SwitcherState | null): void => {
    switcherRef.current = next
    setSwitcher(next)
  }

  const openOrAdvance = useEventCallback((direction: 1 | -1): void => {
    const store = useAppStore.getState()
    if (store.activeView !== 'terminal' || !store.activeWorktreeId) {
      return
    }

    const model = buildRecentTabSwitcherModel(
      store,
      store.activeWorktreeId,
      normalizeCtrlTabOrderMode(store.settings?.ctrlTabOrderMode)
    )
    if (!model) {
      return
    }

    const current = switcherRef.current
    const selectedKey = current?.items[current.selectedIndex]?.key ?? null
    const currentIndex =
      selectedKey == null
        ? model.activeIndex
        : model.items.findIndex((item) => item.key === selectedKey)
    const selectedIndex = getNextRecentTabSwitcherIndex(model.items.length, currentIndex, direction)
    setSwitcherState({ items: model.items, selectedIndex })
  })

  const commit = useEventCallback((): void => {
    const current = switcherRef.current
    setSwitcherState(null)
    const selected = current?.items[current.selectedIndex]
    if (!selected) {
      return
    }
    activateCyclableTab(useAppStore.getState(), selected)
  })

  const cancel = useEventCallback((): void => {
    setSwitcherState(null)
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const store = useAppStore.getState()
      if (matchesRecentTabSwitcherChord(event, getShortcutPlatform(), store.keybindings)) {
        // Why: handle the chord at the browser boundary while respecting the
        // user's keybinding registry.
        consumeKeyboardEvent(event)
        openOrAdvance(event.shiftKey ? -1 : 1)
        return
      }
      if (!switcherRef.current) {
        return
      }
      if (event.key === 'Escape') {
        consumeKeyboardEvent(event)
        cancel()
      }
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (!switcherRef.current || !isRecentTabSwitcherCommitRelease(event)) {
        return
      }
      consumeKeyboardEvent(event)
      commit()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('keyup', onKeyUp, { capture: true })
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('keyup', onKeyUp, { capture: true })
      window.removeEventListener('blur', cancel)
    }
  }, [cancel, commit, openOrAdvance])

  if (!switcher) {
    return null
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]">
      <div
        className="border-border bg-popover text-popover-foreground w-[min(520px,calc(100vw-48px))] overflow-hidden rounded-lg border"
        role="listbox"
        aria-label={translate(
          'auto.components.tab.bar.RecentTabSwitcher.07ad4cd0b7',
          'Switch tabs'
        )}
      >
        <div className="border-border text-muted-foreground border-b px-3 py-2 text-xs font-semibold">
          {translate('auto.components.tab.bar.RecentTabSwitcher.329638ff6f', 'Switch Tab')}
        </div>
        <div className="max-h-[min(360px,60vh)] overflow-hidden py-1">
          {switcher.items.map((item, index) => {
            const selected = index === switcher.selectedIndex
            return (
              <div
                key={item.key}
                role="option"
                aria-selected={selected}
                className={cn(
                  'flex h-8 items-center gap-2 px-3 text-sm',
                  selected ? 'bg-accent text-accent-foreground' : 'text-foreground'
                )}
              >
                <TabIcon item={item} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.isDirty ? (
                  <span className="bg-muted-foreground size-1.5 shrink-0 rounded-full" />
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}
