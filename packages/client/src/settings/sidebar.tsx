import type { GitHubRepositoryIdentity } from '@agentstart/protocol/hosted-review/pull-request-types'
import type { RepoIcon } from '@agentstart/protocol/project/icon'
import type { CSSProperties, RefObject } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { MagnifyingGlass as Search, ArrowLeft } from '~renderer/icons/hugeicons'
import { useShortcutKeyComboDetails } from '~renderer/keyboard-input/use-shortcut-label'
import type { SettingsNavIcon, SettingsNavInstallStatus } from '~renderer/settings/navigation-types'
import { cn } from '~renderer/ui/class-names'

import { RepoForkIndicator } from '../repo/fork-indicator'
import { RepoIconGlyph } from '../repo/icon'
import { SetupGuideProgressRing } from '../setup-guide/progress-ring'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { ScrollArea } from '../ui/scroll-area'
import { ShortcutKeyCombo } from '../ui/shortcut-key-combo'
import { useSettingsSetupGuideProgress } from './setup-guide-progress'
import type { SettingsSetupGuideProgress } from './setup-guide-progress'

type NavSection = {
  id: string
  title: string
  icon: SettingsNavIcon
  badge?: string
  installStatus?: SettingsNavInstallStatus
}

type NavGroup = {
  id: string
  title: string
  hideTitle?: boolean
  sections: NavSection[]
}

type RepoNavSection = NavSection & {
  badgeColor?: string
  repoIcon?: RepoIcon | null
  upstream?: GitHubRepositoryIdentity | null
}

type SettingsSidebarProps = {
  activeSectionId: string
  appearanceStyle?: CSSProperties
  generalGroups: NavGroup[]
  repoSections: RepoNavSection[]
  hasRepos: boolean
  searchQuery: string
  searchInputRef?: RefObject<HTMLInputElement | null>
  onBack: () => void
  onSearchChange: (query: string) => void
  onSelectSection: (
    sectionId: string,
    modifiers: {
      metaKey: boolean
      ctrlKey: boolean
      shiftKey: boolean
      altKey: boolean
    }
  ) => void
  reserveWindowChrome: boolean
}

type SettingsSetupGuideRowProps = {
  progress: SettingsSetupGuideProgress
  setupActive: boolean
  onSelect: (modifiers: {
    metaKey: boolean
    ctrlKey: boolean
    shiftKey: boolean
    altKey: boolean
  }) => void
}

function SettingsSetupGuideNavRow({
  progress,
  setupActive,
  onSelect
}: SettingsSetupGuideRowProps): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="default"
      type="button"
      aria-current={setupActive ? 'page' : undefined}
      aria-label={translate(
        'auto.components.settings.SettingsSidebar.82db1b7de4',
        'Onboarding checklist, {{value0}} of {{value1}} done. Show setup guide.',
        { value0: progress.doneCount, value1: progress.total }
      )}
      onClick={(event) =>
        onSelect({
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey
        })
      }
      className={cn(
        'border-0 justify-start whitespace-normal flex w-full px-2.5 text-left transition-colors',
        setupActive
          ? 'bg-accent text-accent-foreground'
          : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
      )}
    >
      <SetupGuideProgressRing
        done={progress.doneCount}
        total={progress.total}
        sizeClassName="size-4"
        tooltipLabel={`${progress.doneCount}/${progress.total} complete`}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] leading-4 font-medium">
          {translate('auto.components.settings.SettingsSidebar.6503182299', 'Onboarding checklist')}
        </span>
      </span>
    </Button>
  )
}

export function SettingsSidebar({
  activeSectionId,
  appearanceStyle,
  generalGroups,
  repoSections,
  hasRepos,
  searchQuery,
  searchInputRef,
  onBack,
  onSearchChange,
  onSelectSection,
  reserveWindowChrome
}: SettingsSidebarProps): React.JSX.Element {
  const setupGuideProgress = useSettingsSetupGuideProgress(true)
  const setupActive = activeSectionId === 'setup-guide'
  // Why: "Hide from sidebar" only hides the top-left app sidebar prompt;
  // Settings should remain a stable place to reopen the checklist.
  const showSetupGuideTopRow =
    setupGuideProgress.ready && setupGuideProgress.doneCount < setupGuideProgress.total
  const searchShortcutCombos = useShortcutKeyComboDetails('settings.search')
  const navItemClassName = (isActive: boolean): string =>
    cn(
      'flex w-full items-center justify-start gap-2 px-3 py-1.5 text-left text-[13px] outline-none transition-colors duration-150 rounded-lg',
      isActive
        ? 'bg-accent text-accent-foreground font-medium'
        : 'text-sidebar-foreground/60 hover:bg-accent hover:text-sidebar-foreground'
    )
  const installStatusLabel = (status: SettingsNavInstallStatus): string => {
    switch (status) {
      case 'install':
        return translate(
          'auto.components.settings.AgentSkillSetupPanel.5289300939',
          'Not installed'
        )
      case 'installed':
        return translate('auto.components.settings.AgentSkillSetupPanel.9fcebceb2a', 'Installed')
      case 'up-to-date':
        return translate('auto.components.skills.SkillFreshnessStatusPill.upToDate', 'Up to date')
      case 'update-available':
        return translate(
          'auto.components.skills.SkillFreshnessStatusPill.updateAvailable',
          'Update available'
        )
      case 'checking':
        return translate('auto.components.settings.AgentSkillSetupPanel.68a468752e', 'Checking...')
    }
  }
  const installStatusClassName = (status: SettingsNavInstallStatus): string =>
    cn(
      'ml-auto shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none',
      status === 'installed' || status === 'up-to-date'
        ? 'border-green-700/25 bg-green-700/10 text-green-700 dark:border-green-300/25 dark:bg-green-300/10 dark:text-green-300'
        : status === 'update-available'
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
          : status === 'install'
            ? 'border-foreground/15 bg-foreground/10 text-foreground'
            : 'border-border/50 bg-muted/30 text-muted-foreground'
    )

  return (
    <aside
      // Why: window chrome overlays Settings, so keep its controls clear while
      // allowing the sidebar material to continue behind the traffic lights.
      className={cn(
        'worktree-sidebar-theme border-sidebar-border bg-sidebar flex w-[var(--settings-sidebar-width)] shrink-0 flex-col border-r',
        reserveWindowChrome && 'pt-9'
      )}
      style={appearanceStyle}
    >
      <div className="px-3 pt-2 pb-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-muted-foreground w-full justify-start gap-2 text-[13px]"
        >
          <ArrowLeft className="size-4" />
          {translate('auto.components.settings.SettingsSidebar.60f8a673a7', 'Back to app')}
        </Button>
      </div>

      <div className="px-3 py-1">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={translate(
              'auto.components.settings.SettingsSidebar.dbceaa8840',
              'Search settings'
            )}
            className="bg-background/60 pr-14 pl-9 text-[13px]"
          />
          {searchQuery === '' ? (
            <span className="pointer-events-none absolute top-1/2 right-2 flex -translate-y-1/2 items-center">
              {searchShortcutCombos.map((combo) => (
                <ShortcutKeyCombo
                  key={combo.keys.join('-')}
                  keys={combo.keys}
                  doubleTap={combo.doubleTap}
                  className="inline-flex gap-0.5"
                  separatorClassName="text-[10px] text-muted-foreground"
                />
              ))}
            </span>
          ) : null}
        </div>
      </div>

      {showSetupGuideTopRow ? (
        <div className="border-sidebar-border border-b px-3 py-1">
          <SettingsSetupGuideNavRow
            progress={setupGuideProgress}
            setupActive={setupActive}
            onSelect={(modifiers) => onSelectSection('setup-guide', modifiers)}
          />
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-3 py-4">
          {generalGroups.map((group, groupIndex) => (
            <div
              key={group.id}
              className={cn(
                'space-y-2 pb-4',
                groupIndex < generalGroups.length - 1 && 'border-sidebar-border border-b'
              )}
            >
              {group.hideTitle ? null : (
                <p className="text-muted-foreground px-3 text-[11px] font-medium tracking-[0.18em] uppercase">
                  {group.title}
                </p>
              )}
              <div className="space-y-1">
                {group.sections
                  .filter((section) => section.id !== 'setup-guide')
                  .map((section) => {
                    const isActive = activeSectionId === section.id

                    return (
                      <Button
                        variant="ghost"
                        size="xs"
                        key={section.id}
                        aria-current={isActive ? 'page' : undefined}
                        data-current={isActive ? 'true' : undefined}
                        onClick={(event) =>
                          onSelectSection(section.id, {
                            metaKey: event.metaKey,
                            ctrlKey: event.ctrlKey,
                            shiftKey: event.shiftKey,
                            altKey: event.altKey
                          })
                        }
                        className={cn(
                          'h-auto border-0 p-0 focus-visible:bg-accent',
                          navItemClassName(isActive)
                        )}
                      >
                        <span className="truncate">{section.title}</span>
                        {section.installStatus ? (
                          <span className={installStatusClassName(section.installStatus)}>
                            {installStatusLabel(section.installStatus)}
                          </span>
                        ) : section.badge ? (
                          <span className="bg-muted text-muted-foreground ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-medium tracking-wider uppercase">
                            {section.badge}
                          </span>
                        ) : null}
                      </Button>
                    )
                  })}
              </div>
            </div>
          ))}

          <div className="space-y-2">
            <p className="text-muted-foreground px-3 text-[11px] font-medium tracking-[0.18em] uppercase">
              {translate('auto.components.settings.SettingsSidebar.5c9669ff9c', 'Projects')}
            </p>

            {repoSections.length > 0 ? (
              <div className="space-y-1">
                {repoSections.map((section) => {
                  const isActive = activeSectionId === section.id

                  return (
                    <Button
                      variant="ghost"
                      size="xs"
                      key={section.id}
                      aria-current={isActive ? 'page' : undefined}
                      data-current={isActive ? 'true' : undefined}
                      onClick={(event) =>
                        onSelectSection(section.id, {
                          metaKey: event.metaKey,
                          ctrlKey: event.ctrlKey,
                          shiftKey: event.shiftKey,
                          altKey: event.altKey
                        })
                      }
                      className={cn(
                        'h-auto border-0 p-0 focus-visible:bg-accent',
                        navItemClassName(isActive)
                      )}
                    >
                      <RepoIconGlyph
                        repoIcon={section.repoIcon}
                        color={section.badgeColor}
                        className="text-muted-foreground size-4 shrink-0"
                        iconClassName="size-3.5"
                      />
                      <span className="truncate">{section.title}</span>
                      <RepoForkIndicator upstream={section.upstream} />
                    </Button>
                  )
                })}
              </div>
            ) : (
              <p className="text-muted-foreground px-3 text-xs">
                {hasRepos
                  ? translate(
                      'auto.components.settings.SettingsSidebar.3e483e256b',
                      'No matching project settings.'
                    )
                  : translate(
                      'auto.components.settings.SettingsSidebar.df38d612b7',
                      'No projects added yet.'
                    )}
              </p>
            )}
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}
