import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { isImeCompositionKeyDown } from '~renderer/keyboard-input/ime-composition'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { cn } from '~renderer/ui/class-names'
import { Input } from '~renderer/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

type WorktreeTitleRenameCommit = { kind: 'cancel' } | { kind: 'save'; displayName: string }

function getWorktreeTitleRenameCommit(
  currentDisplayName: string,
  nextDisplayName: string
): WorktreeTitleRenameCommit {
  const trimmed = nextDisplayName.trim()
  if (!trimmed || trimmed === currentDisplayName) {
    return { kind: 'cancel' }
  }
  return { kind: 'save', displayName: trimmed }
}

function isWorktreeTitleTruncated(
  element: Pick<HTMLElement, 'clientWidth' | 'scrollWidth'>
): boolean {
  return element.scrollWidth > element.clientWidth
}

type WorktreeTitleInlineRenameProps = {
  displayName: string
  disabled?: boolean
  showUnreadEmphasis?: boolean
  dimReadTitle?: boolean
  editingPresentation?: 'text' | 'field'
  className?: string
  editingClassName?: string
  inputClassName?: string
  titleWrapper?: (title: React.ReactElement) => React.ReactElement
  wrapTitle?: boolean
  onEditingChange?: (editing: boolean) => void
  onRename: (displayName: string) => Promise<void> | void
  // Why: lets a parent (e.g. the workspace.rename shortcut via WorktreeCard)
  // open the editor imperatively. The parent clears its trigger in
  // onBeginEditingConsumed so the request fires exactly once.
  beginEditing?: boolean
  onBeginEditingConsumed?: () => void
}

export function WorktreeTitleInlineRename({
  displayName,
  disabled = false,
  showUnreadEmphasis = false,
  dimReadTitle = false,
  editingPresentation = 'text',
  className,
  editingClassName,
  inputClassName,
  titleWrapper,
  wrapTitle = false,
  onEditingChange,
  onRename,
  beginEditing = false,
  onBeginEditingConsumed
}: WorktreeTitleInlineRenameProps): React.JSX.Element {
  const editingRef = useRef(false)
  const savingRef = useRef(false)
  const mountedRef = useRef(true)
  const titleElementRef = useRef<HTMLSpanElement | null>(null)
  const titleResizeObserverRef = useRef<ResizeObserver | null>(null)
  const removeTitleResizeListenerRef = useRef<(() => void) | null>(null)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(displayName)
  const [saving, setSaving] = useState(false)
  const [titleTruncated, setTitleTruncated] = useState(false)

  const measureTitleTruncated = (element: HTMLSpanElement | null) => {
    const nextTruncated = element ? isWorktreeTitleTruncated(element) : false
    setTitleTruncated((current) => (current === nextTruncated ? current : nextTruncated))
  }

  const handleRootRef = (node: HTMLSpanElement | null): void => {
    titleResizeObserverRef.current?.disconnect()
    titleResizeObserverRef.current = null
    removeTitleResizeListenerRef.current?.()
    removeTitleResizeListenerRef.current = null

    // Why: rename can resolve after this inline title unmounts; the rendered
    // root owns that stale-write guard without a mount-only Effect.
    mountedRef.current = node !== null
    titleElementRef.current = node
    // Why: wrapped titles render in full and never truncate, so skip the measure +
    // ResizeObserver entirely — for that mode it could only churn unused state.
    if (!node || editingRef.current || wrapTitle) {
      measureTitleTruncated(null)
      return
    }

    measureTitleTruncated(node)
    const updateTitleTruncated = () => measureTitleTruncated(node)
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateTitleTruncated)
      removeTitleResizeListenerRef.current = () =>
        window.removeEventListener('resize', updateTitleTruncated)
      return
    }

    // Why: compact sidebar width changes can make a readable title become
    // clipped; the tooltip should track the rendered geometry, not just text.
    const observer = new ResizeObserver(updateTitleTruncated)
    observer.observe(node)
    titleResizeObserverRef.current = observer
  }

  const titleElementKey = `${displayName}:${showUnreadEmphasis ? 'unread' : 'read'}`
  // Why: the sidebar row needs a text-only editor to avoid layout jumps; the
  // hovercard can use a compact field that reads more like native rename UI.
  const editingInputClassName =
    editingPresentation === 'field'
      ? 'h-6 rounded-sm border border-input bg-input/40 px-1.5 py-0 selection:bg-[Highlight] selection:text-[HighlightText] focus-visible:border-ring dark:bg-input/30'
      : 'h-[1lh] border-0 !border-transparent !bg-transparent p-0 focus-visible:border-transparent focus-visible:outline-none dark:!bg-transparent'
  const savingInputClassName = editingPresentation === 'field' ? 'pr-6' : 'pr-4'
  const savingSpinnerClassName = editingPresentation === 'field' ? 'right-1.5' : 'right-0'

  const setEditingMode = (nextEditing: boolean) => {
    if (editingRef.current === nextEditing) {
      return
    }
    editingRef.current = nextEditing
    if (nextEditing) {
      measureTitleTruncated(null)
    }
    setEditing(nextEditing)
    // Why: the parent card disables drag while renaming; an Effect leaves one draggable commit.
    onEditingChange?.(nextEditing)
  }

  const handleInputRef = (input: HTMLInputElement | null) => {
    if (!input) {
      return
    }
    input.focus()
    // Why: double-click rename should make replacing the workspace title a one-keystroke action.
    input.select()
  }

  // Why: ack the parent's one-shot rename request (the workspace.rename
  // shortcut) exactly once per request, even when the open below is skipped.
  // This effect only calls the parent's callback — never a local setter — so
  // there is no state adjustment for no-adjust-state-on-prop-change to flag.
  // The ref (not the `beginEditing` pulse itself) tracks whether the current
  // request has been acked, so a same-value re-render — including React's
  // Strict Mode remount check — can't ack twice; it resets once the parent
  // clears its trigger so the *next* request is treated as fresh.
  useEffect(() => {
    if (beginEditing) {
      onBeginEditingConsumed?.()
    }
  }, [beginEditing, onBeginEditingConsumed])

  // Why: opening the editor for a beginEditing request reacts to a prop
  // that's already rendered, not state mirroring it — adjusting it here
  // during render (own state only, guarded by the ref below) replaces a
  // synchronous setEditing(true) keyed on a prop with the same idiom React
  // recommends for adjusting state when a prop changes. The ref tracks
  // "opened for this request" independently of the ack ref above, so Strict
  // Mode re-invoking render can't open it twice.
  const [previousBeginEditing, setPreviousBeginEditing] = useState(beginEditing)
  if (beginEditing !== previousBeginEditing) {
    setPreviousBeginEditing(beginEditing)
    if (!disabled && !editing) {
      setValue(displayName)
      setEditing(true)
    }
  }

  const stopCardEvent = (event: React.SyntheticEvent) => {
    event.stopPropagation()
  }

  const startRename = (event: React.MouseEvent<HTMLElement>) => {
    if (disabled) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    setValue(displayName)
    setEditingMode(true)
  }

  const cancelRename = () => {
    setValue(displayName)
    setEditingMode(false)
  }

  const commitRename = async () => {
    if (savingRef.current) {
      return
    }

    const commit = getWorktreeTitleRenameCommit(displayName, value)
    if (commit.kind === 'cancel') {
      cancelRename()
      return
    }

    savingRef.current = true
    setSaving(true)
    try {
      await onRename(commit.displayName)
      if (mountedRef.current) {
        setEditingMode(false)
      }
    } catch (err) {
      if (mountedRef.current) {
        toast.error(
          err instanceof Error
            ? err.message
            : translate(
                'auto.components.sidebar.WorktreeTitleInlineRename.8df295a78d',
                'Failed to rename workspace.'
              )
        )
      }
    } finally {
      savingRef.current = false
      if (mountedRef.current) {
        setSaving(false)
      }
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    // Why: an Enter that only confirms a CJK IME candidate must not commit the
    // rename; wait for a non-composition Enter.
    if (isImeCompositionKeyDown(event)) {
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      void commitRename()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelRename()
    }
  }

  if (editing) {
    return (
      <span
        key={`editing:${titleElementKey}`}
        ref={handleRootRef}
        className={cn(
          'relative grid min-w-0 truncate leading-tight text-foreground',
          showUnreadEmphasis ? 'font-semibold' : 'font-normal',
          className,
          editingClassName
        )}
        data-worktree-title-inline-rename="editing"
      >
        <span
          className="invisible col-start-1 row-start-1 min-w-0 truncate whitespace-pre"
          aria-hidden="true"
        >
          {displayName}
        </span>
        <Input
          ref={handleInputRef}
          value={value}
          style={{ font: 'inherit' }}
          disabled={saving}
          spellCheck={false}
          aria-label={translate(
            'auto.components.sidebar.WorktreeTitleInlineRename.bff3bdd00c',
            'Rename workspace'
          )}
          data-worktree-title-rename-input="true"
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => void commitRename()}
          onClick={stopCardEvent}
          onDoubleClick={stopCardEvent}
          onPointerDown={stopCardEvent}
          onKeyDown={handleKeyDown}
          className={cn(
            'col-start-1 row-start-1 min-w-0 select-text truncate text-foreground outline-none',
            editingInputClassName,
            saving && savingInputClassName,
            inputClassName
          )}
        />
        {saving ? (
          <LoadingIndicator
            className={cn(
              'pointer-events-none absolute top-1/2 size-3 -translate-y-1/2 text-muted-foreground',
              savingSpinnerClassName
            )}
          />
        ) : null}
      </span>
    )
  }

  const titleEmphasisClassName = showUnreadEmphasis
    ? 'font-semibold text-foreground'
    : dimReadTitle
      ? 'font-normal text-foreground/80'
      : 'font-normal text-foreground'

  const title = (
    <span
      key={`title:${titleElementKey}`}
      ref={handleRootRef}
      className={cn(
        'block min-w-0 leading-tight focus-visible:outline-none',
        wrapTitle ? 'break-words whitespace-normal' : 'truncate',
        titleEmphasisClassName,
        className
      )}
      data-worktree-title-inline-rename=""
      onDoubleClick={startRename}
      tabIndex={disabled ? undefined : 0}
    >
      {/* Why: visible text alone misses the unread state for assistive tech. */}
      {showUnreadEmphasis && (
        <span className="sr-only">
          {translate('auto.components.sidebar.WorktreeTitleInlineRename.2f42ae024f', 'Unread:')}
        </span>
      )}
      {displayName}
    </span>
  )

  if (titleWrapper) {
    return titleWrapper(title)
  }

  if (wrapTitle || !titleTruncated) {
    return title
  }

  return (
    <Tooltip>
      <TooltipTrigger render={title} />
      <TooltipContent side="right" sideOffset={8}>
        {displayName}
      </TooltipContent>
    </Tooltip>
  )
}
