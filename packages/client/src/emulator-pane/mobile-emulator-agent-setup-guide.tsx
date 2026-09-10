import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CaretDown as ChevronDown, CaretUp as ChevronUp } from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { cn } from '~renderer/ui/class-names'

import { Button } from '../ui/button'
import { MobileEmulatorAgentSetupGuideSteps } from './mobile-emulator-agent-setup-guide-steps'
import type { useMobileEmulatorAgentSetupState } from './use-mobile-emulator-agent-setup-state'

type MobileEmulatorAgentSetupGuideProps = {
  setup: ReturnType<typeof useMobileEmulatorAgentSetupState>
  worktreeId: string
}

export function MobileEmulatorAgentSetupGuide({
  setup,
  worktreeId
}: MobileEmulatorAgentSetupGuideProps): React.JSX.Element {
  const dismissMobileEmulatorAgentSetup = useAppStore((s) => s.dismissMobileEmulatorAgentSetup)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)
  const [expanded, setExpanded] = useState(false)

  const dismiss = (): void => {
    dismissMobileEmulatorAgentSetup()
  }

  const openSettings = (): void => {
    recordFeatureInteraction('mobile-emulator-agent-setup')
    openSettingsTarget({ pane: 'mobile-emulator', repoId: null })
    openSettingsPage()
  }

  return (
    <div
      role="region"
      aria-label={translate(
        'auto.components.emulator.pane.MobileEmulatorAgentSetupGuide.2fda9ff015',
        'Set up agent control'
      )}
      className="border-border bg-card text-card-foreground overflow-hidden rounded-lg border"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <p className="text-muted-foreground min-w-0 flex-1 text-[11px] leading-4">
          {setup.setupComplete ? (
            <span className="text-foreground font-medium">
              {translate(
                'auto.components.emulator.pane.MobileEmulatorAgentSetupGuide.0ac0fef514',
                'Agent control is ready.'
              )}
            </span>
          ) : (
            <>
              <span className="text-foreground font-medium">
                {translate(
                  'auto.components.emulator.pane.MobileEmulatorAgentSetupGuide.2bdfff8763',
                  'Agent control (optional).'
                )}{' '}
              </span>
              {translate(
                'auto.components.emulator.pane.MobileEmulatorAgentSetupGuide.72736b051f',
                'Set up AgentStart CLI + skill when you want agents to drive this simulator.'
              )}
            </>
          )}
        </p>

        <div className="flex shrink-0 items-center gap-1 self-center">
          {setup.setupComplete ? (
            <Button
              type="button"
              size="sm"
              variant="default"
              className="h-6 px-2.5 text-[11px]"
              onClick={dismiss}
            >
              {translate(
                'auto.components.emulator.pane.MobileEmulatorAgentSetupGuide.d10ae98046',
                'Done'
              )}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-muted-foreground h-6 px-2 text-[11px]"
                onClick={dismiss}
              >
                {translate(
                  'auto.components.emulator.pane.MobileEmulatorAgentSetupGuide.3756cbeca7',
                  'Not now'
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={expanded ? 'secondary' : 'default'}
                className="h-6 gap-1 px-2 text-[11px]"
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded
                  ? translate(
                      'auto.components.emulator.pane.MobileEmulatorAgentSetupGuide.6d950431d2',
                      'Hide'
                    )
                  : translate(
                      'auto.components.emulator.pane.MobileEmulatorAgentSetupGuide.ebceac65a4',
                      'Set up'
                    )}
                {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              </Button>
            </>
          )}
        </div>
      </div>

      {expanded && !setup.setupComplete ? (
        <div className="scrollbar-sleek border-border/60 max-h-[min(36vh,16rem)] overflow-y-auto border-t px-3 pb-2">
          <div className="flex items-center justify-end py-1.5">
            <span
              className={cn(
                'px-2 py-0.5 text-[10px] font-medium rounded-full',
                setup.setupComplete
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {setup.completedCount}/2
            </span>
          </div>
          <MobileEmulatorAgentSetupGuideSteps setup={setup} worktreeId={worktreeId} />
          <div className="pt-1 pb-1">
            <Button
              variant="ghost"
              size="xs"
              type="button"
              onClick={openSettings}
              className="text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:bg-accent h-auto border-0 p-0 text-[11px] underline-offset-2 hover:underline"
            >
              {translate(
                'auto.components.emulator.pane.MobileEmulatorAgentSetupGuide.3f003507f4',
                'Open full setup in Settings'
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
