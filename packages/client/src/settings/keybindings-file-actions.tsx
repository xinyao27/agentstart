import React from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import {
  Code as Code2,
  FileText,
  FolderOpen,
  CaretDown as ChevronDown,
  ArrowSquareOut as ExternalLink,
  ArrowClockwise as RefreshCw
} from '~renderer/icons/hugeicons'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'

import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'

function openFailureMessage(reason: string): string {
  switch (reason) {
    case 'not-absolute':
      return 'Keybindings path is not absolute.'
    case 'not-found':
      return 'Keybindings file was not found.'
    case 'launch-failed':
      return 'Could not launch that editor.'
    default:
      return 'Could not open keybindings file.'
  }
}

export function KeybindingsFileActions(): React.JSX.Element {
  const keybindingSnapshot = useAppStore((state) => state.keybindingSnapshot)
  const ensureKeybindingsFile = useAppStore((state) => state.ensureKeybindingsFile)
  const openKeybindingsFile = useAppStore((state) => state.openKeybindingsFile)
  const revealKeybindingsFile = useAppStore((state) => state.revealKeybindingsFile)
  const reloadKeybindings = useAppStore((state) => state.reloadKeybindings)

  const prepareKeybindingsPath = async (): Promise<string | null> => {
    const snapshot = await ensureKeybindingsFile()
    return snapshot?.path ?? keybindingSnapshot?.path ?? null
  }

  const openKeybindingsInExternalEditor = async (command: 'code' | 'cursor'): Promise<void> => {
    try {
      const filePath = await prepareKeybindingsPath()
      if (!filePath) {
        toast.error(
          translate(
            'auto.components.settings.KeybindingsFileActions.cdf794f46d',
            'Keybindings file is not available.'
          )
        )
        return
      }
      const result = await shellClient.shell.openInExternalEditor(filePath, command)
      if (!result.ok) {
        toast.error(openFailureMessage(result.reason))
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.settings.KeybindingsFileActions.c5886a31cc',
              'Failed to open external editor.'
            )
      )
    }
  }

  return (
    <div className="border-border bg-background inline-flex shrink-0 overflow-hidden rounded-md border">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="border-0"
        onClick={() => void openKeybindingsFile()}
      >
        <FileText className="size-3" />
        {translate('auto.components.settings.KeybindingsFileActions.1c2be2b2c6', 'Open File')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="border-border border-l"
              aria-label={translate(
                'auto.components.settings.KeybindingsFileActions.400397a10d',
                'Open keybindings file menu'
              )}
            >
              <ChevronDown className="size-3" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void openKeybindingsFile()}>
            <ExternalLink className="size-3.5" />
            {translate(
              'auto.components.settings.KeybindingsFileActions.98f1a23e1c',
              'Open with Default App'
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void openKeybindingsInExternalEditor('code')}>
            <Code2 className="size-3.5" />
            {translate(
              'auto.components.settings.KeybindingsFileActions.1637f64033',
              'Open in VS Code'
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void openKeybindingsInExternalEditor('cursor')}>
            <Code2 className="size-3.5" />
            {translate(
              'auto.components.settings.KeybindingsFileActions.9e24c0e858',
              'Open in Cursor'
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void revealKeybindingsFile()}>
            <FolderOpen className="size-3.5" />
            {translate(
              'auto.components.settings.KeybindingsFileActions.a8a8d6b9d3',
              'Reveal in File Manager'
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void reloadKeybindings()}>
            <RefreshCw className="size-3.5" />
            {translate(
              'auto.components.settings.KeybindingsFileActions.abc49853fb',
              'Reload from Disk'
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
