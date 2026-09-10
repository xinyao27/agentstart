import { WORKSPACE_TITLEBAR_COMMANDS_ACTION_ID } from '@agentstart/protocol/settings/panel-titlebar-pins'
import {
  getTerminalQuickCommandBody,
  getTerminalQuickCommandScope,
  isTerminalQuickCommandComplete
} from '@agentstart/protocol/terminal/quick-commands'
import type { TerminalQuickCommand } from '@agentstart/protocol/terminal/quick-commands'
import { getRepoIdFromWorktreeId } from '@agentstart/protocol/worktree/identity'
import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Pencil, Play, Trash as Trash2, Plus } from '~renderer/icons/hugeicons'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useAppStore } from '~renderer/store/state'
import { runQuickCommandInNewTab } from '~renderer/terminal-quick-commands/run-in-new-tab'
import {
  createTerminalQuickCommandDraft,
  TerminalQuickCommandDialog
} from '~renderer/terminal-quick-commands/terminal-quick-command-dialog'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '~renderer/ui/command'
import { useConfirmationDialog } from '~renderer/ui/confirmation-dialog'
import { DropdownMenuItem, DropdownMenuSeparator } from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { getDropIndicatorClasses } from '../workspace-panel/titlebar-drop-indicator'
import type { WorkspacePanelTitlebarModel } from '../workspace-panel/use-workspace-panel-titlebar-model'
import type { DropIndicator } from './drop-indicator'
import { useTabBarQuickCommandsShortcut } from './quick-commands-shortcut'

type TabBarQuickCommandsButtonProps = {
  worktreeId: string
  groupId: string
  presentation: 'menu-item' | 'titlebar-icon'
  moreMenuOpen?: boolean
  onMoreMenuOpenChange?: (open: boolean) => void
  separatorAfter?: boolean
  mergeNextSeam?: boolean
  titlebarModel?: WorkspacePanelTitlebarModel | null
  titlebarIndex?: number
  titlebarSource?: 'visible' | 'overflow'
  dropIndicator?: DropIndicator
}

export function TabBarQuickCommandsButton({
  worktreeId,
  groupId,
  presentation,
  moreMenuOpen = false,
  onMoreMenuOpenChange,
  separatorAfter = false,
  mergeNextSeam = false,
  titlebarModel = null,
  titlebarIndex,
  titlebarSource = 'visible',
  dropIndicator = null
}: TabBarQuickCommandsButtonProps): React.JSX.Element | null {
  const allCommands = useAppStore((state) => state.settings?.terminalQuickCommands)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const { repos } = useProjectCatalog()
  const confirm = useConfirmationDialog()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editor, setEditor] = useState<{
    mode: 'add' | 'edit'
    command: TerminalQuickCommand
  } | null>(null)
  // Why: the keybinding should open the command picker whether Command is pinned
  // on the strip or still living in More — toggling More alone is not enough.
  useTabBarQuickCommandsShortcut({
    enabled: true,
    menuOpen: pickerOpen,
    onOpenChange: setPickerOpen
  })
  const repoId = (() => {
    const candidate = getRepoIdFromWorktreeId(worktreeId)
    return repos.some((repo) => repo.id === candidate) ? candidate : null
  })()
  const { repoCommands, globalCommands } = (() => {
    const repoList: TerminalQuickCommand[] = []
    const globalList: TerminalQuickCommand[] = []
    for (const command of allCommands ?? []) {
      if (!isTerminalQuickCommandComplete(command)) {
        continue
      }
      const scope = getTerminalQuickCommandScope(command)
      if (scope.type === 'global') {
        globalList.push(command)
      } else if (scope.type === 'repo' && repoId !== null && scope.repoId === repoId) {
        repoList.push(command)
      }
    }
    return { repoCommands: repoList, globalCommands: globalList }
  })()
  const visibleCommands = (() => [...repoCommands, ...globalCommands])()

  if (!repoId) {
    return null
  }

  const openEditor = (mode: 'add' | 'edit', command: TerminalQuickCommand): void => {
    setPickerOpen(false)
    setEditor({ mode, command })
  }
  const addRepoCommand = (): void => {
    openEditor('add', createTerminalQuickCommandDraft({ type: 'repo', repoId }))
  }
  const saveCommand = (next: TerminalQuickCommand): void => {
    const current = useAppStore.getState().settings?.terminalQuickCommands ?? []
    const isEdit = current.some((command) => command.id === next.id)
    void updateSettings({
      terminalQuickCommands: isEdit
        ? current.map((command) => (command.id === next.id ? next : command))
        : [...current, next]
    })
  }
  const runCommand = (command: TerminalQuickCommand): void => {
    setPickerOpen(false)
    runQuickCommandInNewTab({ command, worktreeId, groupId })
  }
  const deleteCommand = async (command: TerminalQuickCommand): Promise<void> => {
    setPickerOpen(false)
    const confirmed = await confirm({
      title: translate(
        'auto.components.tab.bar.TabBarQuickCommandsButton.e8e1a52edb',
        'Delete "{{value0}}"?',
        { value0: command.label }
      ),
      description: translate(
        'auto.components.tab.bar.TabBarQuickCommandsButton.3220e2da27',
        'This quick command will be removed from your saved list.'
      ),
      confirmLabel: translate(
        'auto.components.tab.bar.TabBarQuickCommandsButton.be8f0ff166',
        'Delete'
      ),
      confirmVariant: 'destructive'
    })
    if (confirmed) {
      const current = useAppStore.getState().settings?.terminalQuickCommands ?? []
      void updateSettings({
        terminalQuickCommands: current.filter((candidate) => candidate.id !== command.id)
      })
    }
  }
  const hasCommands = visibleCommands.length > 0
  const commandLabel = translate(
    'auto.components.tab.bar.TabBarQuickCommandsButton.a2c7a33831',
    'Command'
  )
  const openPicker = (): void => {
    if (moreMenuOpen) {
      onMoreMenuOpenChange?.(false)
    }
    if (hasCommands) {
      setPickerOpen(true)
      return
    }
    addRepoCommand()
  }
  const pinDraggable = Boolean(titlebarModel)
  const startPinDrag = (event: React.PointerEvent): void => {
    if (!titlebarModel) {
      return
    }
    titlebarModel.handleItemPointerDown(
      event,
      WORKSPACE_TITLEBAR_COMMANDS_ACTION_ID,
      titlebarSource
    )
  }

  const dialogs = (
    <>
      <CommandDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={translate(
          'auto.components.tab.bar.TabBarQuickCommandsButton.b82e237a4b',
          'More quick commands'
        )}
        description={translate(
          'auto.components.tab.bar.TabBarQuickCommandsButton.f3a8c2d1e7',
          'Search quick commands...'
        )}
        commandProps={{ loop: true }}
      >
        <CommandInput
          autoFocus
          placeholder={translate(
            'auto.components.tab.bar.TabBarQuickCommandsButton.f3a8c2d1e7',
            'Search quick commands...'
          )}
        />
        <CommandList>
          <CommandEmpty>
            {translate(
              'auto.components.tab.bar.TabBarQuickCommandsButton.b4e7f9a2c1',
              'No commands match'
            )}
          </CommandEmpty>
          <CommandGroup heading={commandLabel}>
            {visibleCommands.map((command) => (
              <CommandItem
                key={`run:${command.id}`}
                value={`run:${command.id}:${command.label}`}
                keywords={[command.label, getTerminalQuickCommandBody(command)]}
                onSelect={() => runCommand(command)}
              >
                <Play className="size-4" />
                <span className="truncate">{command.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup
            heading={translate(
              'auto.components.settings.QuickCommandsPane.f91b649324',
              'Saved Commands'
            )}
          >
            <CommandItem value="manage:add-command" onSelect={addRepoCommand}>
              <Plus className="size-4" />
              {translate('auto.components.settings.QuickCommandsPane.5aacc8f7dc', 'Add Command')}
            </CommandItem>
            {visibleCommands.map((command) => (
              <CommandItem
                key={`edit:${command.id}`}
                value={`edit:${command.id}:${command.label}`}
                keywords={[command.label, getTerminalQuickCommandBody(command)]}
                onSelect={() => openEditor('edit', command)}
              >
                <Pencil className="size-4" />
                {translate(
                  'auto.components.tab.bar.TabBarQuickCommandsButton.15529ede69',
                  'Edit {{value0}}',
                  { value0: command.label }
                )}
              </CommandItem>
            ))}
            {visibleCommands.map((command) => (
              <CommandItem
                key={`delete:${command.id}`}
                value={`delete:${command.id}:${command.label}`}
                keywords={[command.label, getTerminalQuickCommandBody(command)]}
                onSelect={() => void deleteCommand(command)}
              >
                <Trash2 className="size-4" />
                {translate(
                  'auto.components.tab.bar.TabBarQuickCommandsButton.196593b6a9',
                  'Remove {{value0}}',
                  { value0: command.label }
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <TerminalQuickCommandDialog
        open={editor !== null}
        mode={editor?.mode ?? 'add'}
        command={editor?.command ?? createTerminalQuickCommandDraft({ type: 'repo', repoId })}
        repos={repos}
        onOpenChange={(open) => !open && setEditor(null)}
        onSave={saveCommand}
      />
    </>
  )

  if (presentation === 'titlebar-icon') {
    return (
      <>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="titlebar-segment"
                size="icon-titlebar-wide"
                seam={mergeNextSeam ? 'merge-next' : 'default'}
                data-workspace-titlebar-slot={
                  titlebarIndex != null ? String(titlebarIndex) : undefined
                }
                className={cn(
                  'relative',
                  pinDraggable && 'cursor-grab active:cursor-grabbing',
                  getDropIndicatorClasses(dropIndicator)
                )}
                aria-label={commandLabel}
                onClick={openPicker}
                onPointerDown={pinDraggable ? startPinDrag : undefined}
              >
                <Play className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {commandLabel}
          </TooltipContent>
        </Tooltip>
        {dialogs}
      </>
    )
  }

  return (
    <>
      <DropdownMenuItem
        // Why: start the pointer drag before the menu row steals the gesture.
        onPointerDown={(event) => {
          event.stopPropagation()
          startPinDrag(event)
        }}
        onClick={openPicker}
        className={cn(pinDraggable && 'cursor-grab active:cursor-grabbing')}
      >
        <Play className="size-4" />
        {commandLabel}
      </DropdownMenuItem>
      {separatorAfter ? <DropdownMenuSeparator /> : null}
      {dialogs}
    </>
  )
}
