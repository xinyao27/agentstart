import type { Editor } from '@tiptap/react'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { MagnifyingGlass as Search } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Input } from '~renderer/ui/input'

import { runSlashCommand } from './slash-commands'
import type { SlashCommand, SlashMenuState } from './slash-commands'

type RichMarkdownSlashMenuProps = {
  editor: Editor | null
  slashMenu: SlashMenuState
  filteredCommands: SlashCommand[]
  selectedIndex: number
  onImagePick: () => void
  onEmojiPick: () => void
}

export function RichMarkdownSlashMenu({
  editor,
  slashMenu,
  filteredCommands,
  selectedIndex,
  onImagePick,
  onEmojiPick
}: RichMarkdownSlashMenuProps): React.JSX.Element {
  let currentGroup: SlashCommand['group'] | null = null

  return (
    <div
      className="bg-popover text-popover-foreground absolute z-30 flex max-h-[min(440px,calc(100vh-120px))] w-[min(300px,calc(100%-24px))] flex-col overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--border)_76%,transparent)]"
      style={{ left: slashMenu.left, top: slashMenu.top }}
      role="dialog"
      aria-label={translate(
        'auto.components.editor.RichMarkdownSlashMenu.2e0400b958',
        'Slash commands'
      )}
    >
      <div
        className="text-muted-foreground focus-within:bg-accent flex min-h-[38px] shrink-0 items-center gap-2 border-b border-[color-mix(in_srgb,var(--border)_76%,transparent)] px-2.5"
        onMouseDown={(event) => event.preventDefault()}
      >
        <Search className="size-3.5" />
        <Input
          aria-label={translate(
            'auto.components.editor.RichMarkdownSlashMenu.550189b06c',
            'Search blocks'
          )}
          readOnly
          type="text"
          value={slashMenu.query}
          placeholder={translate(
            'auto.components.editor.RichMarkdownSlashMenu.dbdd2ad15f',
            'Search blocks...'
          )}
          variant="chrome-free"
          className="text-popover-foreground placeholder:text-muted-foreground text-[13px] leading-5"
        />
      </div>
      <div className="scrollbar-sleek min-h-0 overflow-y-auto" role="listbox">
        {filteredCommands.length === 0 ? (
          <div className="text-muted-foreground px-3 py-[18px] text-center text-sm">
            {translate(
              'auto.components.editor.RichMarkdownSlashMenu.82c6816ff8',
              'No blocks found'
            )}
          </div>
        ) : (
          filteredCommands.map((command, index) => {
            const showGroup = command.group !== currentGroup
            currentGroup = command.group
            return (
              <React.Fragment key={command.id}>
                {showGroup ? (
                  <div className="text-muted-foreground px-3 pt-[9px] pb-1 text-[11px] leading-none font-medium">
                    {command.group}
                  </div>
                ) : null}
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  title={command.description}
                  role="option"
                  aria-selected={index === selectedIndex}
                  className={cn(
                    'h-auto min-h-[34px] w-full justify-start gap-[9px] border-0 px-3 py-[5px] text-left font-normal whitespace-normal text-inherit hover:bg-accent focus-visible:bg-accent',
                    index === selectedIndex && 'bg-accent'
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    editor && runSlashCommand(editor, slashMenu, command, onImagePick, onEmojiPick)
                  }
                >
                  <span className="text-muted-foreground inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]">
                    {command.icon.kind === 'component' ? (
                      <command.icon.component className="size-3.5" />
                    ) : (
                      <span className="text-sm leading-none">{command.icon.value}</span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col items-start">
                    <span className="truncate text-[13px] leading-5 font-medium">
                      {command.label}
                    </span>
                  </span>
                </Button>
              </React.Fragment>
            )
          })
        )}
      </div>
    </div>
  )
}
