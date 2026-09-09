import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { getTerminalQuickCommandScope } from '@yiru/protocol/terminal/quick-commands'
import type { TerminalQuickCommand } from '@yiru/protocol/terminal/quick-commands'
import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Plus } from '~renderer/icons/hugeicons'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useAppStore } from '~renderer/store/state'
import {
  createTerminalQuickCommandDraft,
  TerminalQuickCommandDialog
} from '~renderer/terminal-quick-commands/terminal-quick-command-dialog'
import { useConfirmationDialog } from '~renderer/ui/confirmation-dialog'

import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { QuickCommandsList } from './quick-commands-list'
import { GLOBAL_SCOPE_KEY, QuickCommandsScopeFilter } from './quick-commands-scope-filter'
import { getSettingOwnershipSummary } from './setting-ownership'

type QuickCommandsPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  addCommandIntentSignal?: number
}

type EditorState =
  | {
      mode: 'add'
      command: TerminalQuickCommand
    }
  | {
      mode: 'edit'
      command: TerminalQuickCommand
    }
  | null

export function shouldOpenQuickCommandAddIntent(
  addCommandIntentSignal: number | undefined,
  consumedAddIntentSignal: number
): boolean {
  return Boolean(addCommandIntentSignal && consumedAddIntentSignal !== addCommandIntentSignal)
}

export function QuickCommandsPane({
  settings,
  updateSettings,
  addCommandIntentSignal
}: QuickCommandsPaneProps): React.JSX.Element {
  const { repos } = useProjectCatalog()
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const commands = settings.terminalQuickCommands ?? []
  const ownership = getSettingOwnershipSummary('terminalQuickCommands')
  const confirm = useConfirmationDialog()

  const [editor, setEditor] = useState<EditorState>(null)
  const [consumedAddIntentSignal, setConsumedAddIntentSignal] = useState(0)
  // Why: `null` means "show all" (sticky-all), independent of the current repo
  // list — mirrors the repository combobox so newly added repos appear
  // automatically rather than being silently excluded.
  const [scopeSelection, setScopeSelection] = useState<ReadonlySet<string> | null>(null)
  const [scopePopoverOpen, setScopePopoverOpen] = useState(false)

  const repoById = (() => new Map(repos.map((repo) => [repo.id, repo])))()

  const allScopeKeys = (() => new Set<string>([GLOBAL_SCOPE_KEY, ...repos.map((r) => r.id)]))()
  const effectiveSelection: ReadonlySet<string> = scopeSelection ?? allScopeKeys
  const showAll = scopeSelection === null

  const visibleCommands = commands.filter((command) => {
    const scope = getTerminalQuickCommandScope(command)
    if (showAll) {
      return true
    }
    if (scope.type === 'global') {
      return effectiveSelection.has(GLOBAL_SCOPE_KEY)
    }
    return effectiveSelection.has(scope.repoId)
  })

  const createDraftForCurrentFilter = (): TerminalQuickCommand => {
    // Why: when the user has narrowed to a single repo scope, the natural
    // intent for "Add Command" is to create one in that repo. When the filter
    // is narrowed to Global-only, honor that. Otherwise prefer the active
    // workspace repo; fall back to global when there's no active repo.
    if (!showAll) {
      const selectedRepoIds = [...effectiveSelection].filter((key) => key !== GLOBAL_SCOPE_KEY)
      if (selectedRepoIds.length === 1 && !effectiveSelection.has(GLOBAL_SCOPE_KEY)) {
        return createTerminalQuickCommandDraft({ type: 'repo', repoId: selectedRepoIds[0] })
      }
      if (selectedRepoIds.length === 0 && effectiveSelection.has(GLOBAL_SCOPE_KEY)) {
        return createTerminalQuickCommandDraft({ type: 'global' })
      }
    }
    if (activeRepoId && repoById.has(activeRepoId)) {
      return createTerminalQuickCommandDraft({ type: 'repo', repoId: activeRepoId })
    }
    return createTerminalQuickCommandDraft({ type: 'global' })
  }

  const intentSignal = addCommandIntentSignal
  if (
    typeof intentSignal === 'number' &&
    shouldOpenQuickCommandAddIntent(intentSignal, consumedAddIntentSignal)
  ) {
    // Why: Settings deep-links use this one-shot signal to open the add dialog;
    // consume it before paint so the pane never flashes without the editor.
    setConsumedAddIntentSignal(intentSignal)
    setEditor({ mode: 'add', command: createDraftForCurrentFilter() })
  }

  const toggleScope = (key: string): void => {
    const current = new Set(effectiveSelection)
    if (current.has(key)) {
      // Why: forbid the empty selection — every command would disappear and
      // there'd be no signal that the filter caused it.
      if (current.size <= 1) {
        return
      }
      current.delete(key)
    } else {
      current.add(key)
    }
    setScopeSelection(current.size === allScopeKeys.size ? null : current)
  }

  const handleSelectAll = (): void => {
    if (showAll) {
      // Why: repository filter parity — clicking "All" while everything is selected
      // collapses to a single scope rather than emitting an empty set.
      setScopeSelection(new Set([GLOBAL_SCOPE_KEY]))
      return
    }
    setScopeSelection(null)
  }

  const saveCommand = (next: TerminalQuickCommand): void => {
    // Why: re-read from the store so save lands on the latest list when
    // multiple edit dialogs fire in quick succession.
    const latest = useAppStore.getState().settings?.terminalQuickCommands ?? []
    const isEdit = latest.some((command) => command.id === next.id)
    const nextList = isEdit
      ? latest.map((command) => (command.id === next.id ? next : command))
      : [...latest, next]
    useAppStore.getState().recordFeatureInteraction('quick-commands')
    updateSettings({ terminalQuickCommands: nextList })
  }

  const removeCommand = async (command: TerminalQuickCommand): Promise<void> => {
    const confirmed = await confirm({
      title: translate(
        'auto.components.settings.QuickCommandsPane.3edf3deaf8',
        'Delete "{{value0}}"?',
        { value0: command.label || 'Untitled' }
      ),
      description: translate(
        'auto.components.settings.QuickCommandsPane.3d9dc558e8',
        'This quick command will be removed from your saved list.'
      ),
      confirmLabel: translate('auto.components.settings.QuickCommandsPane.ec1ed99e70', 'Delete'),
      confirmVariant: 'destructive'
    })
    if (!confirmed) {
      return
    }
    // Why: re-read latest list from the store at delete time — the await above
    // can span other settings changes, and a stale closure would resurrect
    // commands that were removed concurrently.
    const latest = useAppStore.getState().settings?.terminalQuickCommands ?? []
    updateSettings({
      terminalQuickCommands: latest.filter((c) => c.id !== command.id)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="space-y-1">
          <Label>
            {translate('auto.components.settings.QuickCommandsPane.f91b649324', 'Saved Commands')}
          </Label>
          <p className="text-muted-foreground text-xs">{ownership.description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditor({ mode: 'add', command: createDraftForCurrentFilter() })}
        >
          <Plus />
          {translate('auto.components.settings.QuickCommandsPane.5aacc8f7dc', 'Add Command')}
        </Button>
      </div>

      <QuickCommandsScopeFilter
        repos={repos}
        effectiveSelection={effectiveSelection}
        showAll={showAll}
        scopePopoverOpen={scopePopoverOpen}
        setScopePopoverOpen={setScopePopoverOpen}
        handleSelectAll={handleSelectAll}
        toggleScope={toggleScope}
      />

      <QuickCommandsList
        commands={commands}
        visibleCommands={visibleCommands}
        repoById={repoById}
        onEdit={(command) => setEditor({ mode: 'edit', command })}
        onRemove={(command) => void removeCommand(command)}
      />

      {editor !== null ? (
        <TerminalQuickCommandDialog
          open
          mode={editor.mode}
          command={editor.command}
          repos={repos}
          onOpenChange={(open) => !open && setEditor(null)}
          onSave={saveCommand}
        />
      ) : null}
    </div>
  )
}
