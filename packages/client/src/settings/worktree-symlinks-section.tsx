import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '@agentstart/protocol/host/identity'
import type { Repo } from '@agentstart/protocol/project/repository'
import { useEffect, useState } from 'react'
import { getFileTypeIcon } from '~renderer/file-presentation/icons'
import { translate } from '~renderer/i18n/i18n'
import { Folder, LinkSimple as Link2, Plus, X } from '~renderer/icons/hugeicons'
import { readRuntimeDirectory } from '~renderer/runtime/file-client'
import { cn } from '~renderer/ui/class-names'

import { Button } from '../ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '../ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { SearchableSetting } from './searchable-setting'
import {
  getWorktreeSymlinkPathFilterState,
  type WorktreeSymlinkPathSuggestion
} from './worktree-symlink-path-filter'

type WorktreeSymlinksSectionProps = {
  repo: Repo
  updateRepo: (repoId: string, updates: Partial<Repo>) => void
}

type DirectorySuggestionState = {
  requestKey: string
  entries: WorktreeSymlinkPathSuggestion[]
}

const EMPTY_WORKTREE_SYMLINK_PATHS: readonly string[] = []

export function WorktreeSymlinksSection({
  repo,
  updateRepo
}: WorktreeSymlinksSectionProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const paths = repo.symlinkPaths ?? EMPTY_WORKTREE_SYMLINK_PATHS
  // Why: the pane may show a non-focused runtime host; only inspect the local
  // filesystem when the switcher-selected repo is actually local.
  const useLocalDirectorySuggestions = getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID
  const directorySuggestionKey = repo.path
  const [directorySuggestions, setDirectorySuggestions] = useState<DirectorySuggestionState>(
    () => ({
      requestKey: directorySuggestionKey,
      entries: []
    })
  )

  useEffect(() => {
    if (!useLocalDirectorySuggestions) {
      return
    }
    let cancelled = false
    void readRuntimeDirectory(
      {
        settings: null,
        worktreeId: null,
        worktreePath: repo.path
      },
      repo.path
    )
      .then((list) => {
        if (cancelled) {
          return
        }
        setDirectorySuggestions({
          requestKey: directorySuggestionKey,
          entries: list.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory }))
        })
      })
      .catch(() => {
        // Non-fatal: without entries the combobox still works as a free-text
        // input — the user can type any path and commit it.
      })
    return () => {
      cancelled = true
    }
  }, [useLocalDirectorySuggestions, repo.path, directorySuggestionKey])

  const { queryTrimmed, filtered, showLiteralItem } = (() => {
    const suggestionEntries =
      useLocalDirectorySuggestions && directorySuggestions.requestKey === directorySuggestionKey
        ? directorySuggestions.entries
        : []
    return getWorktreeSymlinkPathFilterState({
      query,
      suggestions: suggestionEntries,
      existingPaths: paths
    })
  })()

  const commit = (rawName: string): void => {
    const trimmed = rawName.trim().replace(/^\/+/, '')
    if (!trimmed || paths.includes(trimmed)) {
      setQuery('')
      return
    }
    updateRepo(repo.id, { symlinkPaths: [...paths, trimmed] })
    setQuery('')
    setOpen(false)
  }

  const handleRemove = (path: string): void => {
    updateRepo(repo.id, { symlinkPaths: paths.filter((p) => p !== path) })
  }

  return (
    <SearchableSetting
      title={translate(
        'auto.components.settings.WorktreeSymlinksSection.4755f120b6',
        'Worktree Shared Paths'
      )}
      description={translate(
        'auto.components.settings.WorktreeSymlinksSection.b07ef5a8b6',
        'Paths to materialize from the primary checkout into newly created worktrees.'
      )}
      keywords={[
        repo.displayName,
        'apfs',
        'clone',
        'copy',
        'symlink',
        'symlinks',
        'worktree',
        'link',
        'shared',
        'env',
        'node_modules'
      ]}
      className="space-y-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            {translate(
              'auto.components.settings.WorktreeSymlinksSection.4755f120b6',
              'Worktree Shared Paths'
            )}
          </h3>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.WorktreeSymlinksSection.7ff265071d',
              'When a new worktree is created, each path listed here is APFS clone-copied on macOS when possible, otherwise symlinked from the primary checkout.'
            )}
          </p>
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button type="button" variant="outline" size="sm">
                <Plus className="size-3.5" />
                {translate(
                  'auto.components.settings.WorktreeSymlinksSection.241325302c',
                  'Add Path'
                )}
              </Button>
            }
          />
          <PopoverContent align="end" className="w-72 p-0">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={translate(
                  'auto.components.settings.WorktreeSymlinksSection.4cd2a4c077',
                  'Type a path (e.g. .env or node_modules)…'
                )}
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                <CommandEmpty>
                  {translate(
                    'auto.components.settings.WorktreeSymlinksSection.ab40b8a5f1',
                    'No matches. Keep typing to add a custom path.'
                  )}
                </CommandEmpty>
                {showLiteralItem ? (
                  <CommandItem
                    value={`__literal__:${queryTrimmed}`}
                    onSelect={() => commit(queryTrimmed)}
                    className="items-center gap-2 px-3 py-2"
                  >
                    <Plus className="text-muted-foreground size-3.5" />
                    <span className="text-xs">
                      {translate(
                        'auto.components.settings.WorktreeSymlinksSection.b2429aeb31',
                        'Add'
                      )}{' '}
                      <code className="bg-muted rounded px-1 py-0.5 text-[11px]">
                        {queryTrimmed}
                      </code>
                    </span>
                  </CommandItem>
                ) : null}
                {filtered.map((entry) => {
                  const alreadyAdded = paths.includes(entry.name)
                  const FileIcon = getFileTypeIcon(entry.name)
                  return (
                    <CommandItem
                      key={entry.name}
                      value={entry.name}
                      disabled={alreadyAdded}
                      onSelect={() => commit(entry.name)}
                      className={cn('items-center gap-2 px-3 py-2', alreadyAdded && 'opacity-50')}
                    >
                      {entry.isDirectory ? (
                        <Folder className="text-muted-foreground size-3.5" />
                      ) : (
                        <FileIcon className="text-muted-foreground size-3.5" />
                      )}
                      <span className="truncate text-xs">{entry.name}</span>
                      {alreadyAdded ? (
                        <span className="text-muted-foreground ml-auto text-[10px] tracking-wide uppercase">
                          {translate(
                            'auto.components.settings.WorktreeSymlinksSection.ea06227efa',
                            'added'
                          )}
                        </span>
                      ) : null}
                    </CommandItem>
                  )
                })}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {paths.length === 0 ? (
        <div className="border-border/60 bg-background/60 text-muted-foreground rounded-xl border border-dashed px-4 py-6 text-sm">
          {translate(
            'auto.components.settings.WorktreeSymlinksSection.31ebab5403',
            'No shared paths configured for this repository.'
          )}
        </div>
      ) : (
        <div className="border-border/50 bg-background/70 rounded-xl border px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="border-border/50 bg-muted/30 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border">
              <Link2 className="text-muted-foreground size-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h4 className="text-sm font-medium">
                  {translate(
                    'auto.components.settings.WorktreeSymlinksSection.b814c618e2',
                    'Linked paths'
                  )}
                </h4>
                <span className="text-muted-foreground text-[11px]">
                  {paths.length === 1
                    ? translate(
                        'auto.components.settings.WorktreeSymlinksSection.9ea912d811',
                        '1 path'
                      )
                    : translate(
                        'auto.components.settings.WorktreeSymlinksSection.d72ba8dc68',
                        '{{value0}} paths',
                        { value0: paths.length }
                      )}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {paths.map((path) => (
                  <span
                    key={path}
                    title={path}
                    className="border-border/50 bg-muted/35 text-foreground/80 inline-flex max-w-full min-w-0 items-center gap-1 truncate rounded-md border py-1 pr-1 pl-2 font-mono text-[11px]"
                  >
                    <span className="truncate">{path}</span>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => handleRemove(path)}
                      aria-label={translate(
                        'auto.components.settings.WorktreeSymlinksSection.1c1e35b219',
                        'Remove {{value0}}',
                        { value0: path }
                      )}
                      className="size-4 shrink-0 rounded-sm"
                    >
                      <X className="size-3" />
                    </Button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </SearchableSetting>
  )
}
