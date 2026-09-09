import type { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { useEffect, useRef, useState } from 'react'
import { useUiLocale } from '~renderer/i18n/use-ui-locale'

import { getSmartWorkspaceNameModes } from './smart-workspace-localized-options'
import type { SmartWorkspaceNameSelection } from './smart-workspace-name-rows'
import type { SmartNameMode } from './smart-workspace-source-results'

const SEARCH_DEBOUNCE_MS = 200

type UseSmartWorkspaceInputOptions = {
  branchesEnabled: boolean
  disabled: boolean
  inputRef?: React.RefObject<HTMLInputElement | null>
  onActiveSourceModeChange?: (mode: SmartNameMode) => void
  repoBackedSourcesDisabled: boolean
  selectedSource: SmartWorkspaceNameSelection | null
  textOnly: boolean
  value: string
}

export function useSmartWorkspaceInput({
  branchesEnabled,
  disabled,
  inputRef,
  onActiveSourceModeChange,
  repoBackedSourcesDisabled,
  selectedSource,
  textOnly,
  value
}: UseSmartWorkspaceInputOptions) {
  useUiLocale()
  const [mode, setMode] = useState<SmartNameMode>(textOnly ? 'text' : 'smart')
  const [open, setOpen] = useState(false)
  const [debouncedQuery, setDebouncedQuery] = useState(value)
  const [commandValue, setCommandValue] = useState('')
  const localInputRef = useRef<HTMLInputElement | null>(null)
  const focusedSelectedSourceKeyRef = useRef<string | null>(null)
  const tabsListRef = useRef<HTMLDivElement | null>(null)
  const localInputFocusFrameRef = useRef<number | null>(null)
  const deferSourcePopoverUntilInteractionRef = useRef(true)
  const availableModes = getSmartWorkspaceNameModes().filter((item) => {
    if (textOnly) {
      return item.id === 'text'
    }
    if (item.id === 'github') {
      return !repoBackedSourcesDisabled
    }
    if (item.id === 'branches') {
      return branchesEnabled && !repoBackedSourcesDisabled
    }
    return true
  })
  const activeMode = availableModes.some((item) => item.id === mode)
    ? mode
    : (availableModes[0]?.id ?? 'text')
  const selectedSourceFocusKey = selectedSource
    ? `${selectedSource.kind}:${selectedSource.label}:${selectedSource.url ?? ''}`
    : null

  useEffect(() => {
    onActiveSourceModeChange?.(activeMode)
  }, [activeMode, onActiveSourceModeChange])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(value), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [value])

  const cancelInputFocusFrame = (): void => {
    if (localInputFocusFrameRef.current !== null) {
      cancelAnimationFrame(localInputFocusFrameRef.current)
      localInputFocusFrameRef.current = null
    }
  }

  const markPopoverEngaged = (): void => {
    deferSourcePopoverUntilInteractionRef.current = false
  }

  const tryOpenPopover = (): void => {
    if (!disabled && activeMode !== 'text' && !deferSourcePopoverUntilInteractionRef.current) {
      setOpen(true)
    }
  }

  const handlePopoverOpenChange = (
    next: boolean,
    eventDetails: PopoverPrimitive.Root.ChangeEventDetails
  ): void => {
    if (!next && (eventDetails.reason === 'outside-press' || eventDetails.reason === 'focus-out')) {
      const target = eventDetails.event.target as Node | null
      if (
        target &&
        (localInputRef.current?.contains(target) || tabsListRef.current?.contains(target))
      ) {
        eventDetails.cancel()
        return
      }
    }
    if (disabled || selectedSource) {
      setOpen(false)
      return
    }
    if (!next || !deferSourcePopoverUntilInteractionRef.current) {
      setOpen(next)
    }
  }

  const setInputNode = (node: HTMLInputElement | null): void => {
    if (node === null) {
      cancelInputFocusFrame()
    }
    localInputRef.current = node
    if (inputRef) {
      inputRef.current = node
    }
  }

  const setSelectedSourceNode = (node: HTMLDivElement | null): void => {
    if (!node) {
      focusedSelectedSourceKeyRef.current = null
      return
    }
    if (!selectedSourceFocusKey || focusedSelectedSourceKeyRef.current === selectedSourceFocusKey) {
      return
    }
    focusedSelectedSourceKeyRef.current = selectedSourceFocusKey
    node.focus({ preventScroll: true })
  }

  return {
    availableModes,
    cancelInputFocusFrame,
    commandValue,
    debouncedQuery,
    handlePopoverOpenChange,
    isPopoverOpen:
      !disabled && !textOnly && open && activeMode !== 'text' && selectedSource === null,
    localInputFocusFrameRef,
    localInputRef,
    markPopoverEngaged,
    mode: activeMode,
    setCommandValue,
    setInputNode,
    setMode,
    setOpen,
    setSelectedSourceNode,
    tabsListRef,
    tryOpenPopover
  }
}
