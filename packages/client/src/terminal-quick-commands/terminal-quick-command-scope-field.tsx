import type { Repo } from '@agentstart/protocol/project/repository'
import type {
  TerminalQuickCommand,
  TerminalQuickCommandScope
} from '@agentstart/protocol/terminal/quick-commands'
import type { Dispatch, SetStateAction } from 'react'
import { translate } from '~renderer/i18n/i18n'
import RepoBadgeLabel from '~renderer/repo/badge-label'
import { Label } from '~renderer/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~renderer/ui/select'
import { ToggleGroup, ToggleGroupItem } from '~renderer/ui/toggle-group'

import { QUICK_COMMAND_TOGGLE_ITEM_CLASS } from './terminal-quick-command-toggle-style'

type TerminalQuickCommandScopeFieldProps = {
  repos: Pick<Repo, 'id' | 'displayName' | 'path' | 'badgeColor'>[]
  selectedScope: TerminalQuickCommandScope
  selectedRepoId: string
  selectedRepoMissing: boolean
  lastRepoScopeId: string | null
  rememberRepoScopeId: (repoId: string) => void
  setDraft: Dispatch<SetStateAction<TerminalQuickCommand>>
}

function getRepoLabel(repo: Pick<Repo, 'displayName' | 'path'>): string {
  return repo.displayName || repo.path
}

function getQuickCommandProjectScopeRepoId(
  repos: Pick<Repo, 'id'>[],
  lastRepoScopeId: string | null
): string | null {
  return lastRepoScopeId ?? repos[0]?.id ?? null
}

export function TerminalQuickCommandScopeField({
  repos,
  selectedScope,
  selectedRepoId,
  selectedRepoMissing,
  lastRepoScopeId,
  rememberRepoScopeId,
  setDraft
}: TerminalQuickCommandScopeFieldProps): React.JSX.Element {
  return (
    <div className="space-y-2">
      <Label>
        {translate(
          'auto.components.terminal.quick.commands.TerminalQuickCommandScopeField.c25cf350ef',
          'Scope'
        )}
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          value={[selectedScope.type]}
          onValueChange={(value) => {
            // Base UI ToggleGroup values are always arrays; single mode holds one.
            const next = value[0]
            if (next === 'global') {
              setDraft((current) => ({ ...current, scope: { type: 'global' } }))
            }
            if (next === 'repo' && selectedScope.type !== 'repo') {
              const repoId = getQuickCommandProjectScopeRepoId(repos, lastRepoScopeId)
              if (!repoId) {
                return
              }
              // Why: toggling Global should not discard the command's project
              // and silently move it to whichever repo is first in the list.
              rememberRepoScopeId(repoId)
              setDraft((current) => ({
                ...current,
                scope: { type: 'repo', repoId }
              }))
            }
          }}
          className="justify-start"
          variant="outline"
        >
          <ToggleGroupItem value="global" className={QUICK_COMMAND_TOGGLE_ITEM_CLASS}>
            {translate(
              'auto.components.terminal.quick.commands.TerminalQuickCommandScopeField.b83efc79e2',
              'Global'
            )}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="repo"
            disabled={repos.length === 0}
            className={QUICK_COMMAND_TOGGLE_ITEM_CLASS}
          >
            {translate(
              'auto.components.terminal.quick.commands.TerminalQuickCommandScopeField.3834d24243',
              'Project'
            )}
          </ToggleGroupItem>
        </ToggleGroup>
        {selectedScope.type === 'repo' && repos.length > 0 ? (
          <div className="space-y-1">
            <Select
              value={selectedRepoId}
              onValueChange={(repoId) => {
                if (!repoId) {
                  return
                }
                rememberRepoScopeId(repoId)
                setDraft((current) => ({ ...current, scope: { type: 'repo', repoId } }))
              }}
            >
              <SelectTrigger size="sm" className="min-w-48">
                <SelectValue
                  placeholder={
                    selectedRepoMissing
                      ? translate(
                          'auto.components.terminal.quick.commands.TerminalQuickCommandScopeField.2264edd5d3',
                          'Project not in list'
                        )
                      : translate(
                          'auto.components.terminal.quick.commands.TerminalQuickCommandScopeField.2496523a6f',
                          'Choose project'
                        )
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {repos.map((repo) => (
                  <SelectItem key={repo.id} value={repo.id}>
                    <RepoBadgeLabel
                      name={getRepoLabel(repo)}
                      color={repo.badgeColor}
                      className="max-w-full"
                    />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRepoMissing ? (
              <p className="text-muted-foreground max-w-48 text-xs">
                {translate(
                  'auto.components.terminal.quick.commands.TerminalQuickCommandScopeField.2db6edede7',
                  'Saving keeps the existing project scope unless you choose another.'
                )}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
