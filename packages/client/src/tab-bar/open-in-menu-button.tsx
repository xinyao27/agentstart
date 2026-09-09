import { WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID } from '@yiru/protocol/settings/panel-titlebar-pins'
import { OpenInApplicationIcon } from '~renderer/external-editor/application-catalog'
import { translate } from '~renderer/i18n/i18n'
import { FolderOpen, CaretDown } from '~renderer/icons/hugeicons'
import {
  getLocalFileManagerLabel,
  getPreferredWorktreeOpenInEntry,
  getWorktreeOpenInEntries,
  openWorktreePath,
  type OpenInMenuEntry,
  WorktreeOpenInMenuContent
} from '~renderer/sidebar/worktree-open-in-menu'
import { useAppStore } from '~renderer/store/state'
import type { DropIndicator } from '~renderer/tab-bar/drop-indicator'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import { getDropIndicatorClasses } from '../workspace-panel/titlebar-drop-indicator'
import type { WorkspacePanelTitlebarModel } from '../workspace-panel/use-workspace-panel-titlebar-model'

export type TabBarOpenInMenuButtonProps = {
  worktreeId: string
  /** When provided, Open in joins the titlebar pin/drag strip. */
  titlebarModel?: WorkspacePanelTitlebarModel | null
  titlebarIndex?: number
  titlebarSource?: 'visible' | 'overflow'
  dropIndicator?: DropIndicator
}

export function TabBarOpenInMenuButton({
  worktreeId,
  titlebarModel = null,
  titlebarIndex,
  titlebarSource = 'visible',
  dropIndicator = null
}: TabBarOpenInMenuButtonProps): React.JSX.Element | null {
  const worktree = useAppStore((state) => state.getKnownWorktreeById(worktreeId) ?? null)
  const runtimeEnvironmentId = useAppStore((state) =>
    getRuntimeEnvironmentIdForWorktree(state, worktreeId)
  )
  const openInApplications = useAppStore((state) => state.settings?.openInApplications ?? [])
  const lastOpenInTargetKey = useAppStore((state) => state.settings?.lastOpenInTargetKey)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const entries = getWorktreeOpenInEntries(openInApplications, getLocalFileManagerLabel())
  const preferredEntry = getPreferredWorktreeOpenInEntry(entries, lastOpenInTargetKey)

  if (!worktree || !preferredEntry) {
    return null
  }

  const openLabel = translate(
    'auto.components.tab.bar.TabBarOpenInMenuButton.3f5d946e01',
    'Open in {{value0}}',
    { value0: preferredEntry.label }
  )
  const chooseLabel = translate(
    'auto.components.tab.bar.TabBarOpenInMenuButton.50ec9a165e',
    'Choose application'
  )

  const openEntry = (entry: OpenInMenuEntry): void => {
    void openWorktreePath({
      target: entry.target,
      worktreePath: worktree.path,
      // Why: Repo.connectionId is dead — nothing sets it since remote hosts
      // were removed (#63) — a repo-backed worktree is never remote.
      connectionId: null,
      runtimeEnvironmentId,
      command: entry.command
    })
  }

  const rememberEntry = (entry: OpenInMenuEntry): void => {
    if (entry.preferenceKey !== lastOpenInTargetKey) {
      // Why: the left half is a repeat action, so menu choices must survive relaunches.
      void updateSettings({ lastOpenInTargetKey: entry.preferenceKey })
    }
  }

  const pinDraggable = Boolean(titlebarModel)
  const startPinDrag = (event: React.PointerEvent): void => {
    if (!titlebarModel) {
      return
    }
    titlebarModel.handleItemPointerDown(event, WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID, titlebarSource)
  }

  return (
    // Why: Open in is two chrome buttons but one pin slot. The wrapper owns the
    // ButtonGroup L/R seams; inner buttons stay borderless so icon + caret read
    // as one control with no mid seam.
    <div
      data-workspace-titlebar-slot={titlebarIndex != null ? String(titlebarIndex) : undefined}
      className={cn(
        'relative flex h-full items-stretch border border-y-0 border-border dark:border-input',
        pinDraggable && 'cursor-grab active:cursor-grabbing',
        getDropIndicatorClasses(dropIndicator)
      )}
      // Why: bubble after the menu trigger records pointer type, then stop before
      // the surrounding tab-strip drag handler sees the press.
      onPointerDown={pinDraggable ? startPinDrag : undefined}
    >
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="outline-transparent"
                size="icon-titlebar-compact"
                className="text-muted-foreground border-0"
                aria-label={openLabel}
                onClick={() => openEntry(preferredEntry)}
              >
                {preferredEntry.target === 'file-manager' ? (
                  <FolderOpen />
                ) : (
                  <OpenInApplicationIcon
                    application={{ command: preferredEntry.command ?? '' }}
                    size={16}
                  />
                )}
              </Button>
            }
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {openLabel}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline-transparent"
                    size="icon-titlebar-compact"
                    className="text-muted-foreground border-0"
                    aria-label={chooseLabel}
                  >
                    <CaretDown />
                  </Button>
                }
              />
            }
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {chooseLabel}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="w-52">
          <WorktreeOpenInMenuContent
            worktreePath={worktree.path}
            connectionId={null}
            runtimeEnvironmentId={runtimeEnvironmentId}
            onEntryOpen={rememberEntry}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
