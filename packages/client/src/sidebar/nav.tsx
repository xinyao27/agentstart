import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { openCommandPalette } from '~renderer/extension/command-palette/open'
import { translate } from '~renderer/i18n/i18n'
import { useUiLocale } from '~renderer/i18n/use-ui-locale'
import {
  ActivityIcon as Activity,
  BookOpen,
  CalendarDots,
  DeviceMobile as Smartphone,
  MagnifyingGlass as Search
} from '~renderer/icons/hugeicons'
import { useShortcutKeyComboDetails } from '~renderer/keyboard-input/use-shortcut-label'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { ContextMenu, ContextMenuTrigger } from '~renderer/ui/context-menu'
import { getSelectableControlStateClasses } from '~renderer/ui/selectable-control-state'
import { ShortcutKeyCombo } from '~renderer/ui/shortcut-key-combo'

import { hasSidebarHostNavigation, openSidebarPage } from './host-navigation'
import { useMobileSidebarOnboardingBadge } from './mobile-sidebar-onboarding-badge'
import { HideSidebarMenu } from './nav-controls'
import { SetupGuideSidebarEntry } from './setup-guide-sidebar-entry'

export {
  getSetupGuideSidebarEntryReady,
  shouldShowSetupGuideEntry
} from './setup-guide-sidebar-entry'

export function shouldShowMobileButton(
  settings: Pick<GlobalSettings, 'showMobileButton'> | null | undefined
): boolean {
  return settings?.showMobileButton !== false
}

const SidebarNav = function SidebarNav() {
  // Why: this memo boundary needs its own language subscription.
  useUiLocale()
  const commandPaletteShortcutCombos = useShortcutKeyComboDetails('app.commandPalette')
  const openHomePage = useAppStore((s) => s.openHomePage)
  const openSkillsPage = useAppStore((s) => s.openSkillsPage)
  const openMobilePage = useAppStore((s) => s.openMobilePage)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const activeView = useAppStore((s) => s.activeView)
  const showMobileButton = useAppStore((s) => shouldShowMobileButton(s.settings))
  const homeActive = activeView === 'home'
  const skillsActive = activeView === 'skills'
  const mobileActive = activeView === 'mobile'
  const mobileOnboardingBadge = useMobileSidebarOnboardingBadge(showMobileButton)
  const usesHostNavigation = hasSidebarHostNavigation()
  const hideMobileButton = () => {
    void updateSettings({ showMobileButton: false })
  }

  return (
    <div
      className="flex flex-col gap-0.5 px-2 pt-2 pb-1"
      data-contextual-tour-target="sidebar-navigation"
    >
      <Button
        variant="ghost"
        size="sidebar-row"
        type="button"
        onClick={() => {
          if (!openSidebarPage('search')) {
            openCommandPalette()
          }
        }}
        aria-label={translate(
          'auto.components.sidebar.SidebarNav.0c3395fd32',
          'Search projects, worktrees, sessions, and files'
        )}
        className={cn('group', getSelectableControlStateClasses(false))}
      >
        <Search className="text-sidebar-foreground/30 size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {translate('auto.components.sidebar.SidebarNav.80611a8b10', 'Search')}
        </span>
        <span
          aria-hidden
          className="pointer-events-none ml-1.5 hidden shrink-0 items-center gap-1.5 group-focus-within:inline-flex group-hover:inline-flex"
        >
          {commandPaletteShortcutCombos.map((combo) => (
            <ShortcutKeyCombo
              key={combo.keys.join('-')}
              keys={combo.keys}
              doubleTap={combo.doubleTap}
              className="gap-0.5"
              keyCapClassName="border-sidebar-border/80 bg-sidebar-foreground/8 text-sidebar-foreground/55 min-w-4 px-1 py-px text-[9px]"
              separatorClassName="text-sidebar-foreground/45 text-[9px]"
            />
          ))}
        </span>
      </Button>
      <Button
        variant="ghost"
        size="sidebar-row"
        type="button"
        onClick={() => {
          if (!openSidebarPage('activity')) {
            openHomePage()
          }
        }}
        aria-current={homeActive ? 'page' : undefined}
        className={getSelectableControlStateClasses(homeActive)}
      >
        <Activity className={cn('size-4 shrink-0', !homeActive && 'text-sidebar-foreground/30')} />
        <span className="flex-1">
          {translate('auto.components.sidebar.SidebarNav.activity', 'Activity')}
        </span>
      </Button>
      <SetupGuideSidebarEntry />
      <Button
        variant="ghost"
        size="sidebar-row"
        type="button"
        onClick={() => {
          if (!openSidebarPage('skills')) {
            openSkillsPage()
          }
        }}
        aria-current={skillsActive ? 'page' : undefined}
        className={getSelectableControlStateClasses(skillsActive)}
      >
        <BookOpen
          className={cn('size-4 shrink-0', !skillsActive && 'text-sidebar-foreground/30')}
        />
        <span className="flex-1">
          {translate('auto.components.sidebar.SidebarNav.skills', 'Skills')}
        </span>
      </Button>
      {usesHostNavigation ? (
        <Button
          variant="ghost"
          size="sidebar-row"
          type="button"
          onClick={() => openSidebarPage('automations')}
          className={getSelectableControlStateClasses(false)}
        >
          <CalendarDots className="text-sidebar-foreground/30 size-4 shrink-0" />
          <span className="flex-1">
            {translate('extension.navigation.automations', 'Automations')}
          </span>
        </Button>
      ) : null}
      {showMobileButton ? (
        <ContextMenu>
          <ContextMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  mobileOnboardingBadge.dismiss()
                  if (!openSidebarPage('mobile')) {
                    openMobilePage()
                  }
                }}
                aria-current={mobileActive ? 'page' : undefined}
                className={cn(
                  'border-0 justify-start whitespace-normal gap-2 focus-visible:bg-accent',
                  'flex w-full px-2 py-1.5 text-left text-[13px] tracking-tight transition-colors',
                  mobileActive ? 'bg-accent text-accent-foreground' : 'text-sidebar-foreground/60'
                )}
              >
                <Smartphone
                  className={cn('size-4 shrink-0', !mobileActive && 'text-sidebar-foreground/30')}
                />
                <span className="flex-1">
                  {translate('auto.components.sidebar.SidebarNav.1b5c41caee', 'Yiru Mobile')}
                </span>
                {mobileOnboardingBadge.visible ? (
                  <span className="bg-primary text-primary-foreground px-1.5 py-px text-[10px] font-semibold">
                    {translate('auto.components.sidebar.SidebarNav.c86d83b5c3', 'New')}
                  </span>
                ) : null}
              </Button>
            }
          />
          <HideSidebarMenu onHide={hideMobileButton} />
        </ContextMenu>
      ) : null}
    </div>
  )
}

export default SidebarNav
