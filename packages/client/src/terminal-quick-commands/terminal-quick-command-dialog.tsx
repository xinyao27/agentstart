import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { Repo } from '@yiru/protocol/project/repository'
import {
  getTerminalQuickCommandAction,
  getTerminalQuickCommandScope,
  isTerminalAgentQuickCommand,
  supportsTerminalAgentQuickCommand
} from '@yiru/protocol/terminal/quick-commands'
import type {
  TerminalQuickCommand,
  TerminalQuickCommandScope
} from '@yiru/protocol/terminal/quick-commands'
import { useRef, useState } from 'react'
import { getAgentCatalog } from '~renderer/agent/catalog'
import { createBrowserUuid } from '~renderer/browser/uuid'
import { translate } from '~renderer/i18n/i18n'
import {
  getScreenSubmitShortcutLabel,
  isScreenSubmitShortcut
} from '~renderer/keyboard-input/screen-submit-shortcut'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'
import { Label } from '~renderer/ui/label'

import { TerminalQuickCommandActionToggle } from './terminal-quick-command-action-toggle'
import { TerminalQuickCommandAdvancedSection } from './terminal-quick-command-advanced-section'
import { TerminalQuickCommandContentSection } from './terminal-quick-command-content-section'
import {
  createTerminalQuickCommandDialogDraftMemory,
  switchTerminalQuickCommandDialogAction
} from './terminal-quick-command-dialog-draft'
import { TerminalQuickCommandDialogFooter } from './terminal-quick-command-dialog-footer'
import { TerminalQuickCommandLabelField } from './terminal-quick-command-label-field'

type TerminalQuickCommandDialogMode = 'add' | 'edit'

type TerminalQuickCommandDialogProps = {
  open: boolean
  mode: TerminalQuickCommandDialogMode
  command: TerminalQuickCommand
  repos?: Pick<Repo, 'id' | 'displayName' | 'path' | 'badgeColor'>[]
  onOpenChange: (open: boolean) => void
  onSave: (command: TerminalQuickCommand) => void
}

const EMPTY_REPOS: Pick<Repo, 'id' | 'displayName' | 'path' | 'badgeColor'>[] = []

export function createTerminalQuickCommandDraft(
  scope: TerminalQuickCommandScope = { type: 'global' }
): TerminalQuickCommand {
  return {
    id: `quick-command-${createBrowserUuid()}`,
    label: '',
    command: '',
    appendEnter: true,
    scope
  }
}

export function TerminalQuickCommandDialog(
  props: TerminalQuickCommandDialogProps
): React.JSX.Element {
  const { command, onOpenChange, open } = props
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <TerminalQuickCommandDialogForm key={JSON.stringify(command)} {...props} /> : null}
    </Dialog>
  )
}

function TerminalQuickCommandDialogForm({
  mode,
  command,
  repos = EMPTY_REPOS,
  onOpenChange,
  onSave
}: TerminalQuickCommandDialogProps): React.JSX.Element {
  const fallbackAgent: TuiAgent =
    getAgentCatalog().find((entry) => supportsTerminalAgentQuickCommand(entry.id))?.id ?? 'claude'
  const [draft, setDraft] = useState<TerminalQuickCommand>(command)
  const draftMemoryRef = useRef(createTerminalQuickCommandDialogDraftMemory(command, fallbackAgent))
  const initialScope = getTerminalQuickCommandScope(command)
  const [lastRepoScopeId, setLastRepoScopeId] = useState<string | null>(
    initialScope.type === 'repo' ? initialScope.repoId : null
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const selectedAction = getTerminalQuickCommandAction(draft)
  const selectedScope = getTerminalQuickCommandScope(draft)
  const isAgentAction = isTerminalAgentQuickCommand(draft)
  const selectedRepo =
    selectedScope.type === 'repo'
      ? (repos.find((repo) => repo.id === selectedScope.repoId) ?? null)
      : null
  const selectedRepoId = selectedRepo?.id ?? ''
  const selectedRepoMissing = selectedScope.type === 'repo' && selectedRepo === null

  const selectedAgent =
    isAgentAction && supportsTerminalAgentQuickCommand(draft.agent) ? draft.agent : fallbackAgent

  const setAction = (action: 'terminal-command' | 'agent-prompt'): void => {
    setDraft((current) => {
      const next = switchTerminalQuickCommandDialogAction(current, action, draftMemoryRef.current)
      draftMemoryRef.current = next.memory
      return next.draft
    })
  }

  const toggleAppendEnter = (): void => {
    setDraft((current) =>
      isTerminalAgentQuickCommand(current)
        ? current
        : (() => {
            const appendEnter = !current.appendEnter
            draftMemoryRef.current = {
              ...draftMemoryRef.current,
              terminalAppendEnter: appendEnter
            }
            return { ...current, appendEnter }
          })()
    )
  }

  const saveDraft = (): void => {
    const next: TerminalQuickCommand = isTerminalAgentQuickCommand(draft)
      ? {
          id: draft.id,
          label: draft.label.trim(),
          action: 'agent-prompt',
          agent: draft.agent,
          prompt: draft.prompt.trimEnd(),
          scope: selectedScope
        }
      : {
          id: draft.id,
          label: draft.label.trim(),
          action: 'terminal-command',
          command: draft.command.trimEnd(),
          appendEnter: draft.appendEnter,
          scope: selectedScope
        }
    if (
      !next.label ||
      (isTerminalAgentQuickCommand(next)
        ? !next.prompt.trim() || !supportsTerminalAgentQuickCommand(next.agent)
        : !next.command.trim())
    ) {
      return
    }
    onSave(next)
    onOpenChange(false)
  }

  const canSave =
    draft.label.trim().length > 0 &&
    (isAgentAction
      ? draft.prompt.trimEnd().length > 0 && supportsTerminalAgentQuickCommand(draft.agent)
      : draft.command.trimEnd().length > 0)
  const submitShortcutLabel = getScreenSubmitShortcutLabel()

  return (
    <DialogContent className="max-w-md sm:max-w-md" showCloseButton={false}>
      <DialogHeader>
        <DialogTitle className="text-sm">
          {mode === 'edit'
            ? translate(
                'auto.components.terminal.quick.commands.TerminalQuickCommandDialog.f9b184fc16',
                'Edit Quick Command'
              )
            : translate(
                'auto.components.terminal.quick.commands.TerminalQuickCommandDialog.5b3f634a55',
                'Add Quick Command'
              )}
        </DialogTitle>
        <DialogDescription className="text-xs">
          {translate(
            'auto.components.terminal.quick.commands.TerminalQuickCommandDialog.ed04233b3e',
            'Save terminal commands or agent prompts for quick access.'
          )}
        </DialogDescription>
      </DialogHeader>

      <div
        className="space-y-4"
        onKeyDown={(event) => {
          if (isScreenSubmitShortcut(event) && canSave) {
            event.preventDefault()
            saveDraft()
          }
        }}
      >
        <TerminalQuickCommandLabelField label={draft.label} setDraft={setDraft} />

        <div className="space-y-2">
          <Label>
            {translate(
              'auto.components.terminal.quick.commands.TerminalQuickCommandDialog.ec8f081919',
              'Action'
            )}
          </Label>
          <TerminalQuickCommandActionToggle
            selectedAction={selectedAction}
            onActionChange={setAction}
          />
        </div>

        <TerminalQuickCommandContentSection
          draft={draft}
          isAgentAction={isAgentAction}
          selectedAgent={selectedAgent}
          draftMemoryRef={draftMemoryRef}
          setDraft={setDraft}
        />

        <TerminalQuickCommandAdvancedSection
          draft={draft}
          repos={repos}
          advancedOpen={advancedOpen}
          selectedScope={selectedScope}
          selectedRepoId={selectedRepoId}
          selectedRepoMissing={selectedRepoMissing}
          lastRepoScopeId={lastRepoScopeId}
          rememberRepoScopeId={setLastRepoScopeId}
          setAdvancedOpen={setAdvancedOpen}
          setDraft={setDraft}
          toggleAppendEnter={toggleAppendEnter}
        />
      </div>

      <TerminalQuickCommandDialogFooter
        canSave={canSave}
        submitShortcutLabel={submitShortcutLabel}
        onCancel={() => onOpenChange(false)}
        onSave={saveDraft}
      />
    </DialogContent>
  )
}
