import type { FeatureWallSetupStepId } from '@yiru/protocol/telemetry/feature-wall/types'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { EyeSlash as EyeOff } from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '~renderer/ui/context-menu'

import { getFirstIncompleteFeatureWallSetupStepId } from '../feature-wall/content/setup-steps'
import type { FeatureWallSetupProgress } from '../feature-wall/setup-progress'
import { SetupGuideProgressRing } from '../setup-guide/progress-ring'
import { useSetupGuideProgress } from '../setup-guide/use-setup-guide-progress'

export type SetupGuideEntryVisibilityInput = {
  ready: boolean
  setupComplete: boolean
  dismissed: boolean
}

export function shouldShowSetupGuideEntry(input: SetupGuideEntryVisibilityInput): boolean {
  return input.ready && !input.setupComplete && !input.dismissed
}

export function getSetupGuideSidebarEntryReady(
  persistedUIReady: boolean,
  setupProgressReady: boolean
): boolean {
  return persistedUIReady && setupProgressReady
}

function isSetupGuideSidebarComplete(progress: FeatureWallSetupProgress): boolean {
  return progress.coreDoneCount >= progress.coreTotal
}

export function SetupGuideSidebarEntry(): React.JSX.Element | null {
  const openModal = useAppStore((s) => s.openModal)
  const activeModal = useAppStore((s) => s.activeModal)
  const persistedUIReady = useAppStore((s) => s.persistedUIReady)
  const setupGuideSidebarDismissed = useAppStore((s) => s.setupGuideSidebarDismissed)
  const setSetupGuideSidebarDismissed = useAppStore((s) => s.setSetupGuideSidebarDismissed)
  // Why: the sidebar count must be warmed before click so it matches the modal
  // count instead of changing while the lazy modal is mounting.
  const setupProgress = useSetupGuideProgress(true, false, false)
  const setupComplete = isSetupGuideSidebarComplete(setupProgress)
  const setupActive = activeModal === 'setup-guide'
  const showSetupGuideEntry = shouldShowSetupGuideEntry({
    ready: getSetupGuideSidebarEntryReady(persistedUIReady, setupProgress.ready),
    setupComplete,
    dismissed: setupGuideSidebarDismissed
  })
  const renderedProgress = showSetupGuideEntry ? setupProgress : null
  const handleHideSetupGuide = () => {
    setSetupGuideSidebarDismissed(true)
  }

  if (!renderedProgress) {
    return null
  }
  const firstUnfinishedSetupStepId: FeatureWallSetupStepId =
    getFirstIncompleteFeatureWallSetupStepId(renderedProgress.stepDone)

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            type="button"
            data-contextual-tour-target="setup-guide-entry"
            onClick={() =>
              openModal('setup-guide', {
                setupStepId: firstUnfinishedSetupStepId,
                telemetrySource: 'sidebar'
              })
            }
            aria-current={setupActive ? 'page' : undefined}
            className={cn(
              'border-0 justify-start whitespace-normal gap-2 focus-visible:bg-accent',
              'flex w-full px-2 py-1.5 text-left text-[13px] tracking-tight transition-colors',
              setupActive ? 'bg-accent text-accent-foreground' : 'text-sidebar-foreground/60'
            )}
          >
            <SetupGuideProgressRing
              done={renderedProgress.coreDoneCount}
              total={renderedProgress.coreTotal}
              sizeClassName="size-4"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">
                {translate(
                  'auto.components.sidebar.SetupGuideSidebarEntry.88d402b71d',
                  'Onboarding checklist'
                )}
              </span>
            </span>
          </Button>
        }
      />
      <ContextMenuContent>
        <ContextMenuItem onClick={handleHideSetupGuide}>
          <EyeOff className="size-3.5" />
          {translate(
            'auto.components.sidebar.SetupGuideSidebarEntry.b0a7bfc34c',
            'Hide from sidebar'
          )}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
