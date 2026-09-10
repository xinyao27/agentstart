import { ALL_TUI_AGENTS, TUI_AGENT_DISPLAY_NAMES } from '@agentstart/protocol/agent/display-names'
import { keybindingMatchesAction } from '@agentstart/protocol/keybindings'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { launchAgentInNewTab } from '~renderer/agent/launch-in-new-tab'
import { detectLanguage } from '~renderer/file-presentation/language-detect'
import { translate } from '~renderer/i18n/i18n'
import {
  ActivityIcon,
  BookOpen,
  DeviceMobile,
  File,
  Folder,
  GearSix,
  MagnifyingGlass,
  TerminalWindow
} from '~renderer/icons/hugeicons'
import { getShortcutPlatform } from '~renderer/keyboard-input/shortcut-platform'
import { joinPath } from '~renderer/path'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogRepoKey, projectCatalogTargetForRepo } from '~renderer/project-catalog/query'
import { targetKey } from '~renderer/runtime/query-target'
import { terminalListQuery } from '~renderer/runtime/terminal-query'
import { openSidebarPage } from '~renderer/sidebar/host-navigation'
import { useActiveWorktree } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '~renderer/ui/command'

import { BrowserContextCaptureDialog } from '../context/capture-dialog'
import { BrowserContextCommandGroup } from '../context/command-group'
import { getExtensionHostNavigation, type ExtensionPage } from '../navigation'
import { filePathsQuery } from '../runtime/queries'
import { commandPaletteRuntimeTargets, commandPaletteWorktreeTarget } from './catalog'
import { subscribeCommandPaletteOpen } from './open'

const EMPTY_DISABLED_TUI_AGENTS: readonly (typeof ALL_TUI_AGENTS)[number][] = []

const GLOBAL_COMMANDS: readonly {
  icon: React.ComponentType<{ className?: string }>
  label: string
  page: ExtensionPage
}[] = [
  { icon: MagnifyingGlass, label: 'Search', page: 'search' },
  { icon: ActivityIcon, label: 'Activity', page: 'activity' },
  { icon: DeviceMobile, label: 'AgentStart Mobile', page: 'mobile' },
  { icon: BookOpen, label: 'Skills', page: 'skills' },
  { icon: GearSix, label: 'Settings', page: 'settings' }
]

export type CommandPaletteProps = {
  includeWorkspaceFiles?: boolean
}

export function CommandPalette({
  includeWorkspaceFiles = false
}: CommandPaletteProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [isContextCaptureOpen, setIsContextCaptureOpen] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigation = getExtensionHostNavigation()
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const openFile = useAppStore((state) => state.openFile)
  const openFiles = useAppStore((state) => state.openFiles)
  const disabledTuiAgents = useAppStore(
    (state) => state.settings?.disabledTuiAgents ?? EMPTY_DISABLED_TUI_AGENTS
  )
  const activeWorktree = useActiveWorktree()
  const catalog = useProjectCatalog()
  const runtimeTargets = commandPaletteRuntimeTargets(catalog.repos)
  const terminalQueries = useQueries({
    queries: runtimeTargets.map(({ target }) => terminalListQuery(target, { limit: 500 }, 2_000))
  })
  const terminalsByTarget = new Map(
    runtimeTargets.map(({ key }, index) => [key, terminalQueries[index]?.data?.terminals ?? []])
  )
  const activeWorktreeTarget = commandPaletteWorktreeTarget(catalog, activeWorktreeId)
  const filePaths = useQuery(
    filePathsQuery(
      activeWorktreeTarget,
      includeWorkspaceFiles && isOpen ? activeWorktreeId : null,
      includeWorkspaceFiles ? deferredQuery : ''
    )
  )
  useEffect(() => {
    const open = (): void => {
      setQuery('')
      setIsOpen(true)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        keybindingMatchesAction(
          'app.commandPalette',
          {
            altKey: event.altKey,
            code: event.code,
            ctrlKey: event.ctrlKey,
            key: event.key,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey
          },
          getShortcutPlatform(),
          useAppStore.getState().keybindings
        )
      ) {
        event.preventDefault()
        event.stopPropagation()
        setQuery('')
        setIsOpen((current) => !current)
      }
    }
    const unsubscribeOpen = subscribeCommandPaletteOpen(open)
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      unsubscribeOpen()
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [])
  const run = (action: () => void): void => {
    setIsOpen(false)
    action()
  }
  const openWorkspaceFile = (relativePath: string): void => {
    if (!activeWorktreeId || !activeWorktree?.path) {
      return
    }
    run(() =>
      openFile({
        filePath: joinPath(activeWorktree.path, relativePath),
        relativePath,
        worktreeId: activeWorktreeId,
        language: detectLanguage(relativePath),
        mode: 'edit'
      })
    )
  }
  const runCurrentWorktreeAction = (action: (groupId: string) => void): void => {
    if (!activeWorktreeId) {
      return
    }
    const state = useAppStore.getState()
    const groupId =
      state.activeGroupIdByWorktree[activeWorktreeId] ??
      state.groupsByWorktree[activeWorktreeId]?.[0]?.id
    if (!groupId) {
      return
    }
    run(() => action(groupId))
  }
  const activeEditorFiles = openFiles.filter((file) => file.worktreeId === activeWorktreeId)
  const availableAgents = ALL_TUI_AGENTS.filter((agent) => !disabledTuiAgents.includes(agent))
  return (
    <>
      <CommandDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        initialFocus={inputRef}
        title={translate('extension.commandPalette.title', 'AgentStart commands')}
        description={translate(
          'extension.commandPalette.description',
          'Open a project, worktree, session, or AgentStart page.'
        )}
      >
        <CommandInput
          ref={inputRef}
          autoFocus
          placeholder={translate('extension.commandPalette.placeholder', 'Search AgentStart…')}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {translate('extension.commandPalette.empty', 'No matching command.')}
          </CommandEmpty>
          <CommandGroup heading={translate('extension.commandPalette.pages', 'Pages')}>
            {GLOBAL_COMMANDS.map((command) => (
              <CommandItem
                key={command.page}
                value={`${command.label} ${command.page}`}
                onSelect={() =>
                  run(() => {
                    if (command.page === 'settings' && openSidebarPage('settings')) {
                      return
                    }
                    navigation.openPage(command.page)
                  })
                }
              >
                <command.icon />
                {translate(`extension.navigation.${command.page}`, command.label)}
              </CommandItem>
            ))}
          </CommandGroup>
          <BrowserContextCommandGroup
            onOpenCapture={() => setIsContextCaptureOpen(true)}
            run={run}
          />
          {activeWorktreeId ? (
            <CommandGroup heading={translate('extension.commandPalette.actions', 'Actions')}>
              <CommandItem
                value="new terminal session"
                onSelect={() =>
                  runCurrentWorktreeAction((groupId) => {
                    void useAppStore.getState().openNewTerminalTabInActiveWorkspace(groupId)
                  })
                }
              >
                <TerminalWindow />
                {translate('extension.commandPalette.newTerminal', 'New terminal')}
              </CommandItem>
              <CommandItem
                value="new markdown file editor"
                onSelect={() =>
                  runCurrentWorktreeAction((groupId) => {
                    void useAppStore.getState().openNewMarkdownInActiveWorkspace(groupId)
                  })
                }
              >
                <File />
                {translate('extension.commandPalette.newFile', 'New file')}
              </CommandItem>
              {availableAgents.map((agent) => (
                <CommandItem
                  key={`agent:${agent}`}
                  value={`agent launch ${TUI_AGENT_DISPLAY_NAMES[agent]} ${agent}`}
                  onSelect={() =>
                    runCurrentWorktreeAction((groupId) => {
                      void launchAgentInNewTab({
                        agent,
                        worktreeId: activeWorktreeId,
                        groupId,
                        launchSource: 'shortcut'
                      })
                    })
                  }
                >
                  <TerminalWindow />
                  {translate('extension.commandPalette.launchAgent', 'Launch {{value0}}', {
                    value0: TUI_AGENT_DISPLAY_NAMES[agent]
                  })}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {activeEditorFiles.length > 0 ? (
            <CommandGroup heading={translate('extension.commandPalette.openTabs', 'Open tabs')}>
              {activeEditorFiles.map((file) => (
                <CommandItem
                  key={`open-file:${file.id}`}
                  value={`open tab ${file.relativePath}`}
                  onSelect={() =>
                    run(() => {
                      const state = useAppStore.getState()
                      state.setActiveFile(file.id)
                      state.setActiveTabType('editor')
                    })
                  }
                >
                  <File />
                  <span className="truncate">{file.relativePath}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          <CommandGroup heading={translate('extension.commandPalette.projects', 'Projects')}>
            {catalog.repos.flatMap((repo) => {
              const projectWorktrees = catalog.worktreesByRepo[projectCatalogRepoKey(repo)] ?? []
              const projectTerminals =
                terminalsByTarget.get(targetKey(projectCatalogTargetForRepo(repo))) ?? []
              return [
                <CommandItem
                  key={`project:${repo.id}`}
                  value={`${repo.displayName} ${repo.path}`}
                  onSelect={() => run(() => navigation.openWorkspace({ projectId: repo.id }))}
                >
                  <Folder />
                  <span className="truncate">{repo.displayName}</span>
                </CommandItem>,
                ...projectWorktrees.flatMap((worktree) => [
                  <CommandItem
                    key={`worktree:${worktree.id}`}
                    value={`${repo.displayName} ${worktree.displayName} ${worktree.branch}`}
                    className="pl-6"
                    onSelect={() =>
                      run(() =>
                        navigation.openWorkspace({
                          projectId: repo.id,
                          worktreeId: worktree.id
                        })
                      )
                    }
                  >
                    <Folder />
                    <span className="truncate">{worktree.displayName || worktree.branch}</span>
                  </CommandItem>,
                  ...projectTerminals
                    .filter((terminal) => terminal.worktreeId === worktree.id)
                    .map((terminal) => (
                      <CommandItem
                        key={`session:${terminal.handle}`}
                        value={`${repo.displayName} ${worktree.displayName} ${terminal.title ?? terminal.preview}`}
                        className="pl-10"
                        onSelect={() =>
                          run(() =>
                            navigation.openWorkspace({
                              projectId: repo.id,
                              sessionId: terminal.handle,
                              worktreeId: worktree.id
                            })
                          )
                        }
                      >
                        <TerminalWindow />
                        <span className="truncate">
                          {terminal.title ||
                            terminal.preview ||
                            translate('extension.terminal.untitled', 'Terminal')}
                        </span>
                      </CommandItem>
                    ))
                ])
              ]
            })}
          </CommandGroup>
          {includeWorkspaceFiles && deferredQuery.trim() ? (
            <CommandGroup heading={translate('extension.commandPalette.files', 'Files')}>
              {filePaths.isFetching ? (
                <CommandItem forceMount disabled value="loading-files">
                  {translate('extension.commandPalette.loadingFiles', 'Loading files…')}
                </CommandItem>
              ) : null}
              {filePaths.error ? (
                <CommandItem forceMount disabled value="file-load-error">
                  {translate(
                    'extension.commandPalette.fileLoadError',
                    'Could not load files: {{value0}}',
                    {
                      value0:
                        filePaths.error instanceof Error
                          ? filePaths.error.message
                          : String(filePaths.error)
                    }
                  )}
                </CommandItem>
              ) : null}
              {(filePaths.data?.files ?? []).map((file) => (
                <CommandItem
                  key={`file:${file.relativePath}`}
                  value={`file ${file.relativePath}`}
                  onSelect={() => openWorkspaceFile(file.relativePath)}
                >
                  <File />
                  <span className="truncate">{file.relativePath}</span>
                </CommandItem>
              ))}
              {!filePaths.isFetching && !filePaths.error && filePaths.data?.files.length === 0 ? (
                <CommandItem forceMount disabled value="no-matching-files">
                  {translate('extension.commandPalette.noMatchingFiles', 'No matching files.')}
                </CommandItem>
              ) : null}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
      <BrowserContextCaptureDialog
        open={isContextCaptureOpen}
        onOpenChange={setIsContextCaptureOpen}
      />
    </>
  )
}
