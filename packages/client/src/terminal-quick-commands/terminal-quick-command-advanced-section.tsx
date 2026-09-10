import type { Repo } from '@agentstart/protocol/project/repository'
import type { getTerminalQuickCommandScope } from '@agentstart/protocol/terminal/quick-commands'
import { isTerminalAgentQuickCommand } from '@agentstart/protocol/terminal/quick-commands'
import type { TerminalQuickCommand } from '@agentstart/protocol/terminal/quick-commands'
import type { Dispatch, SetStateAction } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CaretDown as ChevronDown } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import { TerminalQuickCommandAppendEnterSwitch } from './terminal-quick-command-append-enter-switch'
import { TerminalQuickCommandScopeField } from './terminal-quick-command-scope-field'

type TerminalQuickCommandAdvancedSectionProps = {
  draft: TerminalQuickCommand
  repos: Pick<Repo, 'id' | 'displayName' | 'path' | 'badgeColor'>[]
  advancedOpen: boolean
  selectedScope: ReturnType<typeof getTerminalQuickCommandScope>
  selectedRepoId: string
  selectedRepoMissing: boolean
  lastRepoScopeId: string | null
  rememberRepoScopeId: (repoId: string) => void
  setAdvancedOpen: Dispatch<SetStateAction<boolean>>
  setDraft: Dispatch<SetStateAction<TerminalQuickCommand>>
  toggleAppendEnter: () => void
}

export function TerminalQuickCommandAdvancedSection({
  draft,
  repos,
  advancedOpen,
  selectedScope,
  selectedRepoId,
  selectedRepoMissing,
  lastRepoScopeId,
  rememberRepoScopeId,
  setAdvancedOpen,
  setDraft,
  toggleAppendEnter
}: TerminalQuickCommandAdvancedSectionProps): React.JSX.Element {
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setAdvancedOpen((current) => !current)}
        className="-ml-2 text-xs"
      >
        {translate(
          'auto.components.terminal.quick.commands.TerminalQuickCommandDialog.925b8e0f6e',
          'Advanced'
        )}
        <ChevronDown className={cn('size-4 transition-transform', advancedOpen && 'rotate-180')} />
      </Button>

      <div
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out',
          advancedOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
        aria-hidden={!advancedOpen}
      >
        <div className="min-h-0">
          <div
            className={cn(
              'space-y-4 px-1 pt-1 pb-1 transition-[opacity,transform] duration-150 ease-out',
              advancedOpen
                ? 'translate-y-0 opacity-100 delay-200'
                : '-translate-y-1 opacity-0 delay-0'
            )}
          >
            {!isTerminalAgentQuickCommand(draft) ? (
              <TerminalQuickCommandAppendEnterSwitch
                appendEnter={draft.appendEnter}
                onToggle={toggleAppendEnter}
              />
            ) : null}
            <TerminalQuickCommandScopeField
              repos={repos}
              selectedScope={selectedScope}
              selectedRepoId={selectedRepoId}
              selectedRepoMissing={selectedRepoMissing}
              lastRepoScopeId={lastRepoScopeId}
              rememberRepoScopeId={rememberRepoScopeId}
              setDraft={setDraft}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
