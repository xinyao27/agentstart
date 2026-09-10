import {
  AGENTSTART_GITHUB_RELEASES_URL,
  AGENTSTART_GITHUB_REPOSITORY_URL
} from '@agentstart/protocol/hosted-review/agentstart-repository'
import React, { useState } from 'react'
import { toast } from 'sonner'
import logo from '~renderer/assets/brand/agentstart-wordmark.png?url'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import {
  BookOpen,
  Question as CircleHelp,
  GithubLogo as Github,
  Keyboard,
  ChatText as MessageSquareText,
  Student as School,
  Scroll as ScrollText,
  Gear as Settings,
  ArrowSquareOut as ExternalLink,
  ArrowClockwise as RefreshCw,
  ArrowClockwise as RotateCw
} from '~renderer/icons/hugeicons'
import { useShortcutKeyDetails } from '~renderer/keyboard-input/use-shortcut-label'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { ShortcutKeyCombo } from '~renderer/ui/shortcut-key-combo'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'
import {
  getUpdateCheckClickOptions,
  getUpdateCheckHint
} from '~renderer/updates/check-click-options'

import { showOnboardingFromRenderer } from '../onboarding/show-onboarding-event'
import { SetupGuideProgressRing } from '../setup-guide/progress-ring'
import { useSetupGuideProgress } from '../setup-guide/use-setup-guide-progress'
import { SidebarFeedbackDialog } from './feedback-dialog'
import { openSidebarPage } from './host-navigation'

const DOCS_URL = `${AGENTSTART_GITHUB_REPOSITORY_URL}#readme`
const NO_UPDATE_CHECK_MODIFIERS = { ctrlKey: false, metaKey: false, shiftKey: false }

function openExternalUrl(url: string, event: React.MouseEvent<HTMLElement>): void {
  openHttpLink(url, { event })
}

function ExternalMenuItem({
  label,
  url,
  icon
}: {
  label: string
  url: string
  icon: React.ReactNode
}): React.JSX.Element {
  return (
    <DropdownMenuItem onClick={(event) => openExternalUrl(url, event)}>
      {icon}
      {label}
      <ExternalLink className="text-muted-foreground ml-auto size-3" />
    </DropdownMenuItem>
  )
}

export function SidebarSettingsHelpMenu(): React.JSX.Element {
  const openModal = useAppStore((s) => s.openModal)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const updateStatus = useAppStore((s) => s.updateStatus)
  const setupProgress = useSetupGuideProgress(true, false, false)

  const settingsShortcut = useShortcutKeyDetails('app.settings')
  const [menuOpen, setMenuOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [showAdminOptions, setShowAdminOptions] = useState(false)
  const [isRestartingAgentStart, setIsRestartingAgentStart] = useState(false)
  const lastShowOnboardingAtRef = React.useRef(0)
  const updateCheckModifiersRef = React.useRef(NO_UPDATE_CHECK_MODIFIERS)
  const mountedRef = useMountedRef()
  const updateCheckHint = getUpdateCheckHint()

  const showMilestones =
    setupProgress.ready && setupProgress.coreDoneCount < setupProgress.coreTotal

  const handleMenuOpenChange = (open: boolean): void => {
    setMenuOpen(open)
    updateCheckModifiersRef.current = NO_UPDATE_CHECK_MODIFIERS
    if (!open) {
      setShowAdminOptions(false)
    }
  }

  const revealAdminOptions = (altKey: boolean): void => {
    // Why: onboarding replay and restart stay off the default Help menu; holding
    // Option/Alt before opening is an intentional power-user affordance.
    setShowAdminOptions(altKey)
  }

  const handleShowOnboarding = (): void => {
    const now = Date.now()
    if (now - lastShowOnboardingAtRef.current < 500) {
      return
    }
    lastShowOnboardingAtRef.current = now
    void showOnboardingFromRenderer()
  }

  const handleRestartAgentStart = (): void => {
    if (isRestartingAgentStart) {
      return
    }
    setIsRestartingAgentStart(true)
    toast.info(
      translate(
        'auto.components.sidebar.SidebarSettingsHelpMenu.5161eef55d',
        'Restarting AgentStart…'
      )
    )
    void shellClient.app.restart().catch((error) => {
      if (mountedRef.current) {
        setIsRestartingAgentStart(false)
        toast.error(
          translate(
            'auto.components.sidebar.SidebarSettingsHelpMenu.4e8f5710d3',
            "Couldn't restart AgentStart."
          ),
          {
            description: error instanceof Error ? error.message : undefined
          }
        )
      }
    })
  }

  const openShortcutsSettings = (): void => {
    openSettingsTarget({ pane: 'shortcuts', repoId: null })
    openSettingsPage()
  }

  const handleOpenSettings = (): void => {
    if (!openSidebarPage('settings')) {
      openSettingsPage()
    }
  }

  const handleCheckForUpdatesPointerDown = (event: React.PointerEvent): void => {
    updateCheckModifiersRef.current = {
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey
    }
  }

  const handleCheckForUpdates = (): void => {
    const modifiers = updateCheckModifiersRef.current
    updateCheckModifiersRef.current = NO_UPDATE_CHECK_MODIFIERS
    void shellClient.updater.check(getUpdateCheckClickOptions(modifiers))
  }

  const openMilestones = (): void => {
    openModal('setup-guide', { telemetrySource: 'help_menu' })
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                aria-label={translate(
                  'auto.components.sidebar.SidebarSettingsHelpMenu.a428c25998',
                  'Settings'
                )}
                className="text-muted-foreground"
                onClick={handleOpenSettings}
              >
                <Settings className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="top" sideOffset={4} className="flex items-center gap-1.5">
            {translate('auto.components.sidebar.SidebarSettingsHelpMenu.a428c25998', 'Settings')}
            {settingsShortcut.keys.length > 0 ? (
              <ShortcutKeyCombo
                keys={settingsShortcut.keys}
                variant="inverted"
                doubleTap={settingsShortcut.doubleTap}
                className="gap-0.5"
                keyCapClassName="min-w-0 px-1 py-0 text-[10px]"
                separatorClassName="text-[10px]"
              />
            ) : null}
          </TooltipContent>
        </Tooltip>
        <DropdownMenu modal={false} open={menuOpen} onOpenChange={handleMenuOpenChange}>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      type="button"
                      aria-label={translate(
                        'auto.components.sidebar.SidebarSettingsHelpMenu.2991a0106c',
                        'Help'
                      )}
                      className="text-muted-foreground"
                      onPointerDown={(event) => revealAdminOptions(event.altKey)}
                      onClick={(event) => revealAdminOptions(event.altKey)}
                    >
                      <CircleHelp className="size-4" />
                    </Button>
                  }
                />
              }
            />
            <TooltipContent side="top" sideOffset={4}>
              {translate('auto.components.sidebar.SidebarSettingsHelpMenu.2991a0106c', 'Help')}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-52">
            <DropdownMenuItem onClick={openShortcutsSettings}>
              <Keyboard className="size-3.5" />
              {translate(
                'auto.components.sidebar.SidebarSettingsHelpMenu.e565171a7c',
                'Keyboard Shortcuts'
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setFeedbackOpen(true)}>
              <MessageSquareText className="size-3.5" />
              {translate(
                'auto.components.sidebar.SidebarSettingsHelpMenu.4cf5b868d7',
                'Send Feedback'
              )}
            </DropdownMenuItem>
            {showMilestones ? (
              <DropdownMenuItem onClick={openMilestones}>
                <img src={logo} alt="" aria-hidden="true" className="size-5 object-contain" />
                {translate(
                  'auto.components.sidebar.SidebarSettingsHelpMenu.f8a2c91d4e',
                  'Milestones'
                )}
                <SetupGuideProgressRing
                  done={setupProgress.coreDoneCount}
                  total={setupProgress.coreTotal}
                  sizeClassName="size-4"
                  className="ml-auto"
                />
              </DropdownMenuItem>
            ) : null}
            {showAdminOptions ? (
              <DropdownMenuItem className="whitespace-nowrap" onClick={handleShowOnboarding}>
                <School className="size-3.5" />
                {translate(
                  'auto.components.sidebar.SidebarSettingsHelpMenu.b7e4d2a19c',
                  'Onboarding'
                )}
              </DropdownMenuItem>
            ) : null}
            <ExternalMenuItem
              label={translate(
                'auto.components.sidebar.SidebarSettingsHelpMenu.cdc87f897e',
                'Docs'
              )}
              url={DOCS_URL}
              icon={<BookOpen className="size-3.5" />}
            />
            <ExternalMenuItem
              label={translate(
                'auto.components.sidebar.SidebarSettingsHelpMenu.5f83d86d92',
                'Changelog'
              )}
              url={AGENTSTART_GITHUB_RELEASES_URL}
              icon={<ScrollText className="size-3.5" />}
            />
            <DropdownMenuSeparator />
            <ExternalMenuItem
              label={translate(
                'auto.components.sidebar.SidebarSettingsHelpMenu.5687ab246a',
                'GitHub'
              )}
              url={AGENTSTART_GITHUB_REPOSITORY_URL}
              icon={<Github className="size-3.5" />}
            />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={updateStatus.state === 'checking' || updateStatus.state === 'downloading'}
              onPointerDown={handleCheckForUpdatesPointerDown}
              onClick={handleCheckForUpdates}
              title={updateCheckHint}
            >
              {updateStatus.state === 'checking' ? (
                <LoadingIndicator className="size-3.5" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {translate(
                'auto.components.sidebar.SidebarSettingsHelpMenu.29c56f30ee',
                'Check for Updates'
              )}
            </DropdownMenuItem>
            {showAdminOptions ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleRestartAgentStart}
                  disabled={isRestartingAgentStart}
                >
                  <RotateCw className="size-3.5" />
                  {translate(
                    'auto.components.sidebar.SidebarSettingsHelpMenu.ad3d3ed7f1',
                    'Restart AgentStart'
                  )}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <SidebarFeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  )
}
