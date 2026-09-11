import { useRef } from 'react'
import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useShortcutLabel } from '~renderer/keyboard-input/use-shortcut-label'
import { cn } from '~renderer/ui/class-names'

import { FeatureWallClickRing } from './click-ring'
import { useFakeCursor } from './use-fake-cursor'
import { useWorkbenchStoryboard } from './use-workbench-storyboard'
import { ContextMenu, CursorIcon } from './workbench-context-menu'
import { KBD_CLASS, RUN_QUEUE } from './workbench-storyboard-types'
import {
  ClaudeChecklistPane,
  PlaywrightPane,
  Prompt,
  RightPaneScrollback,
  TermLine
} from './workbench-terminal-scene'

type WorkbenchAnimatedVisualVariant = 'tour' | 'two-agents-checklist'

export function WorkbenchAnimatedVisual(props: {
  reducedMotion: boolean
  variant?: WorkbenchAnimatedVisualVariant
}): JSX.Element {
  return <WorkbenchAnimation key={`${props.reducedMotion}:${props.variant ?? 'tour'}`} {...props} />
}

function WorkbenchAnimation(props: {
  reducedMotion: boolean
  variant?: WorkbenchAnimatedVisualVariant
}): JSX.Element {
  const { reducedMotion, variant = 'tour' } = props
  const isTwoAgentsChecklist = variant === 'two-agents-checklist'
  const splitRightShortcutLabel = useShortcutLabel('terminal.splitRight')
  const splitDownShortcutLabel = useShortcutLabel('terminal.splitDown')
  const panelRef = useRef<HTMLDivElement | null>(null)
  const leftPaneRef = useRef<HTMLDivElement | null>(null)
  const splitRowRef = useRef<HTMLDivElement | null>(null)
  const setSplitRow = (node: HTMLDivElement | null): void => {
    splitRowRef.current = node
  }
  const {
    cursorTarget,
    phase,
    promptGlyph,
    rightLines,
    rightTyped,
    rippleKey,
    runIdx,
    showCaret,
    showInputLine
  } = useWorkbenchStoryboard({ isTwoAgentsChecklist, reducedMotion })

  const cursor = useFakeCursor(panelRef, leftPaneRef, splitRowRef, cursorTarget, reducedMotion)

  const splitOpen =
    phase.kind === 'menu-click' || phase.kind === 'split-empty' || phase.kind === 'split-active'
  const menuShown =
    phase.kind === 'menu-open' || phase.kind === 'menu-active' || phase.kind === 'menu-click'
  const splitRowActive = phase.kind === 'menu-active' || phase.kind === 'menu-click'
  const showRipple = phase.kind === 'right-click' || phase.kind === 'menu-click'
  const running = RUN_QUEUE[runIdx] ?? RUN_QUEUE[0]
  const promptAccentClass = isTwoAgentsChecklist ? 'text-foreground' : 'text-[color:var(--warning)]'

  return (
    <div
      ref={panelRef}
      className="border-border bg-card text-foreground relative overflow-hidden border"
    >
      {/* Faux titlebar — three traffic lights, nothing else. */}
      <div className="border-border bg-muted/40 flex h-7 items-center gap-1.5 border-b px-3">
        <span className="size-2.5 bg-rose-400/70" />
        <span className="size-2.5 bg-[color-mix(in_srgb,var(--warning)_70%,transparent)]" />
        <span className="size-2.5 bg-[color-mix(in_srgb,var(--success)_70%,transparent)]" />
      </div>

      {/* Why: onboarding previews can flip theme without remounting this visual;
          token-backed terminal chrome follows explicit and system theme changes. */}
      <div
        className={cn(
          'grid bg-[var(--editor-surface)] font-mono text-[11px]',
          reducedMotion
            ? 'transition-none'
            : 'transition-[grid-template-columns] duration-[600ms] ease-[cubic-bezier(.2,.8,.2,1)]',
          splitOpen ? 'grid-cols-[1fr_1fr]' : 'grid-cols-[1fr_0fr]'
        )}
        style={{ minHeight: 230 }}
      >
        {/* Left pane: source work that remains visible after the split. */}
        <div ref={leftPaneRef} className="relative flex min-w-0 flex-col gap-1.5 px-3 py-2.5">
          {isTwoAgentsChecklist ? <ClaudeChecklistPane /> : <PlaywrightPane running={running} />}

          {/* Right-click context menu — theme card, skeleton bars for the
              other items, real labels only for the two split actions. */}
          <ContextMenu
            shown={menuShown}
            splitRowActive={splitRowActive}
            setSplitRow={setSplitRow}
            splitRightShortcutLabel={splitRightShortcutLabel}
            splitDownShortcutLabel={splitDownShortcutLabel}
          />
        </div>

        {/* Right pane: empty until the split lands, then an agent session. */}
        <div
          className={cn(
            'flex min-w-0 flex-col gap-1.5 overflow-hidden border-l border-border px-3 py-2.5 transition-[opacity,transform] duration-[480ms] ease-[cubic-bezier(.2,.8,.2,1)]',
            reducedMotion ? 'transition-none' : null,
            splitOpen ? 'opacity-100' : 'translate-x-2 opacity-0'
          )}
          style={{ transitionDelay: splitOpen ? '200ms' : '0ms' }}
        >
          <RightPaneScrollback
            lines={rightLines}
            isCodex={isTwoAgentsChecklist}
            promptAccentClass={promptAccentClass}
          />
          {showInputLine ? (
            <TermLine wrap>
              <Prompt claude={promptGlyph === '>'}>{promptGlyph}</Prompt>
              <span className="text-foreground">{rightTyped}</span>
              {showCaret ? (
                <span className="bg-foreground ml-px inline-block h-[11px] w-[5px] -translate-y-px animate-pulse align-[-1px]" />
              ) : null}
            </TermLine>
          ) : null}
        </div>
      </div>

      {/* Fake cursor overlay — moves between the pane prompt and the
          highlighted split-row inside the menu. */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute left-0 top-0 z-20 transition-[opacity,transform] duration-700 ease-[cubic-bezier(.45,.05,.2,1)]',
          cursor.visible ? 'opacity-100' : 'opacity-0'
        )}
        style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
      >
        <div className="relative">
          <CursorIcon />
          {showRipple ? <FeatureWallClickRing key={rippleKey} /> : null}
        </div>
      </div>

      {isTwoAgentsChecklist ? null : (
        /* Standalone keyboard hint stays inside the visual so the tour copy can
            remain a single subheader line. */
        <div className="border-border bg-card text-muted-foreground border-t px-3 py-2 text-[11px]">
          {translate(
            'auto.components.feature.wall.WorkbenchAnimatedVisual.0bc9ad0cd1',
            'Same pane:'
          )}
          <kbd className={KBD_CLASS}>{splitRightShortcutLabel}</kbd>{' '}
          {translate(
            'auto.components.feature.wall.WorkbenchAnimatedVisual.a2b114dad0',
            'splits right ·'
          )}{' '}
          <kbd className={KBD_CLASS}>{splitDownShortcutLabel}</kbd>{' '}
          {translate(
            'auto.components.feature.wall.WorkbenchAnimatedVisual.16877e038d',
            'splits down'
          )}
        </div>
      )}
    </div>
  )
}
