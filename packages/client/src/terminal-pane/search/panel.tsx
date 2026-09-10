import type { SearchAddon } from '@xterm/addon-search'
import { useEffect, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  TextAa as CaseSensitive,
  Asterisk as Regex,
  CaretUp as ChevronUp,
  CaretDown as ChevronDown,
  X
} from '~renderer/icons/hugeicons'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { getFindRequestQuery } from '~renderer/search/query-bounds'
import type { SearchState } from '~renderer/terminal-pane/keyboard-handlers'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Input } from '~renderer/ui/input'

import { safeFind } from './safe-find'

type TerminalSearchProps = {
  isOpen: boolean
  onClose: () => void
  searchAddon: SearchAddon | null
  searchStateRef: React.RefObject<SearchState>
}

export default function TerminalSearch({
  isOpen,
  onClose,
  searchAddon,
  searchStateRef
}: TerminalSearchProps): React.JSX.Element | null {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const requestQuery = getFindRequestQuery(query)

  // Why: the default xterm SearchAddon highlights blend into common
  // terminal backgrounds (see agentstart#612). Providing explicit decoration
  // colors gives all matches a visible yellow background and the
  // current match a brighter orange, matching the contrast VS Code and
  // iTerm2 use for terminal search. xterm requires #RRGGBB format for
  // the background colors.
  const searchOptions = useEventCallback((incremental: boolean = false) => ({
    caseSensitive,
    regex,
    incremental,
    decorations: {
      matchBackground: '#5c4a00',
      matchBorder: '#5c4a00',
      matchOverviewRuler: '#ffcc00',
      activeMatchBackground: '#c4580e',
      activeMatchBorder: '#ffcf6b',
      activeMatchColorOverviewRuler: '#ff9900'
    }
  }))

  const findNext = () => {
    if (searchAddon && requestQuery) {
      safeFind(
        (term, options) => searchAddon.findNext(term, options),
        requestQuery,
        searchOptions()
      )
    }
  }

  const findPrevious = () => {
    if (searchAddon && requestQuery) {
      safeFind(
        (term, options) => searchAddon.findPrevious(term, options),
        requestQuery,
        searchOptions()
      )
    }
  }

  const handleInputRef = (input: HTMLInputElement | null): void => {
    input?.focus()
  }

  useEffect(() => {
    // Keep the ref in sync so the keyboard handler (Cmd+G / Cmd+Shift+G)
    // can read the current search state without lifting it to parent state.
    searchStateRef.current = { query: requestQuery ?? '', caseSensitive, regex }

    if (!isOpen) {
      searchAddon?.clearDecorations()
      return
    }
    if (!requestQuery) {
      searchAddon?.clearDecorations()
      return
    }
    if (searchAddon) {
      safeFind(
        (term, options) => searchAddon.findNext(term, options),
        requestQuery,
        searchOptions(true)
      )
    }
  }, [requestQuery, searchAddon, isOpen, caseSensitive, regex, searchStateRef, searchOptions])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()

    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Enter' && e.shiftKey) {
      findPrevious()
    } else if (e.key === 'Enter') {
      findNext()
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <div
      data-terminal-search-root
      className="focus-within:border-ring absolute top-2 right-2 z-50 flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1"
      style={{ width: 300 }}
      onKeyDown={handleKeyDown}
    >
      <Input
        ref={handleInputRef}
        type="text"
        variant="chrome-free"
        size="sm"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={translate('auto.components.TerminalSearch.e07012f26e', 'Search...')}
        className="flex-1 text-white placeholder:text-zinc-500"
      />

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => setCaseSensitive((v) => !v)}
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded',
          caseSensitive ? 'bg-zinc-700/50 text-blue-400' : 'text-zinc-400 hover:text-zinc-200'
        )}
        title={translate('auto.components.TerminalSearch.90c61387d9', 'Case sensitive')}
      >
        <CaseSensitive size={14} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => setRegex((v) => !v)}
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded',
          regex ? 'bg-zinc-700/50 text-blue-400' : 'text-zinc-400 hover:text-zinc-200'
        )}
        title={translate('auto.components.TerminalSearch.42e466b9f1', 'Regex')}
      >
        <Regex size={14} />
      </Button>

      <div className="mx-0.5 h-4 w-px bg-zinc-700" />

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={findPrevious}
        className="flex size-6 shrink-0 items-center justify-center rounded text-zinc-400 hover:text-zinc-200"
        title={translate('auto.components.TerminalSearch.0f3066256e', 'Previous match')}
      >
        <ChevronUp size={14} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={findNext}
        className="flex size-6 shrink-0 items-center justify-center rounded text-zinc-400 hover:text-zinc-200"
        title={translate('auto.components.TerminalSearch.7cb40c04eb', 'Next match')}
      >
        <ChevronDown size={14} />
      </Button>

      <div className="mx-0.5 h-4 w-px bg-zinc-700" />

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onClose}
        className="flex size-6 shrink-0 items-center justify-center rounded text-zinc-400 hover:text-zinc-200"
        title={translate('auto.components.TerminalSearch.db234b7519', 'Close')}
      >
        <X size={14} />
      </Button>
    </div>
  )
}
