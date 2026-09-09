import type { TuiAgent } from '@yiru/protocol/agent/types'
import {
  isTerminalAgentQuickCommand,
  supportsTerminalAgentQuickCommand
} from '@yiru/protocol/terminal/quick-commands'
import type { TerminalQuickCommand } from '@yiru/protocol/terminal/quick-commands'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { AgentIcon } from '~renderer/agent/catalog'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/ui/class-names'
import { Label } from '~renderer/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~renderer/ui/select'
import { Textarea } from '~renderer/ui/textarea'

import { getTerminalQuickCommandAgentOptions } from './terminal-quick-command-agent-options'
import type { TerminalQuickCommandDialogDraftMemory } from './terminal-quick-command-dialog-draft'

const QUICK_COMMAND_AGENT_OPTIONS = getTerminalQuickCommandAgentOptions()

type TerminalQuickCommandContentSectionProps = {
  draft: TerminalQuickCommand
  isAgentAction: boolean
  selectedAgent: TuiAgent
  draftMemoryRef: MutableRefObject<TerminalQuickCommandDialogDraftMemory>
  setDraft: Dispatch<SetStateAction<TerminalQuickCommand>>
}

export function TerminalQuickCommandContentSection({
  draft,
  isAgentAction,
  selectedAgent,
  draftMemoryRef,
  setDraft
}: TerminalQuickCommandContentSectionProps): React.JSX.Element {
  return (
    <div>
      {/* Why: action changes add/remove agent-only fields; animating rows here
          keeps the fixed dialog from snapping between content heights. */}
      <div
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out',
          isAgentAction ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
        aria-hidden={!isAgentAction}
      >
        <div className="min-h-0">
          <div
            className={cn(
              'space-y-2 px-1 pt-1 pb-4 transition-[opacity,transform] duration-150 ease-out',
              isAgentAction
                ? 'translate-y-0 opacity-100 delay-200'
                : '-translate-y-1 opacity-0 delay-0'
            )}
          >
            <Label>
              {translate(
                'auto.components.terminal.quick.commands.TerminalQuickCommandDialog.0adba8fa0c',
                'Agent'
              )}
            </Label>
            <Select
              value={selectedAgent}
              disabled={!isAgentAction}
              onValueChange={(agent) => {
                const nextAgent = agent as TuiAgent
                draftMemoryRef.current = {
                  ...draftMemoryRef.current,
                  agent: nextAgent
                }
                setDraft((current) =>
                  isTerminalAgentQuickCommand(current) ? { ...current, agent: nextAgent } : current
                )
              }}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={translate(
                    'auto.components.terminal.quick.commands.TerminalQuickCommandDialog.346d409ab2',
                    'Choose agent'
                  )}
                />
              </SelectTrigger>
              <SelectContent
                alignItemWithTrigger={false}
                align="start"
                sideOffset={4}
                className="max-h-[min(20rem,var(--radix-select-content-available-height))] w-[--radix-select-trigger-width]"
              >
                {QUICK_COMMAND_AGENT_OPTIONS.map((entry) => {
                  const supported = supportsTerminalAgentQuickCommand(entry.id)
                  return (
                    <SelectItem key={entry.id} value={entry.id} disabled={!supported}>
                      <span className="flex min-w-0 items-center gap-2">
                        <AgentIcon agent={entry.id} size={16} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{entry.label}</span>
                          {!supported ? (
                            <span className="text-muted-foreground truncate text-xs">
                              {translate(
                                'auto.components.terminal.quick.commands.TerminalQuickCommandDialog.026cfb232a',
                                'Does not support prompt commands'
                              )}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>
          {isAgentAction
            ? translate(
                'auto.components.terminal.quick.commands.TerminalQuickCommandDialog.dc921c17ee',
                'Prompt'
              )
            : translate(
                'auto.components.terminal.quick.commands.TerminalQuickCommandDialog.ca414324ee',
                'Command Text'
              )}
        </Label>
        <Textarea
          value={isTerminalAgentQuickCommand(draft) ? draft.prompt : draft.command}
          onChange={(event) => {
            const text = event.target.value
            draftMemoryRef.current = isAgentAction
              ? {
                  ...draftMemoryRef.current,
                  agentPrompt: text
                }
              : {
                  ...draftMemoryRef.current,
                  terminalCommand: text
                }
            setDraft((current) =>
              isTerminalAgentQuickCommand(current)
                ? { ...current, prompt: text }
                : { ...current, command: text }
            )
          }}
          placeholder={
            isAgentAction
              ? translate(
                  'auto.components.terminal.quick.commands.TerminalQuickCommandDialog.577a342c7d',
                  'Ask the agent to investigate this workspace'
                )
              : translate(
                  'auto.components.terminal.quick.commands.TerminalQuickCommandDialog.79af0c0841',
                  'npm run dev'
                )
          }
          rows={4}
          className={cn(
            'min-h-24 w-full resize-y border border-input bg-transparent px-3 py-2 text-sm outline-none transition-[color] focus-visible:border-ring',
            !isAgentAction && 'font-mono'
          )}
        />
      </div>

      <div
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out',
          isAgentAction ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
        aria-hidden={!isAgentAction}
      >
        <div className="min-h-0">
          <p
            className={cn(
              'px-1 pt-2 text-xs text-muted-foreground transition-[opacity,transform] duration-150 ease-out',
              isAgentAction
                ? 'translate-y-0 opacity-100 delay-200'
                : '-translate-y-1 opacity-0 delay-0'
            )}
          >
            {translate(
              'auto.components.terminal.quick.commands.TerminalQuickCommandDialog.e604bd40d6',
              'Supports skills, file paths, and built-in commands like'
            )}{' '}
            <code className="bg-muted px-1 font-mono text-[11px]">
              {translate(
                'auto.components.terminal.quick.commands.TerminalQuickCommandDialog.97e96cc027',
                '/goal'
              )}
            </code>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
