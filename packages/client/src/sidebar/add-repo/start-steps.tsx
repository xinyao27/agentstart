import { useEffect, useRef, useState, type ComponentType, type ReactNode, type Ref } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { StopCircle as CircleStop } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { DialogDescription, DialogHeader, DialogTitle } from '~renderer/ui/dialog'
import { ShortcutKeyCombo } from '~renderer/ui/shortcut-key-combo'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { getAddRepoLocalStartActions } from './local-start-actions'

type AddRepoNestedScanProgressNoticeProps = {
  busyLabel: string
  nestedScanInProgress: boolean
  nestedScanId: string | null
  onStopNestedScan: () => void
}

function AddRepoNestedScanProgressNotice({
  busyLabel,
  nestedScanInProgress,
  nestedScanId,
  onStopNestedScan
}: AddRepoNestedScanProgressNoticeProps): React.JSX.Element {
  return (
    <div className="border-border bg-muted text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
      <LoadingIndicator className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{busyLabel}</span>
      {nestedScanInProgress && nestedScanId ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="group text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive"
                aria-label={translate(
                  'auto.components.sidebar.AddRepoStartSteps.9906cae183',
                  'Stop scan'
                )}
                title={translate(
                  'auto.components.sidebar.AddRepoStartSteps.69ea7f8dc4',
                  'Stop scanning'
                )}
                onClick={onStopNestedScan}
              >
                <LoadingIndicator className="text-annotation-highlight size-3.5 group-hover:hidden group-focus-visible:hidden" />
                <CircleStop className="hidden size-3.5 group-hover:block group-focus-visible:block" />
              </Button>
            }
          />
          <TooltipContent side="top" sideOffset={4}>
            {translate(
              'auto.components.sidebar.AddRepoStartSteps.d301db1c9a',
              'Scanning repositories. Click to stop.'
            )}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

type AddRepoLocalStartStepProps = {
  repoCount: number
  isAdding: boolean
  addProjectBusyLabel: string | null
  nestedScanInProgress: boolean
  nestedScanId: string | null
  hostSelector?: ReactNode
  canCreateProject?: boolean
  browseHostKind?: 'local' | 'runtime'
  onBrowse: () => void
  onOpenCloneStep: () => void
  onOpenCreateStep: () => void
  onStopNestedScan: () => void
}

export function AddRepoLocalStartStep({
  repoCount,
  isAdding,
  addProjectBusyLabel,
  nestedScanInProgress,
  nestedScanId,
  hostSelector,
  canCreateProject = true,
  browseHostKind = 'local',
  onBrowse,
  onOpenCloneStep,
  onOpenCreateStep,
  onStopNestedScan
}: AddRepoLocalStartStepProps): React.JSX.Element {
  const browseActionRef = useRef<HTMLButtonElement | null>(null)
  const actionsRef = useRef<HTMLDivElement | null>(null)
  const { primaryAction, secondaryActions } = getAddRepoLocalStartActions({
    onBrowse,
    onOpenCloneStep,
    onOpenCreateStep,
    canCreateProject,
    browseHostKind
  })

  // The white fill + ⏎ chip is a roving selection indicator, not a fixed "primary" badge:
  // it follows keyboard focus so Enter always activates the highlighted action. Browse is
  // autofocused on open, so it starts selected; Tab and ↑/↓ move the highlight.
  const [selectedKind, setSelectedKind] = useState<string | null>(primaryAction.kind)

  useEffect(() => {
    if (!isAdding) {
      browseActionRef.current?.focus()
    }
  }, [isAdding])
  const displayedSelectedKind = isAdding ? null : selectedKind

  // ↑/↓ rove focus across the action buttons in visual order; focus drives the selection.
  const handleArrowNavigation = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return
    }
    const buttons = Array.from(
      actionsRef.current?.querySelectorAll<HTMLButtonElement>('button[data-add-repo-action]') ?? []
    )
    if (buttons.length === 0) {
      return
    }
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const delta = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = (currentIndex + delta + buttons.length) % buttons.length
    event.preventDefault()
    buttons[nextIndex]?.focus()
  }

  const handleActionsBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
    if (!(event.relatedTarget instanceof HTMLButtonElement)) {
      setSelectedKind(null)
      return
    }
    if (!event.relatedTarget.matches('button[data-add-repo-action]')) {
      setSelectedKind(null)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {translate('auto.components.sidebar.AddRepoStartSteps.d13757911c', 'Add a project')}
        </DialogTitle>
        {repoCount === 0 ? (
          <DialogDescription>
            {translate(
              'auto.components.sidebar.AddRepoStartSteps.acf895cb42',
              'Add a project to get started with AgentStart.'
            )}
          </DialogDescription>
        ) : null}
      </DialogHeader>

      <div
        className="space-y-3 pt-2"
        ref={actionsRef}
        onBlur={handleActionsBlur}
        onKeyDown={handleArrowNavigation}
      >
        {hostSelector}
        <AddRepoPrimaryStartAction
          icon={primaryAction.icon}
          title={primaryAction.title}
          description={primaryAction.description}
          disabled={isAdding}
          selected={displayedSelectedKind === primaryAction.kind}
          buttonRef={browseActionRef}
          onClick={primaryAction.onClick}
          onFocus={() => setSelectedKind(primaryAction.kind)}
        />

        {/* Keep secondary entry methods always visible so they stay discoverable without an extra click. */}
        {/* Label clarifies the lighter-weight rows are alternate entry methods, not lesser features. */}
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            {translate('auto.components.sidebar.AddRepoStartSteps.87596c1446', 'Other ways to add')}
          </p>
          {/* Outline uses the `input` token (white-ish in dark mode) to match Browse's visible outline variant;
              primary-foreground is near-black in dark mode and rendered the border invisible. */}
          <div className="border-input bg-background overflow-hidden rounded-md border">
            {secondaryActions.map((action, index) => (
              <AddRepoSecondaryStartAction
                key={action.kind}
                icon={action.icon}
                title={action.title}
                description={action.description}
                disabled={isAdding || Boolean(action.disabled)}
                selected={displayedSelectedKind === action.kind}
                onClick={action.onClick}
                onFocus={() => setSelectedKind(action.kind)}
                className={cn(
                  index === 0 ? '' : 'border-t border-border/70',
                  index === secondaryActions.length - 1 && ''
                )}
              />
            ))}
          </div>
        </div>

        {isAdding && addProjectBusyLabel ? (
          <AddRepoNestedScanProgressNotice
            busyLabel={addProjectBusyLabel}
            nestedScanInProgress={nestedScanInProgress}
            nestedScanId={nestedScanId}
            onStopNestedScan={onStopNestedScan}
          />
        ) : null}
      </div>
    </>
  )
}

type AddRepoStartActionProps = {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  disabled: boolean
  // Selected = keyboard-focused: renders the selection wash + trailing ⏎ chip so Enter's target is obvious.
  selected: boolean
  onClick: () => void
  onFocus: () => void
  buttonRef?: Ref<HTMLButtonElement>
}

// Shared trailing chip so the ⏎ glyph travels with the selected action across primary and secondary rows.
const AddRepoEnterChip = (): React.JSX.Element => (
  <span aria-hidden="true" className="shrink-0">
    <ShortcutKeyCombo
      keys={['⏎']}
      keyCapClassName="border-border/80 bg-background/70 text-muted-foreground"
    />
  </span>
)

const AddRepoPrimaryStartAction = ({
  icon: Icon,
  title,
  description,
  disabled,
  selected,
  onClick,
  onFocus,
  buttonRef
}: AddRepoStartActionProps): React.JSX.Element => (
  // A neutral wash marks the roving keyboard selection without making the row
  // read like the committed primary action.
  <Button
    ref={buttonRef}
    type="button"
    variant="ghost"
    onClick={onClick}
    onFocus={onFocus}
    disabled={disabled}
    data-add-repo-action
    className={cn(
      'h-auto min-h-[3.75rem] w-full justify-start gap-3 whitespace-normal px-3 py-2.5 text-left',
      selected
        ? 'border border-ring bg-foreground/10 text-foreground focus-visible:border-ring dark:bg-accent dark:text-accent-foreground'
        : 'border border-border bg-background dark:bg-background'
    )}
  >
    <span
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-md',
        selected ? 'bg-background/70 text-accent-foreground' : 'text-foreground'
      )}
    >
      <Icon className="size-4" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm leading-5 font-medium">{title}</span>
      <span className="text-muted-foreground mt-0.5 block text-xs leading-5 font-normal">
        {description}
      </span>
    </span>
    {selected ? <AddRepoEnterChip /> : null}
  </Button>
)

function AddRepoSecondaryStartAction({
  icon: Icon,
  title,
  description,
  disabled,
  selected,
  onClick,
  onFocus,
  className
}: AddRepoStartActionProps & { className?: string }): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="default"
      type="button"
      data-add-repo-action
      disabled={disabled}
      onClick={onClick}
      onFocus={onFocus}
      className={cn(
        'flex h-auto min-h-[3.25rem] w-full justify-start gap-3 whitespace-normal px-3 py-2.5 text-left transition-colors focus-visible:bg-accent disabled:cursor-default disabled:opacity-40',
        className,
        // Selected mirrors the primary card's neutral wash so the highlight moves between rows.
        selected
          ? 'border-ring bg-foreground/10 text-foreground dark:bg-accent dark:text-accent-foreground'
          : ''
      )}
    >
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-md ',
          selected ? 'bg-background/70 text-accent-foreground' : 'text-muted-foreground'
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-sm font-medium leading-5',
            selected ? 'text-accent-foreground' : 'text-foreground'
          )}
        >
          {title}
        </span>
        <span className="text-muted-foreground block text-xs leading-4">{description}</span>
      </span>
      {selected ? <AddRepoEnterChip /> : null}
    </Button>
  )
}
