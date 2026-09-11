import { cn } from 'cnfast'

import { TAB_LABELS } from './state'
import type { TabId } from './state'

export type TabStripProps = {
  tabs: TabId[]
  activeTab: TabId
}

/**
 * Why: the active tab drops its bottom border and paints the content surface,
 * so tab and pane read as one plane — the desktop tab-strip rule.
 */
export function TabStrip({ tabs, activeTab }: TabStripProps): React.JSX.Element {
  return (
    <div className="border-hairline relative flex h-8 shrink-0 items-stretch border-b">
      {tabs.map((tab) => {
        const active = tab === activeTab
        return (
          <span
            key={tab}
            className={cn(
              'border-hairline relative flex items-center border-r px-3 font-mono text-[10.5px] transition-colors',
              active ? 'bg-page text-ink' : 'text-faint'
            )}
          >
            {TAB_LABELS[tab]}
            {active ? (
              <span className="bg-page absolute inset-x-0 -bottom-px h-px" aria-hidden="true" />
            ) : null}
          </span>
        )
      })}
    </div>
  )
}
