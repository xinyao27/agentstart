import type { TuiAgent } from '@yiru/protocol/agent/types'
import type React from 'react'
import { AgentIcon } from '~renderer/agent/catalog'
import { translate } from '~renderer/i18n/i18n'
import { DropdownMenuItem, DropdownMenuShortcut } from '~renderer/ui/dropdown-menu'

export type AgentLaunchMenuOption = {
  agent: TuiAgent
  label: string
}

export function AgentLaunchMenuItems({
  options,
  onLaunch,
  emptyLabel,
  shortcutAgent = null,
  shortcut = null
}: {
  options: readonly AgentLaunchMenuOption[]
  onLaunch: (agent: TuiAgent) => void
  emptyLabel: string
  shortcutAgent?: TuiAgent | null
  shortcut?: React.ReactNode
}): React.JSX.Element {
  if (options.length === 0) {
    return (
      <DropdownMenuItem
        disabled
        className="text-muted-foreground gap-2 px-2 py-1.5 text-[12px] leading-5"
      >
        {emptyLabel}
      </DropdownMenuItem>
    )
  }

  return (
    <>
      {options.map(({ agent, label }) => (
        <DropdownMenuItem
          key={agent}
          onClick={() => onLaunch(agent)}
          className="gap-2 px-2 py-1.5 text-[12px] leading-5 font-medium"
          title={translate(
            'auto.components.tab.bar.QuickLaunchButton.ec2adf093e',
            'Launch {{value0}} in a new terminal',
            { value0: label }
          )}
        >
          <AgentIcon agent={agent} size={14} />
          <span className="flex-1">{label}</span>
          {shortcut && shortcutAgent === agent ? (
            <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
          ) : null}
        </DropdownMenuItem>
      ))}
    </>
  )
}
