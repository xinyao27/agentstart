import {
  getTerminalQuickCommandScope,
  isTerminalQuickCommandComplete,
  terminalQuickCommandMatchesRepo
} from '@yiru/protocol/terminal/quick-commands'
import type {
  TerminalQuickCommand,
  TerminalQuickCommandScope
} from '@yiru/protocol/terminal/quick-commands'
import { getRepoIdFromWorktreeId } from '@yiru/protocol/worktree/identity'
import { useState } from 'react'

import { translate } from '../i18n/i18n'
import { useRepoById } from '../store/selectors'
import { useAppStore } from '../store/state'
import { createTerminalQuickCommandDraft } from '../terminal-quick-commands/terminal-quick-command-dialog'
import { getCachedTerminalGroupIdForWorktree } from './terminal-unified-tab-lookup'

type TerminalQuickCommandMenuInput = {
  tabId: string
  worktreeId: string
}

export function useTerminalQuickCommandMenu({ tabId, worktreeId }: TerminalQuickCommandMenuInput): {
  editorOpen: boolean
  globalCommands: TerminalQuickCommand[]
  groupId: string | null
  openEditor: (scope: TerminalQuickCommandScope) => void
  quickCommandDraft: TerminalQuickCommand
  repoCommands: TerminalQuickCommand[]
  repoId: string | null
  repoLabel: string | null
  saveQuickCommand: (command: TerminalQuickCommand) => void
  setEditorOpen: React.Dispatch<React.SetStateAction<boolean>>
} {
  const settings = useAppStore((store) => store.settings)
  const updateSettings = useAppStore((store) => store.updateSettings)
  const [editorOpen, setEditorOpen] = useState(false)
  const [quickCommandDraft, setQuickCommandDraft] = useState(createTerminalQuickCommandDraft)
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const repo = useRepoById(repoId)
  const repoLabel = repo
    ? repo.displayName || repo.path
    : repoId
      ? translate('auto.components.terminal.pane.TerminalPane.thisRepo', 'This Repo')
      : null
  const validCommands = (settings?.terminalQuickCommands ?? []).filter((command) =>
    isTerminalQuickCommandComplete(command)
  )
  const repoCommands = validCommands.filter((command) => {
    const scope = getTerminalQuickCommandScope(command)
    return scope.type === 'repo' && terminalQuickCommandMatchesRepo(command, repoId)
  })
  const globalCommands = validCommands.filter(
    (command) => getTerminalQuickCommandScope(command).type === 'global'
  )
  const groupId =
    useAppStore(
      (store) =>
        getCachedTerminalGroupIdForWorktree(store.unifiedTabsByWorktree, worktreeId, tabId) ??
        store.activeGroupIdByWorktree[worktreeId] ??
        null
    ) ?? null

  return {
    editorOpen,
    globalCommands,
    groupId,
    openEditor: (scope) => {
      setQuickCommandDraft(createTerminalQuickCommandDraft(scope))
      setEditorOpen(true)
    },
    quickCommandDraft,
    repoCommands,
    repoId,
    repoLabel,
    saveQuickCommand: (command) => {
      const currentCommands = useAppStore.getState().settings?.terminalQuickCommands ?? []
      void updateSettings({ terminalQuickCommands: [...currentCommands, command] })
    },
    setEditorOpen
  }
}
