import type { ReactElement } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { DeviceMobile as Smartphone, Globe } from '~renderer/icons/hugeicons'
import type { DriverState } from '~renderer/terminal-pane/pane-manager/mobile-driver-state'
import type { FitHoldMode } from '~renderer/terminal-pane/pane-manager/mobile-fit-overrides'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import {
  createMobileDriverOverlayCollapseState,
  getMobileDriverOverlayCollapseState
} from './mobile-driver-overlay-collapse'
import { shouldFocusMobileDriverAction } from './mobile-driver-overlay-focus'

type Props = {
  driver: DriverState
  fitMode: FitHoldMode | null
  onAction: () => void | Promise<void>
  onAllAction?: () => void | Promise<void>
  /** Optional class applied to the rendered root. */
  rootClassName?: string
}

// Why: see docs/mobile-presence-lock.md. Driving state preserves output streaming
// so the chip mode lets users keep watching; held-fit state has no live output to
// preserve, so it stays loud until Restore. Remote viewport ownership uses the
// same loud-to-chip path so every viewport handoff has one visual language.
export function MobileDriverOverlay({
  driver,
  fitMode,
  onAction,
  onAllAction,
  rootClassName
}: Props): ReactElement | null {
  const isMobileDriving = driver.kind === 'mobile'
  const isHeldAtPhoneFit = !isMobileDriving && fitMode === 'mobile-fit'
  const isRemoteDesktopFit = !isMobileDriving && fitMode === 'remote-desktop-fit'
  const driverClientId = driver.kind === 'mobile' ? driver.clientId : null

  const [collapseState, setCollapseState] = useState(() =>
    createMobileDriverOverlayCollapseState(driverClientId)
  )
  const [actionPending, setActionPending] = useState(false)
  const [allActionPending, setAllActionPending] = useState(false)
  const mountedRef = useRef(false)

  const setOverlayRootRef = (node: HTMLDivElement | null): void => {
    mountedRef.current = node !== null
    if (node) {
      // Why: take-back/restore can resolve after the overlay renders null; a
      // later mobile session must not inherit stale disabled state.
      setActionPending(false)
      setAllActionPending(false)
    }
  }

  const currentCollapseState = getMobileDriverOverlayCollapseState(collapseState, driverClientId)
  // Why: a new mobile actor must be loud even if the prior driver was collapsed.
  if (currentCollapseState !== collapseState) {
    setCollapseState(currentCollapseState)
  }
  const collapsed = currentCollapseState.collapsed

  if (!isMobileDriving && !isHeldAtPhoneFit && !isRemoteDesktopFit) {
    return null
  }

  const handleAction = async (): Promise<void> => {
    if (actionPending || allActionPending) {
      return
    }
    setActionPending(true)
    try {
      await onAction()
    } finally {
      if (mountedRef.current) {
        setActionPending(false)
      }
    }
  }

  const handleAllAction = async (): Promise<void> => {
    if (!onAllAction || actionPending || allActionPending) {
      return
    }
    setAllActionPending(true)
    try {
      await onAllAction()
    } finally {
      if (mountedRef.current) {
        setAllActionPending(false)
      }
    }
  }

  if (isRemoteDesktopFit && collapsed) {
    return (
      <LockChip
        actionPending={actionPending}
        actionLabel={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.9d8ce04a71',
          'Use workbench size'
        )}
        icon="web"
        label={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.bc65bdf1a2',
          'Terminal fitted to Web'
        )}
        onAction={handleAction}
        onExpand={() => setCollapseState(createMobileDriverOverlayCollapseState(driverClientId))}
        rootRef={setOverlayRootRef}
        rootClassName={rootClassName}
      />
    )
  }

  if (isRemoteDesktopFit) {
    return (
      <LoudOverlay
        eyebrow={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.e4af713b2c',
          'From Web'
        )}
        title={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.bc65bdf1a2',
          'Terminal fitted to Web'
        )}
        body={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.94fe1c7b6a',
          'Another browser is using this terminal at its window size. Switch to this workbench size, or collapse to keep watching.'
        )}
        actionLabel={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.9d8ce04a71',
          'Use workbench size'
        )}
        actionPending={actionPending}
        icon="web"
        onAction={handleAction}
        onCollapse={() => setCollapseState({ driverClientId, collapsed: true })}
        tone="driving"
        rootRef={setOverlayRootRef}
        rootClassName={rootClassName}
      />
    )
  }

  if (isHeldAtPhoneFit) {
    return (
      <LoudOverlay
        eyebrow={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.f2a8b9c1d3',
          'From your phone'
        )}
        title={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.faa367dc74',
          'Your phone left this at phone size'
        )}
        body={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.a6b1d8f3e2',
          'Your phone session ended. Restore this terminal to the workbench size, or restore every terminal your phone left at phone size.'
        )}
        actionLabel={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.b3d8e1f42a',
          'Restore this terminal'
        )}
        actionPending={actionPending}
        allActionLabel={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.e8c4f2a91b',
          'Restore all terminals'
        )}
        allActionPending={allActionPending}
        icon="phone"
        onAction={handleAction}
        onAllAction={onAllAction ? handleAllAction : undefined}
        tone="held"
        rootRef={setOverlayRootRef}
        rootClassName={rootClassName}
      />
    )
  }

  if (collapsed) {
    return (
      <LockChip
        actionPending={actionPending}
        actionLabel={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.c6460cf584',
          'Take back'
        )}
        icon="phone"
        label={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.c44659e09f',
          'Phone driving'
        )}
        onAction={handleAction}
        onExpand={() => setCollapseState(createMobileDriverOverlayCollapseState(driverClientId))}
        rootRef={setOverlayRootRef}
        rootClassName={rootClassName}
      />
    )
  }

  return (
    <LoudOverlay
      eyebrow={translate(
        'auto.components.terminal.pane.MobileDriverOverlay.f2a8b9c1d3',
        'From your phone'
      )}
      title={translate(
        'auto.components.terminal.pane.MobileDriverOverlay.c7e4a2b8f1',
        'Your phone is in control'
      )}
      body={translate(
        'auto.components.terminal.pane.MobileDriverOverlay.d9f3c6e2a4',
        'Workbench keyboard is paused. Take back this terminal to type here, take back all terminals your phone controls, or collapse to keep watching.'
      )}
      actionLabel={translate(
        'auto.components.terminal.pane.MobileDriverOverlay.c8f2e1a4b9',
        'Take back this terminal'
      )}
      actionPending={actionPending}
      allActionLabel={translate(
        'auto.components.terminal.pane.MobileDriverOverlay.54f7d6f69d',
        'Take back all terminals'
      )}
      allActionPending={allActionPending}
      icon="phone"
      onAction={handleAction}
      onAllAction={onAllAction ? handleAllAction : undefined}
      onCollapse={() => setCollapseState({ driverClientId, collapsed: true })}
      tone="driving"
      rootRef={setOverlayRootRef}
      rootClassName={rootClassName}
    />
  )
}

type LoudOverlayProps = {
  eyebrow: string
  title: string
  body: string
  actionLabel: string
  actionPending: boolean
  allActionLabel?: string
  allActionPending?: boolean
  icon: 'phone' | 'web'
  onAction: () => void | Promise<void>
  onAllAction?: () => void | Promise<void>
  onCollapse?: () => void
  tone: 'driving' | 'held'
  rootRef?: (node: HTMLDivElement | null) => void
  rootClassName?: string
}

function LoudOverlay({
  eyebrow,
  title,
  body,
  actionLabel,
  actionPending,
  allActionLabel,
  allActionPending = false,
  icon,
  onAction,
  onAllAction,
  onCollapse,
  tone,
  rootRef: outerRootRef,
  rootClassName
}: LoudOverlayProps): ReactElement {
  const titleId = useId()
  const bodyId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const actionRef = useRef<HTMLButtonElement>(null)
  const setRootRef = (node: HTMLDivElement | null): void => {
    rootRef.current = node
    outerRootRef?.(node)
  }
  // Why: focus the recovery action on mount only when the user isn't already
  // typing into another input (composer, command palette, settings field).
  // Unconditional autoFocus yanks focus on every overlay mount, so a phone
  // taking the floor while the desktop user is typing elsewhere would route
  // the next Space/Enter into Take back / Restore. See PR #1899 follow-up.
  useEffect(() => {
    const paneScope = rootRef.current?.parentElement
    if (shouldFocusMobileDriverAction(document.activeElement, document.body, paneScope)) {
      actionRef.current?.focus()
    }
  }, [])
  // Why: terminal output is still useful status while mobile owns input, so the
  // lock UI must not add a pane-wide scrim or blur over the live stream.
  return (
    <div
      ref={setRootRef}
      role="dialog"
      aria-live="assertive"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className={cn(
        'pointer-events-none absolute inset-0 z-50 flex items-center justify-center p-6',
        rootClassName
      )}
    >
      <div className="border-border bg-card text-card-foreground pointer-events-auto flex w-full max-w-[30rem] flex-col gap-3 rounded-lg border p-6 pb-5">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full border border-border',
              tone === 'driving' ? 'bg-muted' : 'bg-muted/60'
            )}
          >
            {icon === 'web' ? (
              <Globe className="text-foreground size-5" aria-hidden="true" />
            ) : (
              <Smartphone className="text-foreground size-5" aria-hidden="true" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div
              className={cn(
                'flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide',
                tone === 'driving' ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {tone === 'driving' ? (
                <span aria-hidden="true" className="bg-foreground size-1.5 rounded-full" />
              ) : null}
              <span>{eyebrow}</span>
            </div>
            <div id={titleId} className="text-base leading-tight font-semibold">
              {title}
            </div>
          </div>
        </div>
        <div id={bodyId} className="text-muted-foreground text-sm leading-relaxed">
          {body}
        </div>
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          {onCollapse && (
            <Button type="button" variant="outline" size="sm" onClick={onCollapse}>
              {translate(
                'auto.components.terminal.pane.MobileDriverOverlay.7cffad954c',
                'Collapse'
              )}
            </Button>
          )}
          {onAllAction && allActionLabel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAllAction}
              disabled={actionPending || allActionPending}
            >
              {allActionLabel}
            </Button>
          ) : null}
          {/* Focus is moved to this button only when no user input is active; see effect above. */}
          <Button
            ref={actionRef}
            type="button"
            variant="default"
            size="sm"
            onClick={onAction}
            disabled={actionPending || allActionPending}
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

type ChipProps = {
  actionPending: boolean
  actionLabel: string
  icon: 'phone' | 'web'
  label: string
  onAction: () => void | Promise<void>
  onExpand?: () => void
  rootRef?: (node: HTMLDivElement | null) => void
  rootClassName?: string
}

function LockChip({
  actionPending,
  actionLabel,
  icon,
  label,
  onAction,
  onExpand,
  rootRef,
  rootClassName
}: ChipProps): ReactElement {
  return (
    <div
      ref={rootRef}
      aria-live="polite"
      className={cn(
        'absolute right-2 top-2 z-50 flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1 text-xs font-medium text-card-foreground',
        rootClassName
      )}
    >
      {icon === 'web' ? (
        <Globe className="text-foreground size-3" aria-hidden="true" />
      ) : (
        <Smartphone className="text-foreground size-3" aria-hidden="true" />
      )}
      {onExpand ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="px-1 font-medium"
          onClick={onExpand}
        >
          {label}
        </Button>
      ) : (
        <span className="px-1">{label}</span>
      )}
      <Button type="button" variant="default" size="xs" onClick={onAction} disabled={actionPending}>
        {actionLabel}
      </Button>
    </div>
  )
}
