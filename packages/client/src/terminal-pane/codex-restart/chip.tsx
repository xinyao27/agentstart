import { useEffect, useId, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { translate } from '~renderer/i18n/i18n'
import { ArrowClockwise as RefreshCw } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'

import { useAppStore } from '../../store/state'
import { shouldFocusMobileDriverAction } from '../mobile-driver-overlay-focus'
import { selectCodexRestartInputs } from './inputs'
import { buildCodexRestartNoticeKey } from './notice-key'

const EMPTY_TABS: { id: string }[] = []

function collectStalePtyIdsForTabs({
  tabs,
  ptyIdsByTabId,
  codexRestartNoticeByPtyId
}: {
  tabs: { id: string }[]
  ptyIdsByTabId: Record<string, string[]>
  codexRestartNoticeByPtyId: Record<string, unknown>
}): string[] {
  return tabs.flatMap((tab) =>
    (ptyIdsByTabId[tab.id] ?? []).filter((ptyId) => Boolean(codexRestartNoticeByPtyId[ptyId]))
  )
}

function isInsideHiddenTree(element: HTMLElement): boolean {
  return element.closest('[aria-hidden="true"], [hidden], [inert]') !== null
}

type RestartNotice = {
  previousAccountLabel: string
  nextAccountLabel: string
}

export default function CodexRestartChip({
  isVisible = true,
  worktreeId
}: {
  isVisible?: boolean
  worktreeId: string
}): React.JSX.Element | null {
  const tabs = useAppStore((s) => s.tabsByWorktree[worktreeId] ?? EMPTY_TABS)
  // Why: both of these maps churn on unrelated pty lifecycle events (ptyIdsByTabId
  // on attach/detach; codexRestartNoticeByPtyId is re-spread even when empty on
  // pty teardown), so subscribe to them only while a restart notice actually
  // exists. Otherwise this per-worktree chip re-rendered on every pty event to
  // compute "no notice → render nothing". See codex-restart-chip-inputs.
  const { ptyIdsByTabId, codexRestartNoticeByPtyId } = useAppStore(
    useShallow(selectCodexRestartInputs)
  )
  const staleWorktreePtyIds = (() =>
    collectStalePtyIdsForTabs({
      tabs,
      ptyIdsByTabId,
      codexRestartNoticeByPtyId
    }))()
  const restartNotice = staleWorktreePtyIds[0]
    ? codexRestartNoticeByPtyId[staleWorktreePtyIds[0]]
    : undefined
  const queueCodexPaneRestarts = useAppStore((s) => s.queueCodexPaneRestarts)

  const noticeKey = restartNotice ? buildCodexRestartNoticeKey(restartNotice) : null

  if (staleWorktreePtyIds.length === 0 || !restartNotice) {
    return null
  }

  const handleRestart = (): void => {
    queueCodexPaneRestarts(staleWorktreePtyIds)
  }

  return (
    <LoudRestartOverlay
      isVisible={isVisible}
      noticeKey={noticeKey}
      restartNotice={restartNotice}
      onRestart={handleRestart}
    />
  )
}

function LoudRestartOverlay({
  isVisible,
  noticeKey,
  restartNotice,
  onRestart
}: {
  isVisible: boolean
  noticeKey: string | null
  restartNotice: RestartNotice
  onRestart: () => void
}): React.JSX.Element {
  const titleId = useId()
  const bodyId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const restartRef = useRef<HTMLButtonElement>(null)

  // Why: focus Restart only when the user isn't typing elsewhere; unconditional
  // autoFocus would steal keys from an active composer or terminal input.
  useEffect(() => {
    if (!isVisible) {
      return
    }
    const root = rootRef.current
    if (!root || isInsideHiddenTree(root)) {
      return
    }
    const paneScope = root.parentElement
    if (shouldFocusMobileDriverAction(document.activeElement, document.body, paneScope)) {
      restartRef.current?.focus()
    }
  }, [isVisible, noticeKey])

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-live="assertive"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center p-6"
    >
      <div className="border-border bg-card text-card-foreground pointer-events-auto flex w-full max-w-[30rem] flex-col gap-3 rounded-lg border p-6 pb-5">
        <div className="flex items-start gap-3">
          <div className="border-border bg-muted flex size-10 shrink-0 items-center justify-center rounded-full border">
            <RefreshCw className="text-foreground size-5" aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="text-foreground text-xs font-medium tracking-wide uppercase">
              {translate('auto.components.CodexRestartChip.d3e8a1f4b2', 'Account switched')}
            </div>
            <div id={titleId} className="text-base leading-tight font-semibold">
              {translate(
                'auto.components.CodexRestartChip.a4c8e1b2f7',
                'Codex is still signed in as {{value0}}',
                { value0: restartNotice.previousAccountLabel }
              )}
            </div>
          </div>
        </div>
        <div id={bodyId} className="text-muted-foreground text-sm leading-relaxed">
          {translate(
            'auto.components.CodexRestartChip.e9b2c7d1a5',
            'Restart this session to use {{value0}}.',
            { value0: restartNotice.nextAccountLabel }
          )}
        </div>
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <Button ref={restartRef} type="button" variant="default" size="sm" onClick={onRestart}>
            <RefreshCw />
            {translate('auto.components.CodexRestartChip.c72a5fb234', 'Restart')}
          </Button>
        </div>
      </div>
    </div>
  )
}
