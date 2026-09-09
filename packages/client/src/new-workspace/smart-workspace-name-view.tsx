import type { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import type { GitHubWorkItem } from '@yiru/protocol/hosted-review/review-types'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { parseGitHubPullRequestLink } from '~renderer/github/links'
import { translate } from '~renderer/i18n/i18n'
import { TextAa as CaseSensitive, MagnifyingGlass as Search } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Command, CommandGroup, CommandItem, CommandList } from '~renderer/ui/command'
import { Input } from '~renderer/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '~renderer/ui/popover'

import { resolveSmartWorkspaceCommandValue } from './smart-workspace-command-value'
import type { getSmartWorkspaceNameModes } from './smart-workspace-localized-options'
import { SmartWorkspaceModeTabs } from './smart-workspace-mode-tabs'
import type { SmartWorkspaceNameSelection } from './smart-workspace-name-rows'
import {
  getSmartWorkspaceRowClassName,
  SmartWorkspaceRowIcon,
  SmartWorkspaceRowLabel
} from './smart-workspace-name-rows'
import { SmartWorkspaceSelection } from './smart-workspace-selection'
import { isComposerFieldToFieldFocus } from './smart-workspace-source-popover-focus'
import {
  getSmartWorkspaceEmptyHint,
  isSmartWorkspaceSourceQueryWithinLimit,
  type SmartNameMode,
  type SmartWorkspaceSourceRow
} from './smart-workspace-source-results'

type SmartWorkspaceNameViewProps = {
  availableModes: ReturnType<typeof getSmartWorkspaceNameModes>
  branchesEnabled: boolean
  cancelLocalInputFocusFrame: () => void
  commandValue: string
  debouncedQuery: string
  disabled: boolean
  disabledPlaceholder?: string
  handleSourcePopoverOpenChange: (
    next: boolean,
    eventDetails: PopoverPrimitive.Root.ChangeEventDetails
  ) => void
  isSourcePopoverOpen: boolean
  loading: boolean
  localInputFocusFrameRef: RefObject<number | null>
  localInputRef: RefObject<HTMLInputElement | null>
  markSourcePopoverUserEngaged: () => void
  mode: SmartNameMode
  onActiveSourceModeChange?: (mode: SmartNameMode) => void
  onBranchSelect: (refName: string, localBranchName: string) => void
  onClearSelectedSource: () => void
  onGitHubItemSelect: (item: GitHubWorkItem) => void
  onPlainEnter?: () => void
  onValueChange: (value: string) => void
  repoBackedSourcesDisabled: boolean
  rows: SmartWorkspaceSourceRow[]
  selectedSource: SmartWorkspaceNameSelection | null
  setCommandValue: Dispatch<SetStateAction<string>>
  setInputNode: (node: HTMLInputElement | null) => void
  setMode: Dispatch<SetStateAction<SmartNameMode>>
  setOpen: Dispatch<SetStateAction<boolean>>
  setSelectedSourceNode: (node: HTMLDivElement | null) => void
  tabsListRef: RefObject<HTMLDivElement | null>
  textOnly: boolean
  tryOpenSourcePopover: () => void
  value: string
}

export function SmartWorkspaceNameView({
  availableModes,
  branchesEnabled,
  cancelLocalInputFocusFrame,
  commandValue,
  debouncedQuery,
  disabled,
  disabledPlaceholder,
  handleSourcePopoverOpenChange,
  isSourcePopoverOpen,
  loading,
  localInputFocusFrameRef,
  localInputRef,
  markSourcePopoverUserEngaged,
  mode,
  onActiveSourceModeChange,
  onBranchSelect,
  onClearSelectedSource,
  onGitHubItemSelect,
  onPlainEnter,
  onValueChange,
  repoBackedSourcesDisabled,
  rows,
  selectedSource,
  setCommandValue,
  setInputNode,
  setMode,
  setOpen,
  setSelectedSourceNode,
  tabsListRef,
  textOnly,
  tryOpenSourcePopover,
  value
}: SmartWorkspaceNameViewProps): React.JSX.Element {
  const typedTextActionRow =
    rows.find((row) => row.kind === 'use-name' || row.kind === 'create-branch') ?? null
  const searchResultRows = typedTextActionRow
    ? rows.filter((row) => row !== typedTextActionRow)
    : rows
  const trimmedValue = isSmartWorkspaceSourceQueryWithinLimit(value) ? value.trim() : ''
  const trimmedDebouncedQuery = isSmartWorkspaceSourceQueryWithinLimit(debouncedQuery)
    ? debouncedQuery.trim()
    : ''
  const isQueryStale = trimmedValue.length > 0 && trimmedDebouncedQuery !== trimmedValue
  const sourceIntent = (() => {
    if (!isSmartWorkspaceSourceQueryWithinLimit(value)) {
      return null
    }
    const trimmed = value.trim()
    if (/^#\d+$/.test(trimmed) || parseGitHubPullRequestLink(trimmed)?.type === 'pr') {
      return 'github'
    }
    return null
  })()
  const resolvedCommandValue = resolveSmartWorkspaceCommandValue({
    currentValue: commandValue,
    rows,
    isQueryStale,
    sourceIntent
  })
  const ActiveInputIcon = mode === 'text' ? CaseSensitive : loading ? LoadingIndicator : Search
  const smartPlaceholder = repoBackedSourcesDisabled
    ? translate(
        'auto.components.new.workspace.SmartWorkspaceNameField.placeholderWorkspaceName',
        'Type a workspace name'
      )
    : branchesEnabled
      ? translate(
          'auto.components.new.workspace.SmartWorkspaceNameField.smartPlaceholderWithBranches',
          'Type a name, #1234, branch, or GitHub PR URL'
        )
      : translate(
          'auto.components.new.workspace.SmartWorkspaceNameField.smartPlaceholder',
          'Type a name, #1234, or GitHub PR URL'
        )
  const placeholder = disabled
    ? (disabledPlaceholder ??
      translate('auto.components.new.workspace.SmartWorkspaceNameField.unavailable', 'Unavailable'))
    : mode === 'smart'
      ? smartPlaceholder
      : mode === 'github'
        ? translate(
            'auto.components.new.workspace.SmartWorkspaceNameField.searchGitHub',
            'Search GitHub PRs'
          )
        : mode === 'branches'
          ? translate(
              'auto.components.new.workspace.SmartWorkspaceNameField.searchBranches',
              'Search branches'
            )
          : translate(
              'auto.components.new.workspace.SmartWorkspaceNameField.workspaceName',
              'Workspace name'
            )
  const handleSelect = (row: SmartWorkspaceSourceRow): void => {
    if (row.kind === 'use-name' || row.kind === 'create-branch') {
      onValueChange(row.name)
    } else if (row.kind === 'github') {
      onGitHubItemSelect(row.item)
    } else if (row.kind === 'branch') {
      onBranchSelect(row.refName, row.localBranchName)
    }
    setOpen(false)
  }

  return (
    <div className="min-w-0 space-y-1.5">
      {textOnly ? null : (
        <SmartWorkspaceModeTabs
          availableModes={availableModes}
          cancelInputFocusFrame={cancelLocalInputFocusFrame}
          disabled={disabled}
          inputFocusFrameRef={localInputFocusFrameRef}
          inputRef={localInputRef}
          markPopoverEngaged={markSourcePopoverUserEngaged}
          mode={mode}
          onActiveModeChange={onActiveSourceModeChange}
          selectedSource={selectedSource !== null}
          setMode={setMode}
          setOpen={setOpen}
          tabsListRef={tabsListRef}
        />
      )}

      <Popover open={isSourcePopoverOpen} onOpenChange={handleSourcePopoverOpenChange}>
        <Command
          value={resolvedCommandValue}
          onValueChange={setCommandValue}
          shouldFilter={false}
          className="overflow-visible bg-transparent"
        >
          <PopoverAnchor>
            <div className="relative min-w-0">
              {selectedSource ? (
                <SmartWorkspaceSelection
                  onClear={onClearSelectedSource}
                  onPlainEnter={onPlainEnter}
                  selection={selectedSource}
                  setNode={setSelectedSourceNode}
                />
              ) : (
                <>
                  <ActiveInputIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                  <Input
                    ref={setInputNode}
                    data-workspace-name-input="true"
                    value={value}
                    onPointerDown={() => {
                      if (!disabled && mode !== 'text') {
                        markSourcePopoverUserEngaged()
                        setOpen(true)
                      }
                    }}
                    onChange={(event) => {
                      onValueChange(event.target.value)
                      if (!disabled && mode !== 'text') {
                        markSourcePopoverUserEngaged()
                        setOpen(true)
                      }
                    }}
                    onFocus={(event) => {
                      // Why: only open when focus moves from another composer
                      // control (Tab/Shift+Tab). Dialog autofocus comes from
                      // outside the composer root and stays suppressed until
                      // click/type/tab-within-composer engagement above.
                      if (!isComposerFieldToFieldFocus(event)) {
                        return
                      }
                      markSourcePopoverUserEngaged()
                      tryOpenSourcePopover()
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Tab' && event.shiftKey) {
                        const activeTrigger = tabsListRef.current?.querySelector<HTMLElement>(
                          `[data-smart-name-mode="${mode}"]`
                        )
                        if (activeTrigger) {
                          event.preventDefault()
                          activeTrigger.focus()
                          return
                        }
                      }
                      if (
                        event.key === 'Enter' &&
                        !event.metaKey &&
                        !event.ctrlKey &&
                        !event.shiftKey
                      ) {
                        if (isSourcePopoverOpen && rows.length > 0) {
                          const row = rows.find((entry) => entry.value === resolvedCommandValue)
                          if (row) {
                            event.preventDefault()
                            handleSelect(row)
                            return
                          }
                          // No highlighted row (e.g., stale results in
                          // GitHub mode where the highlight was
                          // cleared to avoid auto-selecting a stale source).
                          // Fall through to onPlainEnter so the keypress
                          // doesn't feel inert.
                        }
                        onPlainEnter?.()
                      }
                      if (event.key === 'Escape' && isSourcePopoverOpen) {
                        event.stopPropagation()
                        setOpen(false)
                      }
                    }}
                    placeholder={placeholder}
                    disabled={disabled}
                    className="h-9 pl-8 text-sm"
                  />
                </>
              )}
            </div>
          </PopoverAnchor>
          <PopoverContent
            align="start"
            sideOffset={4}
            className="popover-scroll-content flex w-[var(--radix-popover-trigger-width)] flex-col p-0"
            // Why: this popover lives inside the create-workspace dialog; a
            // taller result list can cover the submit footer while typing.
            style={{ maxHeight: 'min(var(--radix-popover-content-available-height,7rem),7rem)' }}
            // Why: outside-press/focus-out cancellation now lives on the Popover
            // root's onOpenChange (see handleSourcePopoverOpenChange).
            initialFocus={false}
          >
            <CommandList className="scrollbar-sleek !max-h-none min-h-0 flex-1">
              {typedTextActionRow ? (
                <div
                  className="border-border/40 bg-popover sticky top-0 z-10 border-b p-1"
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <CommandItem
                    key={typedTextActionRow.value}
                    value={typedTextActionRow.value}
                    onSelect={() => handleSelect(typedTextActionRow)}
                    className={getSmartWorkspaceRowClassName(typedTextActionRow, {
                      pinnedAction: true
                    })}
                  >
                    <SmartWorkspaceRowIcon row={typedTextActionRow} />
                    <SmartWorkspaceRowLabel row={typedTextActionRow} />
                  </CommandItem>
                </div>
              ) : null}
              {loading && searchResultRows.length === 0 ? (
                <div className="space-y-1 p-1">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="bg-muted/40 h-8 animate-pulse" />
                  ))}
                </div>
              ) : searchResultRows.length === 0 && !typedTextActionRow ? (
                <div className="text-muted-foreground px-3 py-6 text-center text-xs">
                  {getSmartWorkspaceEmptyHint(mode)}
                </div>
              ) : searchResultRows.length > 0 ? (
                <CommandGroup className="p-1">
                  {searchResultRows.map((row) => (
                    <CommandItem
                      key={row.value}
                      value={row.value}
                      onSelect={() => handleSelect(row)}
                      className={getSmartWorkspaceRowClassName(row)}
                    >
                      <SmartWorkspaceRowIcon row={row} />
                      <SmartWorkspaceRowLabel row={row} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </PopoverContent>
        </Command>
      </Popover>
    </div>
  )
}
