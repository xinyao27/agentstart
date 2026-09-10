import React, { useEffect, useState } from 'react'
import type { AgentSendPopoverTargetMode } from '~renderer/application-shell/state/slice'
import { translate } from '~renderer/i18n/i18n'
import { PaperPlaneRight as Send, Sparkle as Sparkles } from '~renderer/icons/hugeicons'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { ReviewNotesSendMenuContent } from './review-notes-send-menu-content'

const ENABLED_SEND_TOOLTIP = 'Send notes to an agent'

export type NotesSendMenuScope<TNote> = {
  id: string
  label: string
  notes: readonly TNote[]
  prompt: string
}

export type NotesSendMenuProps<TNote> = {
  worktreeId: string
  groupId: string
  modeIdParts: readonly string[]
  scopes: readonly NotesSendMenuScope<TNote>[]
  defaultScopeId?: string
  source?: AgentSendPopoverTargetMode['source']
  targetModeLabel?: string
  triggerClassName?: string
  triggerLabel?: string
  triggerCount?: number
  actionLabel?: string
  disabledTooltip?: string
  iconClassName?: string
  align?: 'start' | 'center' | 'end'
  openRequestNonce?: number | null
  onOpenRequestHandled?: () => void
  onDelivered: (notes: readonly TNote[]) => void
}

function buildNotesSendTargetModeId(modeIdParts: readonly string[]): string {
  // Why: length-prefixing preserves part boundaries even when paths or ids
  // contain the separator, keeping unrelated note send targets distinct.
  return `note-send:${modeIdParts.map((part) => `${part.length}:${part}`).join('|')}`
}

export function NotesSendMenu<TNote>({
  worktreeId,
  groupId,
  modeIdParts,
  scopes,
  defaultScopeId,
  source = 'diff-notes',
  targetModeLabel,
  triggerClassName,
  triggerLabel,
  triggerCount,
  actionLabel,
  disabledTooltip = 'All notes sent',
  iconClassName = 'size-3.5',
  align = 'end',
  openRequestNonce = null,
  onOpenRequestHandled,
  onDelivered
}: NotesSendMenuProps<TNote>): React.JSX.Element {
  const openAgentSendPopoverTargetMode = useAppStore((s) => s.openAgentSendPopoverTargetMode)
  const closeAgentSendPopoverTargetMode = useAppStore((s) => s.closeAgentSendPopoverTargetMode)
  const activeTargetModeId = useAppStore((s) => s.agentSendPopoverTargetMode?.id ?? null)
  const [sendMenuOpen, setSendMenuOpen] = useState(false)
  const [menuForcedOpenNonce, setMenuForcedOpenNonce] = useState<number | null>(null)
  const targetModeId = (() => buildNotesSendTargetModeId(modeIdParts))()
  const enabledScopes = (() => scopes.filter((scope) => scope.notes.length > 0))()
  const defaultScope = (() => {
    const requested = enabledScopes.find((scope) => scope.id === defaultScopeId)
    return requested ?? enabledScopes[0] ?? null
  })()
  const hasDeliverableNotes = enabledScopes.length > 0

  const markDelivered = (notes: readonly TNote[]) => {
    onDelivered(notes)
  }

  const openTargetMode = useEventCallback((scope: NotesSendMenuScope<TNote>) => {
    if (scope.notes.length === 0) {
      return
    }
    openAgentSendPopoverTargetMode({
      id: targetModeId,
      worktreeId,
      source,
      prompt: scope.prompt,
      label: targetModeLabel ?? scope.label,
      launchSource: 'notes_send',
      onPromptDelivered: () => markDelivered(scope.notes)
    })
  })

  const handleOpenChange = (
    open: boolean,
    eventDetails: { reason?: string; event?: Event; cancel: () => void }
  ) => {
    // Why: keep the menu open when the outside press lands on another agent
    // send target, matching the prior onInteractOutside/onPointerDownOutside guard.
    if (
      !open &&
      eventDetails.reason === 'outside-press' &&
      shouldKeepAgentSendMenuOpen(eventDetails.event)
    ) {
      eventDetails.cancel()
      return
    }
    setSendMenuOpen(open)
    if (open) {
      if (defaultScope) {
        openTargetMode(defaultScope)
      }
    } else {
      closeAgentSendPopoverTargetMode(targetModeId)
    }
  }

  const effectiveSendMenuOpen = sendMenuOpen && activeTargetModeId === targetModeId
  if (sendMenuOpen && activeTargetModeId !== targetModeId) {
    // Why: avoid rendering a stale menu for one paint after another send target
    // wins; the local open bit is only meaningful while this target is active.
    setSendMenuOpen(false)
  }

  // Why: force the menu open exactly once per open-request nonce — mirrors the
  // stale-menu adjustment above rather than an effect setting a constant flag.
  if (
    openRequestNonce !== null &&
    openRequestNonce !== menuForcedOpenNonce &&
    hasDeliverableNotes &&
    defaultScope
  ) {
    setMenuForcedOpenNonce(openRequestNonce)
    setSendMenuOpen(true)
  }

  useEffect(
    () => () => {
      closeAgentSendPopoverTargetMode(targetModeId)
    },
    [closeAgentSendPopoverTargetMode, targetModeId]
  )

  useEffect(() => {
    if (openRequestNonce === null) {
      return
    }
    // Why: consume even an undeliverable request so remounts cannot replay it.
    if (hasDeliverableNotes && defaultScope) {
      openTargetMode(defaultScope)
    }
    onOpenRequestHandled?.()
  }, [defaultScope, hasDeliverableNotes, onOpenRequestHandled, openRequestNonce, openTargetMode])

  return (
    <DropdownMenu modal={false} open={effectiveSendMenuOpen} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  variant="quiet"
                  size="xs"
                  type="button"
                  className={cn(
                    'p-0 h-auto border-0 ',
                    ' disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground',
                    triggerClassName
                  )}
                  disabled={!hasDeliverableNotes}
                  title={hasDeliverableNotes ? ENABLED_SEND_TOOLTIP : disabledTooltip}
                  aria-label={
                    triggerLabel
                      ? translate(
                          'auto.components.editor.NotesSendMenu.433928cd9f',
                          'Send {{value0}} to an agent',
                          { value0: triggerLabel }
                        )
                      : ENABLED_SEND_TOOLTIP
                  }
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  {triggerLabel ? (
                    <>
                      <Sparkles className="text-primary size-3" />
                      <span className="whitespace-nowrap">{triggerLabel}</span>
                      {triggerCount !== undefined ? (
                        <span className="bg-background/80 text-muted-foreground rounded-full px-1 text-[10px] tabular-nums">
                          {triggerCount}
                        </span>
                      ) : null}
                      <span className="bg-border/70 mx-0.5 h-3 w-px" aria-hidden />
                    </>
                  ) : null}
                  <Send className={iconClassName} />
                  {actionLabel ? <span className="whitespace-nowrap">{actionLabel}</span> : null}
                </Button>
              }
            />
          }
        />
        <TooltipContent side="bottom" sideOffset={6}>
          {hasDeliverableNotes ? ENABLED_SEND_TOOLTIP : disabledTooltip}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align={align} className="min-w-[220px]">
        {scopes.length > 1 ? (
          <>
            <DropdownMenuLabel>
              {translate('auto.components.editor.NotesSendMenu.44dc5e60a6', 'Send notes')}
            </DropdownMenuLabel>
            {scopes.map((scope) => (
              <DropdownMenuSub key={scope.id}>
                <DropdownMenuSubTrigger
                  disabled={scope.notes.length === 0}
                  className="[&>svg:last-child]:ml-0"
                  onPointerEnter={() => openTargetMode(scope)}
                  onFocus={() => openTargetMode(scope)}
                >
                  <NoteScopeMenuRow label={scope.label} count={scope.notes.length} />
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-[180px]">
                  <ReviewNotesSendMenuContent
                    worktreeId={worktreeId}
                    groupId={groupId}
                    prompt={scope.prompt}
                    promptDelivery="submit-after-ready"
                    launchSource="notes_send"
                    onPromptDelivered={() => markDelivered(scope.notes)}
                  />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </>
        ) : (
          <ReviewNotesSendMenuContent
            worktreeId={worktreeId}
            groupId={groupId}
            prompt={defaultScope?.prompt ?? ''}
            promptDelivery="submit-after-ready"
            launchSource="notes_send"
            onPromptDelivered={() => {
              if (defaultScope) {
                markDelivered(defaultScope.notes)
              }
            }}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function shouldKeepAgentSendMenuOpen(event: Event | undefined): boolean {
  const target = event?.target
  if (!(target instanceof Element)) {
    return false
  }
  return Boolean(
    target.closest(
      '[data-agent-send-target="eligible"], [data-agent-send-target="disabled"], [data-agent-send-target="sending"]'
    )
  )
}

function NoteScopeMenuRow({ label, count }: { label: string; count: number }): React.JSX.Element {
  return (
    <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <span className="truncate">{label}</span>
      <span className="text-muted-foreground text-[11px] tabular-nums">{count}</span>
    </span>
  )
}
