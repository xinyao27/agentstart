import type React from 'react'
import { createContext, useContext } from 'react'
import { useAppStore } from '~renderer/store/state'
import { cn } from '~renderer/ui/class-names'

import type { SettingsSearchEntry } from './search'
import { matchesSettingsSearch } from './search'

// Why: avoids threading `activeSectionId` through every <SettingsSection /> call
// site in settings-page.tsx — the page wraps its content tree in this provider.
const ActiveSettingsSectionContext = createContext<string | null>(null)

export const ActiveSettingsSectionProvider = ActiveSettingsSectionContext.Provider

type SettingsSectionProps = {
  id: string
  title: string
  description: string
  searchEntries?: SettingsSearchEntry[]
  children?: React.ReactNode
  className?: string
  bodyClassName?: string
  badge?: string
  badgeAccessory?: React.ReactNode
  forceVisible?: boolean
  /** When true, this section is the one currently selected in the sidebar.
   *  Sections render only when active. During search, the sidebar lists every
   *  match while the content pane stays focused on the selected match instead
   *  of mounting every matching settings surface at once. */
  isActive?: boolean
  /** Rendered in the section header's upper-right corner — intended for
   *  section-scoped actions (e.g. "Import from Ghostty") that would otherwise
   *  crowd the settings list as their own row. */
  headerAction?: React.ReactNode
}

export function SettingsSection({
  id,
  title,
  description,
  searchEntries,
  children,
  className,
  bodyClassName,
  badge,
  badgeAccessory,
  forceVisible = false,
  isActive,
  headerAction
}: SettingsSectionProps): React.JSX.Element | null {
  const query = useAppStore((state) => state.settingsSearchQuery)
  const activeFromContext = useContext(ActiveSettingsSectionContext)
  const sectionIsActive = isActive ?? activeFromContext === id
  const hasQuery = query.trim() !== ''
  const matchesQuery = !searchEntries || matchesSettingsSearch(query, searchEntries)
  if (!forceVisible) {
    if (hasQuery) {
      if (!sectionIsActive || !matchesQuery) {
        return null
      }
    } else if (!sectionIsActive) {
      return null
    }
  }

  return (
    <section id={id} data-settings-section={id} className={cn('scroll-mt-8 space-y-8', className)}>
      <div className="border-border/60 flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div className="min-w-0 space-y-2">
          <h2 className="text-foreground flex flex-wrap items-center gap-2 text-xl leading-7 font-semibold">
            {title}
            {badge ? (
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[0.05em] uppercase">
                {badge}
              </span>
            ) : null}
            {badgeAccessory}
          </h2>
          <p className="text-muted-foreground max-w-3xl text-sm leading-5">{description}</p>
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      <div className={cn('space-y-6', bodyClassName)}>{children}</div>
    </section>
  )
}
